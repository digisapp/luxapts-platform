import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

interface CompareBody {
  building_a_id: string;
  building_b_id: string;
  beds?: number;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CompareBody;

    if (!body.building_a_id || !body.building_b_id) {
      return NextResponse.json(
        { error: "building_a_id and building_b_id are required" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Fetch both buildings
    const [aRes, bRes] = await Promise.all([
      supabase
        .from("buildings")
        .select("id, name, pet_policy, parking_policy, city_id, neighborhood_id, address_1, zip")
        .eq("id", body.building_a_id)
        .single(),
      supabase
        .from("buildings")
        .select("id, name, pet_policy, parking_policy, city_id, neighborhood_id, address_1, zip")
        .eq("id", body.building_b_id)
        .single(),
    ]);

    if (aRes.error || bRes.error) {
      return NextResponse.json({ error: "Building not found" }, { status: 404 });
    }

    // Fetch amenities for both buildings
    const [aAmenitiesRes, bAmenitiesRes] = await Promise.all([
      supabase
        .from("building_amenities")
        .select("amenities(name)")
        .eq("building_id", body.building_a_id),
      supabase
        .from("building_amenities")
        .select("amenities(name)")
        .eq("building_id", body.building_b_id),
    ]);

    const extractAmenityName = (x: unknown): string | undefined => {
      const item = x as { amenities: { name: string } | { name: string }[] | null };
      if (!item.amenities) return undefined;
      if (Array.isArray(item.amenities)) return item.amenities[0]?.name;
      return item.amenities.name;
    };

    const aAmenities = new Set(
      (aAmenitiesRes.data || [])
        .map(extractAmenityName)
        .filter(Boolean) as string[]
    );
    const bAmenities = new Set(
      (bAmenitiesRes.data || [])
        .map(extractAmenityName)
        .filter(Boolean) as string[]
    );

    // Calculate price stats for each building
    async function getPriceStats(buildingId: string) {
      const unitsRes = await supabase
        .from("units")
        .select("id, beds")
        .eq("building_id", buildingId);

      if (unitsRes.error || !unitsRes.data?.length) {
        return { by_beds: {}, captured_at_max: null };
      }

      const unitIds = unitsRes.data.map((u) => u.id);

      const snapsRes = await supabase
        .from("unit_price_snapshots")
        .select("unit_id, rent, captured_at")
        .in("unit_id", unitIds)
        .order("captured_at", { ascending: false });

      if (snapsRes.error) {
        return { by_beds: {}, captured_at_max: null };
      }

      // Get latest price per unit
      const latestByUnit = new Map<string, { rent: number; captured_at: string }>();
      for (const s of snapsRes.data || []) {
        if (!latestByUnit.has(s.unit_id)) {
          latestByUnit.set(s.unit_id, { rent: s.rent, captured_at: s.captured_at });
        }
      }

      // Group by beds
      const rentsByBeds: Record<string, number[]> = {};
      for (const u of unitsRes.data) {
        const snap = latestByUnit.get(u.id);
        if (!snap || u.beds == null) continue;
        const key = String(u.beds);
        if (!rentsByBeds[key]) rentsByBeds[key] = [];
        rentsByBeds[key].push(snap.rent);
      }

      // Calculate stats
      const stats: Record<string, { min: number; median: number; max: number }> = {};
      for (const [beds, rents] of Object.entries(rentsByBeds)) {
        rents.sort((x, y) => x - y);
        const min = rents[0];
        const max = rents[rents.length - 1];
        const mid = Math.floor(rents.length / 2);
        const median = rents.length % 2
          ? rents[mid]
          : Math.round((rents[mid - 1] + rents[mid]) / 2);
        stats[beds] = { min, median, max };
      }

      const captured_at_max = snapsRes.data?.[0]?.captured_at || null;
      return { by_beds: stats, captured_at_max };
    }

    const [aStats, bStats] = await Promise.all([
      getPriceStats(body.building_a_id),
      getPriceStats(body.building_b_id),
    ]);

    // Calculate deltas
    const amenities_only_in_a = [...aAmenities].filter((x) => !bAmenities.has(x));
    const amenities_only_in_b = [...bAmenities].filter((x) => !aAmenities.has(x));

    const captured_at_max = [aStats.captured_at_max, bStats.captured_at_max]
      .filter(Boolean)
      .sort()
      .reverse()[0] || null;

    return NextResponse.json({
      captured_at_max,
      building_a: {
        ...aRes.data,
        amenities: [...aAmenities],
        policies: {
          pets: aRes.data.pet_policy,
          parking: aRes.data.parking_policy,
        },
        price_stats: { by_beds: aStats.by_beds },
      },
      building_b: {
        ...bRes.data,
        amenities: [...bAmenities],
        policies: {
          pets: bRes.data.pet_policy,
          parking: bRes.data.parking_policy,
        },
        price_stats: { by_beds: bStats.by_beds },
      },
      deltas: {
        amenities_only_in_a,
        amenities_only_in_b,
      },
    });
  } catch (error) {
    console.error("Compare error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
