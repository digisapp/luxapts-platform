import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { fetchAllRows, getFirstRelation } from "@/lib/db-helpers";
import { fetchAvailableUnitPrices } from "@/lib/search/fetch-enrichments";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const citySlug = req.nextUrl.searchParams.get("city");
    const supabase = createAdminClient();

    // neighborhoods.slug is unique per (city_id, slug), not globally: shared
    // names like "downtown" / "midtown" exist in several cities, and .single()
    // turned that into a PGRST116 error → a bogus 404. Scope by ?city=<slug>
    // when supplied, otherwise take the first match by name.
    let neighborhoodQuery = supabase
      .from("neighborhoods")
      .select(`
        id,
        name,
        slug,
        description,
        cities:city_id (id, name, slug, state)
      `)
      .eq("slug", slug);

    if (citySlug) {
      const { data: city } = await supabase
        .from("cities")
        .select("id")
        .eq("slug", citySlug)
        .maybeSingle();
      if (!city) {
        return NextResponse.json({ error: "Neighborhood not found" }, { status: 404 });
      }
      neighborhoodQuery = neighborhoodQuery.eq("city_id", city.id);
    }

    const { data: neighborhood, error } = await neighborhoodQuery
      .order("name")
      .limit(1)
      .maybeSingle();

    if (error || !neighborhood) {
      return NextResponse.json(
        { error: "Neighborhood not found" },
        { status: 404 }
      );
    }

    // Get buildings in this neighborhood (paged past the 1000-row cap)
    const buildings = await fetchAllRows<{ id: string; name: string }>((from, to) =>
      supabase
        .from("buildings")
        .select("id, name")
        .eq("neighborhood_id", neighborhood.id)
        .eq("status", "active")
        .order("name")
        .order("id")
        .range(from, to)
    );

    const buildingIds = buildings.map((b) => b.id);
    const buildingCount = buildingIds.length;

    // Available units + their latest rent in one chunked, paged read of
    // units_with_latest_price. The old version fetched the full
    // unit_price_snapshots history through an unbounded `.in(unitIds)`, which
    // failed past ~150 units and was capped at 1000 rows long before that.
    const units = await fetchAvailableUnitPrices<{
      id: string;
      building_id: string;
      latest_rent: number | null;
      beds: number | null;
      baths: number | null;
      sqft: number | null;
    }>(supabase, buildingIds, ["beds", "baths", "sqft"]);

    const unitCount = units.length;

    // Get price stats
    let priceStats = { min: 0, max: 0, avg: 0 };
    const priceValues = units
      .map((u) => u.latest_rent)
      .filter((rent): rent is number => rent != null);
    if (priceValues.length > 0) {
      priceStats = {
        min: Math.min(...priceValues),
        max: Math.max(...priceValues),
        avg: Math.round(priceValues.reduce((a, b) => a + b, 0) / priceValues.length),
      };
    }

    // Get bed distribution
    const bedCounts: Record<number, number> = {};
    for (const unit of units) {
      const beds = unit.beds ?? 0;
      bedCounts[beds] = (bedCounts[beds] || 0) + 1;
    }

    // Generate neighborhood description if not exists
    const cityName = getFirstRelation(neighborhood.cities)?.name ?? "";
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
      buildings: buildings.slice(0, 10),
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
