import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { isValidUUID } from "@/lib/utils";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Validate UUID to prevent invalid queries
    if (!isValidUUID(id)) {
      return NextResponse.json({ error: "Invalid building ID" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Fetch building with relations first (needed to validate existence)
    const buildingRes = await supabase
      .from("buildings")
      .select(`
        *,
        cities:city_id (id, name, slug, state),
        neighborhoods:neighborhood_id (id, name, slug)
      `)
      .eq("id", id)
      .single();

    if (buildingRes.error || !buildingRes.data) {
      return NextResponse.json({ error: "Building not found" }, { status: 404 });
    }

    // Fetch amenities, floorplans, units, and facts in parallel
    const [amenitiesRes, floorplansRes, unitsRes, factsRes] = await Promise.all([
      supabase
        .from("building_amenities")
        .select("details, amenities(id, name, category, icon)")
        .eq("building_id", id),
      supabase
        .from("floorplans")
        .select("*")
        .eq("building_id", id)
        .order("beds", { ascending: true }),
      supabase
        .from("units")
        .select("*")
        .eq("building_id", id)
        .eq("is_available", true),
      supabase
        .from("building_facts")
        .select("key, value, source, updated_at")
        .eq("building_id", id),
    ]);

    // Get latest prices for units (depends on unitsRes)
    const unitPrices: Record<string, { rent: number; captured_at: string }> = {};
    if (unitsRes.data?.length) {
      const unitIds = unitsRes.data.map((u) => u.id);
      const pricesRes = await supabase
        .from("unit_price_snapshots")
        .select("unit_id, rent, net_effective_rent, lease_term_months, captured_at")
        .in("unit_id", unitIds)
        .order("captured_at", { ascending: false });

      for (const p of pricesRes.data || []) {
        if (!unitPrices[p.unit_id]) {
          unitPrices[p.unit_id] = { rent: p.rent, captured_at: p.captured_at };
        }
      }
    }

    // Calculate price range
    const prices = Object.values(unitPrices).map((p) => p.rent);
    const priceRange = prices.length
      ? { min: Math.min(...prices), max: Math.max(...prices) }
      : null;

    return NextResponse.json({
      building: {
        ...buildingRes.data,
        amenities: (amenitiesRes.data || []).map((a) => ({
          ...a.amenities,
          details: a.details,
        })),
        floorplans: floorplansRes.data || [],
        units: (unitsRes.data || []).map((u) => ({
          ...u,
          latest_price: unitPrices[u.id] || null,
        })),
        facts: factsRes.data || [],
        price_range: priceRange,
      },
    });
  } catch (error) {
    console.error("Get building error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
