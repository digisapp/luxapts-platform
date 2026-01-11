import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const supabase = createAdminClient();

    // Get neighborhood with city info
    const { data: neighborhood, error } = await supabase
      .from("neighborhoods")
      .select(`
        id,
        name,
        slug,
        description,
        cities:city_id (id, name, slug, state)
      `)
      .eq("slug", slug)
      .single();

    if (error || !neighborhood) {
      return NextResponse.json(
        { error: "Neighborhood not found" },
        { status: 404 }
      );
    }

    // Get buildings in this neighborhood
    const { data: buildings } = await supabase
      .from("buildings")
      .select("id, name")
      .eq("neighborhood_id", neighborhood.id)
      .eq("status", "active");

    const buildingIds = buildings?.map((b) => b.id) || [];
    const buildingCount = buildingIds.length;

    // Get available units
    const { data: units } = await supabase
      .from("units")
      .select("id, beds, baths, sqft")
      .in("building_id", buildingIds)
      .eq("is_available", true);

    const unitIds = units?.map((u) => u.id) || [];
    const unitCount = unitIds.length;

    // Get price stats
    let priceStats = { min: 0, max: 0, avg: 0 };
    if (unitIds.length > 0) {
      const { data: prices } = await supabase
        .from("unit_price_snapshots")
        .select("unit_id, rent")
        .in("unit_id", unitIds)
        .order("captured_at", { ascending: false });

      // Get latest price per unit
      const latestPrices: Record<string, number> = {};
      for (const p of prices || []) {
        if (!latestPrices[p.unit_id]) {
          latestPrices[p.unit_id] = p.rent;
        }
      }

      const priceValues = Object.values(latestPrices);
      if (priceValues.length > 0) {
        priceStats = {
          min: Math.min(...priceValues),
          max: Math.max(...priceValues),
          avg: Math.round(priceValues.reduce((a, b) => a + b, 0) / priceValues.length),
        };
      }
    }

    // Get bed distribution
    const bedCounts: Record<number, number> = {};
    for (const unit of units || []) {
      const beds = unit.beds ?? 0;
      bedCounts[beds] = (bedCounts[beds] || 0) + 1;
    }

    // Generate neighborhood description if not exists
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cityData = neighborhood.cities as any;
    const cityName = Array.isArray(cityData) ? cityData[0]?.name : cityData?.name;
    const description = neighborhood.description || generateDescription(
      neighborhood.name,
      cityName || "",
      buildingCount,
      priceStats
    );

    return NextResponse.json({
      neighborhood: {
        id: neighborhood.id,
        name: neighborhood.name,
        slug: neighborhood.slug,
        description,
        city: neighborhood.cities,
      },
      stats: {
        buildingCount,
        unitCount,
        priceStats,
        bedDistribution: bedCounts,
      },
      buildings: buildings?.slice(0, 10) || [],
    });
  } catch (error) {
    console.error("Neighborhood API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

function generateDescription(
  neighborhood: string,
  city: string,
  buildingCount: number,
  priceStats: { min: number; max: number; avg: number }
): string {
  const priceRange = priceStats.min && priceStats.max
    ? `Rents typically range from $${priceStats.min.toLocaleString()} to $${priceStats.max.toLocaleString()} per month.`
    : "";

  const buildingInfo = buildingCount > 0
    ? `With ${buildingCount} luxury building${buildingCount > 1 ? "s" : ""}, ${neighborhood} offers a variety of modern apartments.`
    : "";

  return `${neighborhood} is one of ${city}'s most desirable neighborhoods for luxury apartment living. ${buildingInfo} ${priceRange}`.trim();
}
