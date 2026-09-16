import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-helpers";
import { fetchAllRows, getFirstRelation } from "@/lib/db-helpers";
import { isValidUUID, safeParseInt } from "@/lib/utils";
import { chunk, IN_CHUNK_SIZE } from "@/lib/search/fetch-enrichments";

const DEFAULT_DAYS = 90;
const MIN_DAYS = 7;
const MAX_DAYS = 365;

interface UnitInfo {
  beds: number;
  baths: number;
  sqft: number | null;
}

interface RawPriceSnapshot {
  unit_id: string;
  rent: number;
  captured_at: string;
  units: UnitInfo | UnitInfo[] | null;
}

interface PriceSnapshot {
  unit_id: string;
  rent: number;
  captured_at: string;
  unit?: UnitInfo;
}

function normalizeSnapshot(raw: RawPriceSnapshot): PriceSnapshot {
  return {
    unit_id: raw.unit_id,
    rent: raw.rent,
    captured_at: raw.captured_at,
    unit: getFirstRelation(raw.units) || undefined,
  };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: buildingId } = await params;
    if (!isValidUUID(buildingId)) {
      return apiError("Invalid building ID");
    }

    const { searchParams } = new URL(req.url);
    // `days=abc` used to reach `new Date().setDate(NaN)` and 500 with a
    // RangeError; clamp to a sane window instead.
    const days = safeParseInt(searchParams.get("days"), DEFAULT_DAYS, MIN_DAYS, MAX_DAYS);
    const bedsParam = searchParams.get("beds");
    const bedsFilter = bedsParam !== null ? safeParseInt(bedsParam, -1, 0, 10) : -1;

    const supabase = createAdminClient();

    // Get building info
    const { data: building, error: buildingError } = await supabase
      .from("buildings")
      .select("id, name")
      .eq("id", buildingId)
      .single();

    if (buildingError || !building) {
      return apiError("Building not found", 404);
    }

    // Get units for this building (paged — never silently capped at 1000)
    const units = await fetchAllRows<{ id: string }>((from, to) => {
      let q = supabase
        .from("units")
        .select("id")
        .eq("building_id", buildingId);
      if (bedsFilter >= 0) q = q.eq("beds", bedsFilter);
      return q.order("id").range(from, to);
    });
    const unitIds = units.map((u) => u.id);

    if (!unitIds.length) {
      return NextResponse.json({
        building: building.name,
        building_id: building.id,
        days,
        history: [],
        summary: null,
        by_bedroom: [],
      });
    }

    // Calculate date range
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startIso = startDate.toISOString();

    // Price snapshots: unit ids are chunked (long `.in()` URLs fail) and each
    // chunk is paged newest-first so a busy building's 1000-row cap trims the
    // oldest captures, not the newest.
    const snapshotPages = await Promise.all(
      chunk(unitIds, IN_CHUNK_SIZE).map((ids) =>
        fetchAllRows<RawPriceSnapshot>((from, to) =>
          supabase
            .from("unit_price_snapshots")
            .select(`
              unit_id,
              rent,
              captured_at,
              units:unit_id (beds, baths, sqft)
            `)
            .in("unit_id", ids)
            .gte("captured_at", startIso)
            .order("captured_at", { ascending: false })
            .order("id", { ascending: true })
            .range(from, to) as unknown as PromiseLike<{ data: RawPriceSnapshot[] | null; error: unknown }>
        )
      )
    );

    // Normalize snapshots to handle Supabase array/object differences, oldest first
    const normalizedSnapshots = snapshotPages
      .flat()
      .map(normalizeSnapshot)
      .sort((a, b) => a.captured_at.localeCompare(b.captured_at));

    // Group by date and calculate averages
    const dailyPrices: Record<string, { total: number; count: number; min: number; max: number }> = {};

    for (const snap of normalizedSnapshots) {
      const date = snap.captured_at.split("T")[0];
      if (!dailyPrices[date]) {
        dailyPrices[date] = { total: 0, count: 0, min: Infinity, max: -Infinity };
      }
      dailyPrices[date].total += snap.rent;
      dailyPrices[date].count++;
      dailyPrices[date].min = Math.min(dailyPrices[date].min, snap.rent);
      dailyPrices[date].max = Math.max(dailyPrices[date].max, snap.rent);
    }

    // Format history
    const history = Object.entries(dailyPrices)
      .map(([date, data]) => ({
        date,
        avg_rent: Math.round(data.total / data.count),
        min_rent: data.min,
        max_rent: data.max,
        units_counted: data.count,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Calculate summary
    const allRents = normalizedSnapshots.map((s) => s.rent);
    let minRent = Infinity;
    let maxRent = -Infinity;
    let totalRent = 0;
    for (const rent of allRents) {
      if (rent < minRent) minRent = rent;
      if (rent > maxRent) maxRent = rent;
      totalRent += rent;
    }
    const summary = allRents.length > 0 ? {
      current_avg: Math.round(totalRent / allRents.length),
      current_min: minRent,
      current_max: maxRent,
      total_snapshots: allRents.length,
      // Price change (if we have history)
      change_30d: history.length >= 2
        ? history[history.length - 1].avg_rent - history[0].avg_rent
        : null,
      change_pct_30d: history.length >= 2
        ? Math.round(((history[history.length - 1].avg_rent - history[0].avg_rent) / history[0].avg_rent) * 100 * 10) / 10
        : null,
    } : null;

    // Group by bedroom type
    const byBedroom: Record<number, { avg: number; min: number; max: number; count: number }> = {};
    for (const snap of normalizedSnapshots) {
      const beds = snap.unit?.beds ?? 0;
      if (!byBedroom[beds]) {
        byBedroom[beds] = { avg: 0, min: Infinity, max: -Infinity, count: 0 };
      }
      byBedroom[beds].avg += snap.rent;
      byBedroom[beds].min = Math.min(byBedroom[beds].min, snap.rent);
      byBedroom[beds].max = Math.max(byBedroom[beds].max, snap.rent);
      byBedroom[beds].count++;
    }

    // Calculate averages
    const pricesByBedroom = Object.entries(byBedroom).map(([beds, data]) => ({
      beds: parseInt(beds),
      label: parseInt(beds) === 0 ? "Studio" : `${beds}BR`,
      avg_rent: Math.round(data.avg / data.count),
      min_rent: data.min,
      max_rent: data.max,
      units: data.count,
    })).sort((a, b) => a.beds - b.beds);

    return NextResponse.json({
      building: building.name,
      building_id: building.id,
      days,
      history,
      summary,
      by_bedroom: pricesByBedroom,
    });
  } catch (error) {
    console.error("Price history error:", error);
    return apiError("Internal server error", 500);
  }
}
