import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { filterBuildingsByAmenities } from "@/lib/search/amenity-filter";
import { fetchPriceSnapshots, fetchUnitImages, fetchBuildingImages, fetchFloorplans } from "@/lib/search/fetch-enrichments";

// Cache TTL: 5 minutes. Search results are safe to serve slightly stale —
// availability changes are reflected on the building detail page.
const CACHE_TTL_SECONDS = 300;

export interface SearchParams {
  city_slug: string;
  neighborhood_slugs?: string[];
  beds_min?: number;
  beds_max?: number;
  baths_min?: number;
  budget_min?: number;
  budget_max?: number;
  move_in_date?: string;
  pet_friendly?: boolean;
  parking_required?: boolean;
  amenities_any?: string[];
  amenities_all?: string[];
  sort?: string;
  limit?: number;
}

export interface SearchResult {
  building: unknown;
  unit: {
    id: string;
    unit_number: string | null;
    beds: number | null;
    baths: number | null;
    sqft: number | null;
    available_on: string | null;
    floorplan_id: string | null;
  };
  pricing: unknown;
  images: unknown[];
  floorplan: unknown;
}

export interface SearchResponse {
  city: string;
  captured_at_max: string | null;
  results: SearchResult[];
}

/**
 * Build a deterministic cache key string from search params.
 * Arrays are sorted so ["gym","pool"] and ["pool","gym"] hit the same cache entry.
 */
export function buildCacheKey(params: SearchParams): string {
  const normalized = {
    city: params.city_slug,
    hoods: [...(params.neighborhood_slugs || [])].sort().join(","),
    beds_min: params.beds_min ?? "",
    beds_max: params.beds_max ?? "",
    baths_min: params.baths_min ?? "",
    budget_min: params.budget_min ?? "",
    budget_max: params.budget_max ?? "",
    move_in: params.move_in_date ?? "",
    pet: params.pet_friendly ? "1" : "0",
    parking: params.parking_required ? "1" : "0",
    amenities_any: [...(params.amenities_any || [])].sort().join(","),
    amenities_all: [...(params.amenities_all || [])].sort().join(","),
    sort: params.sort ?? "best_match",
    limit: params.limit ?? 50,
  };
  return JSON.stringify(normalized);
}

