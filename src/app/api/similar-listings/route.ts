import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-helpers";
import { getFirstRelation } from "@/lib/db-helpers";

// Public read-only data — let the CDN serve it (5 min fresh, 1 h stale-while-revalidate)
const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
};

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const buildingId = searchParams.get("buildingId");
    const citySlug = searchParams.get("citySlug");
    const neighborhoodSlug = searchParams.get("neighborhoodSlug");
    const minPrice = searchParams.get("minPrice");
    const maxPrice = searchParams.get("maxPrice");

    if (!buildingId || !citySlug) {
      return apiError("buildingId and citySlug are required");
    }

    const supabase = createAdminClient();

    // Get city ID
    const { data: city } = await supabase
      .from("cities")
      .select("id")
      .eq("slug", citySlug)
      .single();

    if (!city) {
      return NextResponse.json({ listings: [] }, { headers: CACHE_HEADERS });
    }

    // Build query for similar buildings
    let query = supabase
      .from("buildings")
      .select(`
        id,
        name,
        address_1,
        pet_policy,
        parking_policy,
        neighborhoods:neighborhood_id (name, slug)
      `)
      .eq("city_id", city.id)
      .eq("status", "active")
      .neq("id", buildingId)
      .limit(10);

    // Prefer same neighborhood
    if (neighborhoodSlug) {
      const { data: neighborhood } = await supabase
        .from("neighborhoods")
        .select("id")
        .eq("slug", neighborhoodSlug)
        .eq("city_id", city.id)
        .single();

      if (neighborhood) {
        query = query.eq("neighborhood_id", neighborhood.id);
      }
    }

    const { data: buildings } = await query;

    if (!buildings || buildings.length === 0) {
      // If no buildings in same neighborhood, get any in city
      const { data: fallbackBuildings } = await supabase
        .from("buildings")
        .select(`
          id,
          name,
          address_1,
          pet_policy,
          parking_policy,
          neighborhoods:neighborhood_id (name, slug)
        `)
        .eq("city_id", city.id)
        .eq("status", "active")
        .neq("id", buildingId)
        .limit(5);

      if (!fallbackBuildings || fallbackBuildings.length === 0) {
        return NextResponse.json({ listings: [] }, { headers: CACHE_HEADERS });
      }

      // Process fallback buildings
      return await processBuildings(supabase, fallbackBuildings, minPrice, maxPrice);
    }

    return await processBuildings(supabase, buildings, minPrice, maxPrice);
  } catch (error) {
    console.error("Similar listings error:", error);
    return apiError("Internal server error", 500);
  }
}

async function processBuildings(
  supabase: ReturnType<typeof createAdminClient>,
  buildings: Array<{
    id: string;
    name: string;
    address_1: string;
    pet_policy: string | null;
    parking_policy: string | null;
    neighborhoods: { name: string; slug: string } | { name: string; slug: string }[] | null;
  }>,
  minPrice: string | null,
  maxPrice: string | null
) {
  const buildingIds = buildings.map((b) => b.id);

  // Get available units with prices
  const { data: units } = await supabase
    .from("units")
    .select("id, building_id, beds, baths")
    .in("building_id", buildingIds)
    .eq("is_available", true);

  if (!units || units.length === 0) {
    return NextResponse.json({ listings: [] }, { headers: CACHE_HEADERS });
  }

  const unitIds = units.map((u) => u.id);

  // Fetch prices and images in parallel
  const [{ data: prices }, { data: images }] = await Promise.all([
    supabase
      .from("latest_unit_prices")
      .select("unit_id, rent")
      .in("unit_id", unitIds),
    supabase
      .from("building_images")
      .select("building_id, url")
      .in("building_id", buildingIds)
      .eq("is_primary", true),
  ]);

  const priceByUnit: Record<string, number> = {};
  for (const p of prices || []) {
    if (!priceByUnit[p.unit_id]) {
      priceByUnit[p.unit_id] = p.rent;
    }
  }

  const imageByBuilding: Record<string, string> = {};
  for (const img of images || []) {
    imageByBuilding[img.building_id] = img.url;
  }

  // Aggregate data by building
  const buildingData: Record<
    string,
    { minPrice: number; maxPrice: number; minBeds: number; maxBeds: number; unitCount: number }
  > = {};

  for (const unit of units) {
    const price = priceByUnit[unit.id];
    if (!price) continue;

    // Apply price filter
    if (minPrice && price < parseInt(minPrice) * 0.7) continue;
    if (maxPrice && price > parseInt(maxPrice) * 1.3) continue;

    if (!buildingData[unit.building_id]) {
      buildingData[unit.building_id] = {
        minPrice: price,
        maxPrice: price,
        minBeds: unit.beds || 0,
        maxBeds: unit.beds || 0,
        unitCount: 0,
      };
    }

    const bd = buildingData[unit.building_id];
    bd.minPrice = Math.min(bd.minPrice, price);
    bd.maxPrice = Math.max(bd.maxPrice, price);
    bd.minBeds = Math.min(bd.minBeds, unit.beds || 0);
    bd.maxBeds = Math.max(bd.maxBeds, unit.beds || 0);
    bd.unitCount++;
  }

  // Format response — only include buildings with real images
  const listings = buildings
    .filter((b) => buildingData[b.id] && imageByBuilding[b.id])
    .map((b) => {
      const data = buildingData[b.id];
      const neighborhood = getFirstRelation(b.neighborhoods);

      return {
        id: b.id,
        name: b.name,
        address: b.address_1,
        neighborhood: neighborhood?.name || "",
        image: imageByBuilding[b.id],
        minPrice: data.minPrice,
        minBeds: data.minBeds,
        maxBeds: data.maxBeds,
        unitCount: data.unitCount,
        petPolicy: b.pet_policy,
        parkingPolicy: b.parking_policy,
      };
    })
    .slice(0, 5);

  return NextResponse.json({ listings }, { headers: CACHE_HEADERS });
}
