import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const buildingId = searchParams.get("buildingId");
    const citySlug = searchParams.get("citySlug");
    const neighborhoodSlug = searchParams.get("neighborhoodSlug");
    const minPrice = searchParams.get("minPrice");
    const maxPrice = searchParams.get("maxPrice");

    if (!buildingId || !citySlug) {
      return NextResponse.json(
        { error: "buildingId and citySlug are required" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Get city ID
    const { data: city } = await supabase
      .from("cities")
      .select("id")
      .eq("slug", citySlug)
      .single();

    if (!city) {
      return NextResponse.json({ listings: [] });
    }

    // Build query for similar buildings
    let query = supabase
      .from("buildings")
      .select(`
        id,
        name,
        address_1,
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
          neighborhoods:neighborhood_id (name, slug)
        `)
        .eq("city_id", city.id)
        .eq("status", "active")
        .neq("id", buildingId)
        .limit(5);

      if (!fallbackBuildings || fallbackBuildings.length === 0) {
        return NextResponse.json({ listings: [] });
      }

      // Process fallback buildings
      return await processBuildings(supabase, fallbackBuildings, minPrice, maxPrice);
    }

    return await processBuildings(supabase, buildings, minPrice, maxPrice);
  } catch (error) {
    console.error("Similar listings error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function processBuildings(
  supabase: ReturnType<typeof createAdminClient>,
  buildings: Array<{
    id: string;
    name: string;
    address_1: string;
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
    return NextResponse.json({ listings: [] });
  }

  const unitIds = units.map((u) => u.id);

  // Get latest prices
  const { data: prices } = await supabase
    .from("unit_price_snapshots")
    .select("unit_id, rent")
    .in("unit_id", unitIds)
    .order("captured_at", { ascending: false });

  const priceByUnit: Record<string, number> = {};
  for (const p of prices || []) {
    if (!priceByUnit[p.unit_id]) {
      priceByUnit[p.unit_id] = p.rent;
    }
  }

  // Get building images
  const { data: images } = await supabase
    .from("building_images")
    .select("building_id, url")
    .in("building_id", buildingIds)
    .eq("is_primary", true);

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

  // Format response
  const listings = buildings
    .filter((b) => buildingData[b.id])
    .map((b) => {
      const data = buildingData[b.id];
      const neighborhood = Array.isArray(b.neighborhoods)
        ? b.neighborhoods[0]
        : b.neighborhoods;

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
      };
    })
    .slice(0, 5);

  return NextResponse.json({ listings });
}