async function executeSearch(params: SearchParams): Promise<SearchResponse> {
  const limit = params.limit ?? 50;
  const supabase = createAdminClient();
  const empty: SearchResponse = { city: params.city_slug, captured_at_max: null, results: [] };

  // 1. Resolve city
  const cityRes = await supabase
    .from("cities")
    .select("id, slug, name")
    .eq("slug", params.city_slug)
    .single();

  if (cityRes.error || !cityRes.data) return empty;

  // 2. Build building filter
  let buildingsQuery = supabase
    .from("buildings")
    .select("id")
    .eq("city_id", cityRes.data.id)
    .eq("status", "active");

  if (params.neighborhood_slugs?.length) {
    const neighborhoodRes = await supabase
      .from("neighborhoods")
      .select("id")
      .eq("city_id", cityRes.data.id)
      .in("slug", params.neighborhood_slugs);

    if (neighborhoodRes.data?.length) {
      buildingsQuery = buildingsQuery.in(
        "neighborhood_id",
        neighborhoodRes.data.map((n) => n.id)
      );
    }
  }

  if (params.pet_friendly) {
    buildingsQuery = buildingsQuery
      .not("pet_policy", "is", null)
      .not("pet_policy", "ilike", "%no pet%")
      .not("pet_policy", "ilike", "%not allowed%")
      .not("pet_policy", "ilike", "%no animal%");
  }
  if (params.parking_required) {
    buildingsQuery = buildingsQuery.not("parking_policy", "is", null);
  }

  const buildingsRes = await buildingsQuery;
  if (buildingsRes.error) return empty;

  let buildingIds = buildingsRes.data?.map((b) => b.id) || [];
  if (!buildingIds.length) return empty;

  // 3. Filter by amenities
  buildingIds = await filterBuildingsByAmenities(
    supabase, buildingIds, params.amenities_any, params.amenities_all,
  );
  if (!buildingIds.length) return empty;

  // 4. Get available units
  let unitsQuery = supabase
    .from("units")
    .select(`
      id, building_id, floorplan_id, unit_number, beds, baths, sqft,
      is_available, available_on,
      buildings:building_id (
        id, name, address_1, zip, lat, lng, pet_policy, parking_policy,
        neighborhoods:neighborhood_id ( slug, name )
      )
    `)
    .eq("is_available", true)
    .in("building_id", buildingIds);

  if (typeof params.beds_min === "number") unitsQuery = unitsQuery.gte("beds", params.beds_min);
  if (typeof params.beds_max === "number") unitsQuery = unitsQuery.lte("beds", params.beds_max);
  if (typeof params.baths_min === "number") unitsQuery = unitsQuery.gte("baths", params.baths_min);
  if (params.move_in_date) unitsQuery = unitsQuery.lte("available_on", params.move_in_date);

  const unitsRes = await unitsQuery.limit(limit * 2);
  if (unitsRes.error || !unitsRes.data?.length) return empty;

  const unitIds = unitsRes.data.map((u) => u.id);

  // 5. Fetch enrichments in parallel
  const [{ snapByUnit, capturedAtMax }, imagesByUnit, imagesByBuilding, floorplansByUnit] =
    await Promise.all([
      fetchPriceSnapshots(supabase, unitIds),
      fetchUnitImages(supabase, unitIds),
      fetchBuildingImages(supabase, buildingIds),
      fetchFloorplans(supabase, unitsRes.data),
    ]);

  // 6. Combine + filter
  let results = unitsRes.data
    .map((u) => ({
      unit: u,
      pricing: snapByUnit.get(u.id) || null,
      unitImages: imagesByUnit.get(u.id) || [],
      buildingImages: imagesByBuilding.get(u.building_id) || [],
      floorplan: floorplansByUnit.get(u.id) || null,
    }))
    .filter((row) => {
      if (row.unitImages.length === 0 && row.buildingImages.length === 0) return false;
      const rent = (row.pricing as { rent?: number } | null)?.rent;
      if (!rent) return false;
      if (typeof params.budget_min === "number" && rent < params.budget_min) return false;
      if (typeof params.budget_max === "number" && rent > params.budget_max) return false;
      return true;
    });

  // 7. Sort
  const sort = params.sort || "best_match";
  results.sort((a, b) => {
    const aRent = (a.pricing as { rent?: number } | null)?.rent || 0;
    const bRent = (b.pricing as { rent?: number } | null)?.rent || 0;
    const aAt = (a.pricing as { captured_at?: string } | null)?.captured_at || 0;
    const bAt = (b.pricing as { captured_at?: string } | null)?.captured_at || 0;
    switch (sort) {
      case "price_low": return aRent - bRent;
      case "price_high": return bRent - aRent;
      case "sqft_high": return (b.unit.sqft || 0) - (a.unit.sqft || 0);
      case "newest": return new Date(bAt).getTime() - new Date(aAt).getTime();
      default: return 0;
    }
  });

  results = results.slice(0, limit);

  return {
    city: params.city_slug,
    captured_at_max: capturedAtMax,
    results: results.map((row) => ({
      building: row.unit.buildings,
      unit: {
        id: row.unit.id,
        unit_number: row.unit.unit_number,
        beds: row.unit.beds,
        baths: row.unit.baths,
        sqft: row.unit.sqft,
        available_on: row.unit.available_on,
        floorplan_id: row.unit.floorplan_id,
      },
      pricing: row.pricing,
      images: row.unitImages.length > 0 ? row.unitImages : row.buildingImages,
      floorplan: row.floorplan,
    })),
  };
}

/**
 * Cached search — results are reused for 5 minutes per unique param combination.
 * The cache key is derived from the params; the city slug is included as a tag
 * so city-level revalidation is possible via revalidateTag('search:miami').
 */
export function cachedSearch(params: SearchParams): Promise<SearchResponse> {
  const key = buildCacheKey(params);
  const cityTag = `search:${params.city_slug}`;

  return unstable_cache(
    () => executeSearch(params),
    ["search", key],
    {
      revalidate: CACHE_TTL_SECONDS,
      tags: [cityTag, "search"],
    }
  )();
}
