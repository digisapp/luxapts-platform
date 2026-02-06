import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

interface PriceSnapshot {
  unit_id: string;
  rent: number;
  captured_at: string;
  units: {
    beds: number;
    baths: number;
    sqft: number | null;
  };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: buildingId } = await params;
    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get("days") || "90");
    const beds = searchParams.get("beds");

    const supabase = createAdminClient();

    // Get building info
    const { data: building, error: buildingError } = await supabase
      .from("buildings")
      .select("id, name")
      .eq("id", buildingId)
      .single();

    if (buildingError || !building) {
      return NextResponse.json({ error: "Building not found" }, { status: 404 });
    }

    // Get units for this building
    let unitsQuery = supabase
      .from("units")
      .select("id, beds, baths, sqft")
      .eq("building_id", buildingId);

    if (beds !== null && beds !== undefined) {
      unitsQuery = unitsQuery.eq("beds", parseInt(beds));
    }

    const { data: units } = await unitsQuery;
    const unitIds = units?.map((u) => u.id) || [];

    if (!unitIds.length) {
      return NextResponse.json({
        building: building.name,
        days,
        history: [],
        summary: null,
      });
    }

    // Calculate date range
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get price snapshots
    const { data: snapshots, error: snapshotsError } = await supabase
      .from("unit_price_snapshots")
      .select(`
        unit_id,
        rent,
        captured_at,
        units:unit_id (beds, baths, sqft)
      `)
      .in("unit_id", unitIds)
      .gte("captured_at", startDate.toISOString())
      .order("captured_at", { ascending: true });

    if (snapshotsError) {
      return NextResponse.json({ error: snapshotsError.message }, { status: 500 });
    }

    // Group by date and calculate averages
    const dailyPrices: Record<string, { total: number; count: number; min: number; max: number }> = {};

    for (const snap of (snapshots as PriceSnapshot[]) || []) {
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
    const allRents = (snapshots as PriceSnapshot[])?.map((s) => s.rent) || [];
    const summary = allRents.length > 0 ? {
      current_avg: Math.round(allRents.reduce((a, b) => a + b, 0) / allRents.length),
      current_min: Math.min(...allRents),
      current_max: Math.max(...allRents),
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
    for (const snap of (snapshots as PriceSnapshot[]) || []) {
      const beds = snap.units?.beds ?? 0;
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
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
