import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

interface BrowseBody {
  city_slug?: string;
  limit?: number;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as BrowseBody;
    const limit = Math.min(Math.max(body.limit ?? 20, 1), 100);

    const supabase = createAdminClient();

    // Build query for buildings
    let query = supabase
      .from("buildings")
      .select(`
        id, name, address_1, zip, year_built, stories,
        pet_policy, parking_policy, description,
        cities:city_id (id, name, slug),
        neighborhoods:neighborhood_id (id, name, slug)
      `)
      .eq("status", "active")
      .limit(limit);

    // Filter by city if provided
    if (body.city_slug) {
      const { data: city } = await supabase
        .from("cities")
        .select("id")
        .eq("slug", body.city_slug)
        .single();

      if (city) {
        query = query.eq("city_id", city.id);
      }
    }

    const { data: buildings, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get building facts for all buildings (rent ranges, images)
    const buildingIds = buildings?.map(b => b.id) || [];

    const { data: facts } = await supabase
      .from("building_facts")
      .select("building_id, key, value")
      .in("building_id", buildingIds)
      .in("key", ["rent_min", "rent_max", "image_exterior", "move_in_specials", "total_units"]);

    // Map facts by building
    const factsMap: Record<string, Record<string, string | number>> = {};
    for (const f of facts || []) {
      if (!factsMap[f.building_id]) {
        factsMap[f.building_id] = {};
      }
      factsMap[f.building_id][f.key] = f.value as string | number;
    }

    // Format response
    const results = (buildings || []).map(b => ({
      id: b.id,
      name: b.name,
      address: b.address_1,
      zip: b.zip,
      year_built: b.year_built,
      stories: b.stories,
      pet_policy: b.pet_policy,
      description: b.description,
      city: b.cities,
      neighborhood: b.neighborhoods,
      rent_min: factsMap[b.id]?.rent_min || null,
      rent_max: factsMap[b.id]?.rent_max || null,
      image: factsMap[b.id]?.image_exterior || null,
      move_in_specials: factsMap[b.id]?.move_in_specials || null,
      total_units: factsMap[b.id]?.total_units || null,
    }));

    return NextResponse.json({
      total: results.length,
      results,
    });
  } catch (error) {
    console.error("Browse error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  // Support city filter via query params
  const { searchParams } = new URL(req.url);
  const citySlug = searchParams.get("city");
  const neighborhoodSlug = searchParams.get("neighborhood");
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50"), 1), 100);

  const supabase = createAdminClient();

  // Build query
  let query = supabase
    .from("buildings")
    .select(`
      id, name, address_1,
      cities:city_id (id, name, slug),
      neighborhoods:neighborhood_id (id, name, slug)
    `)
    .eq("status", "active");

  // Filter by city if provided
  if (citySlug) {
    const { data: city } = await supabase
      .from("cities")
      .select("id")
      .eq("slug", citySlug)
      .single();

    if (city) {
      query = query.eq("city_id", city.id);

      // Filter by neighborhood if provided (only when city is specified)
      if (neighborhoodSlug) {
        const { data: neighborhood } = await supabase
          .from("neighborhoods")
          .select("id")
          .eq("city_id", city.id)
          .eq("slug", neighborhoodSlug)
          .single();

        if (neighborhood) {
          query = query.eq("neighborhood_id", neighborhood.id);
        }
      }
    }
  }

  const { data: buildings, error } = await query.limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get building facts
  const buildingIds = buildings?.map(b => b.id) || [];

  const { data: facts } = await supabase
    .from("building_facts")
    .select("building_id, key, value")
    .in("building_id", buildingIds)
    .in("key", ["rent_min", "rent_max", "image_exterior"]);

  const factsMap: Record<string, Record<string, string | number>> = {};
  for (const f of facts || []) {
    if (!factsMap[f.building_id]) {
      factsMap[f.building_id] = {};
    }
    factsMap[f.building_id][f.key] = f.value as string | number;
  }

  const results = (buildings || []).map(b => ({
    id: b.id,
    name: b.name,
    address: b.address_1,
    city: b.cities,
    neighborhood: b.neighborhoods,
    rent_min: factsMap[b.id]?.rent_min || null,
    rent_max: factsMap[b.id]?.rent_max || null,
    image: factsMap[b.id]?.image_exterior || null,
  }));

  return NextResponse.json({
    total: results.length,
    results,
  });
}
