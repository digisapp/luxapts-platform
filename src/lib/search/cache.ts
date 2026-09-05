import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/db-helpers";
import { filterBuildingsByAmenities } from "@/lib/search/amenity-filter";
import {
  chunk,
  IN_CHUNK_SIZE,
  fetchPriceSnapshots,
  fetchUnitImages,
  fetchBuildingImages,
  fetchFloorplans,
} from "@/lib/search/fetch-enrichments";

// Cache TTL: 5 minutes. Search results are safe to serve slightly stale —
// availability changes are reflected on the building detail page.
const CACHE_TTL_SECONDS = 300;

// PostgREST caps any single response at 1000 rows.
const MAX_FETCH_ROWS = 1000;
// Upper bound on candidate pages per building-chunk (pages are 3× the
// requested limit, so a limit-200 search can examine up to 4,800 units).
const MAX_PAGE_ROUNDS = 8;

// best_match pools several pages' worth of candidates and then caps how many
// units a single building contributes to the top of the page. Freshest-first
// alone let one nightly-scraped tower with 124 available units fill an entire
// Miami results page by itself.
const DIVERSIFY_POOL_MULTIPLIER = 4;
const MAX_PER_BUILDING_FIRST_PASS = 3;

function diversifyByBuilding(rows: UnitRow[], limit: number): UnitRow[] {
  const counts = new Map<string, number>();
  const first: UnitRow[] = [];
  const rest: UnitRow[] = [];
  for (const row of rows) {
    const n = counts.get(row.building_id) ?? 0;
    if (n < MAX_PER_BUILDING_FIRST_PASS) {
      first.push(row);
      counts.set(row.building_id, n + 1);
    } else {
      rest.push(row);
    }
  }
  return [...first, ...rest].slice(0, limit);
}

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

// Row shape from the units_with_latest_price view (units.* + the latest
// snapshot's rent/captured_at joined laterally) with the building embedded.
interface UnitRow {
  id: string;
  building_id: string;
  floorplan_id: string | null;
  unit_number: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  available_on: string | null;
  latest_rent: number | null;
  latest_net_effective_rent: number | null;
  price_captured_at: string | null;
  buildings: unknown;
}

// Typed as plain string so supabase-js doesn't try to parse the embed
// grammar at the type level (2.115's parser blows the instantiation depth on
// nested embeds; the client is untyped anyway).
const UNIT_SELECT: string = `
  id, building_id, floorplan_id, unit_number, beds, baths, sqft,
  available_on, latest_rent, latest_net_effective_rent, price_captured_at,
  buildings:building_id (
    id, name, address_1, zip, lat, lng, pet_policy, parking_policy,
    neighborhoods:neighborhood_id ( slug, name )
  )
`;

/**
 * Sort order, applied identically in SQL (so the over-fetch window holds the
 * right rows) and in JS (to merge rows fetched in building-id chunks).
 *
 * best_match: freshest price capture first — the most recently scraped units
 * are the ones whose availability we trust most — then cheapest on ties.
 */
function compareUnits(sort: string, a: UnitRow, b: UnitRow): number {
  const rentA = a.latest_rent ?? 0;
  const rentB = b.latest_rent ?? 0;
  const capA = a.price_captured_at ? Date.parse(a.price_captured_at) : 0;
  const capB = b.price_captured_at ? Date.parse(b.price_captured_at) : 0;
  switch (sort) {
    case "price_low":
      return rentA - rentB || capB - capA || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    case "price_high":
      return rentB - rentA || capB - capA || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    case "sqft_high":
      return (b.sqft ?? -1) - (a.sqft ?? -1) || rentA - rentB || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    case "newest":
    default:
      return capB - capA || rentA - rentB || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  }
}

type OrderSpec = [column: string, opts: { ascending: boolean; nullsFirst?: boolean }];

/** SQL ordering that mirrors compareUnits; the trailing id keeps range() paging stable. */
function orderSpec(sort: string): OrderSpec[] {
  switch (sort) {
    case "price_low":
      return [["latest_rent", { ascending: true }], ["price_captured_at", { ascending: false }], ["id", { ascending: true }]];
    case "price_high":
      return [["latest_rent", { ascending: false }], ["price_captured_at", { ascending: false }], ["id", { ascending: true }]];
    case "sqft_high":
      return [["sqft", { ascending: false, nullsFirst: false }], ["latest_rent", { ascending: true }], ["id", { ascending: true }]];
    case "newest":
    default:
      return [["price_captured_at", { ascending: false }], ["latest_rent", { ascending: true }], ["id", { ascending: true }]];
  }
}

async function executeSearch(params: SearchParams): Promise<SearchResponse> {
  const limit = params.limit ?? 50;
  const sort = params.sort || "best_match";
  const supabase = createAdminClient();
  const empty: SearchResponse = { city: params.city_slug, captured_at_max: null, results: [] };

  // 1. Resolve city
  const cityRes = await supabase
    .from("cities")
    .select("id, slug, name")
    .eq("slug", params.city_slug)
    .single();

  if (cityRes.error || !cityRes.data) return empty;
  const cityId = cityRes.data.id as string;

  // 2. Candidate buildings (paged — never silently capped at 1000)
  let neighborhoodIds: string[] | null = null;
  if (params.neighborhood_slugs?.length) {
    const neighborhoodRes = await supabase
      .from("neighborhoods")
      .select("id")
      .eq("city_id", cityId)
      .in("slug", params.neighborhood_slugs);
    if (neighborhoodRes.data?.length) {
      neighborhoodIds = neighborhoodRes.data.map((n) => n.id as string);
    }
  }

  const buildings = await fetchAllRows<{ id: string }>((from, to) => {
    let q = supabase
      .from("buildings")
      .select("id")
      .eq("city_id", cityId)
      .eq("status", "active");
    if (neighborhoodIds) q = q.in("neighborhood_id", neighborhoodIds);
    if (params.pet_friendly) {
      q = q
        .not("pet_policy", "is", null)
        .not("pet_policy", "ilike", "%no pet%")
        .not("pet_policy", "ilike", "%not allowed%")
        .not("pet_policy", "ilike", "%no animal%");
    }
    if (params.parking_required) q = q.not("parking_policy", "is", null);
    return q.order("id").range(from, to);
  });

  let buildingIds = buildings.map((b) => b.id);
  if (!buildingIds.length) return empty;

  // 3. Filter by amenities
  buildingIds = await filterBuildingsByAmenities(
    supabase, buildingIds, params.amenities_any, params.amenities_all,
  );
  if (!buildingIds.length) return empty;

  // 4. Available units with their latest price. Budget and sort are applied
  //    IN SQL: the previous implementation pulled the first `limit * 2` units
  //    the database happened to return (no ORDER BY) and only then filtered by
  //    price in JS, so "Miami under $2,500" returned nothing while 199 such
  //    units existed.
  //
  // 5. Image quality gate — a listing with no photo of the unit OR the
  //    building is not shown. Imageless inventory can dominate a sort window
  //    (the 150 freshest Miami units sit in two photo-less buildings), so the
  //    candidates are paged in sort order until the page is full. Buildings
  //    are queried in id-chunks (URL length); each chunk keeps its own cursor
  //    and is only advanced while it can still beat the current cut-off row,
  //    which keeps the merged ordering exact.
  const pageSize = Math.min(limit * 3, MAX_FETCH_ROWS);
  const diversify = sort === "best_match";
  const target = diversify ? limit * DIVERSIFY_POOL_MULTIPLIER : limit;
  const cmp = (a: UnitRow, b: UnitRow) => compareUnits(sort, a, b);
  const buildUnitsQuery = (ids: string[]) => {
    let q = supabase
      .from("units_with_latest_price")
      .select(UNIT_SELECT)
      .eq("is_available", true)
      .in("building_id", ids)
      .not("latest_rent", "is", null);

    if (typeof params.beds_min === "number") q = q.gte("beds", params.beds_min);
    if (typeof params.beds_max === "number") q = q.lte("beds", params.beds_max);
    if (typeof params.baths_min === "number") q = q.gte("baths", params.baths_min);
    if (params.move_in_date) q = q.lte("available_on", params.move_in_date);
    if (typeof params.budget_min === "number") q = q.gte("latest_rent", params.budget_min);
    if (typeof params.budget_max === "number") q = q.lte("latest_rent", params.budget_max);

    for (const [column, opts] of orderSpec(sort)) q = q.order(column, opts);
    return q;
  };

  const cursors = chunk(buildingIds, IN_CHUNK_SIZE).map((ids) => ({
    ids,
    page: 0,
    exhausted: false,
    boundary: null as UnitRow | null,
  }));
  const imagesByUnit = new Map<string, unknown[]>();
  const imagesByBuilding = new Map<string, unknown[]>();
  const buildingsChecked = new Set<string>();
  const kept: UnitRow[] = [];

  for (let round = 0; round < MAX_PAGE_ROUNDS; round++) {
    kept.sort(cmp);
    const cutoff = kept.length >= target ? kept[target - 1] : null;
    const due = cursors.filter(
      (c) => !c.exhausted && (!cutoff || !c.boundary || cmp(c.boundary, cutoff) < 0),
    );
    if (!due.length) break;

    const pages = await Promise.all(
      due.map((c) => buildUnitsQuery(c.ids).range(c.page * pageSize, (c.page + 1) * pageSize - 1)),
    );

    const fresh: UnitRow[] = [];
    due.forEach((c, i) => {
      const page = pages[i];
      if (page.error) throw new Error(page.error.message);
      const rows = (page.data || []) as unknown as UnitRow[];
      c.page += 1;
      if (rows.length < pageSize) c.exhausted = true;
      if (rows.length) c.boundary = rows[rows.length - 1];
      fresh.push(...rows);
    });
    if (!fresh.length) continue;

    const newBuildings = [...new Set(fresh.map((u) => u.building_id))].filter((b) => !buildingsChecked.has(b));
    newBuildings.forEach((b) => buildingsChecked.add(b));
    const [unitImages, buildingImages] = await Promise.all([
      fetchUnitImages(supabase, fresh.map((u) => u.id)),
      fetchBuildingImages(supabase, newBuildings),
    ]);
    unitImages.forEach((imgs, id) => imagesByUnit.set(id, imgs));
    buildingImages.forEach((imgs, id) => imagesByBuilding.set(id, imgs));

    for (const u of fresh) {
      if ((imagesByUnit.get(u.id)?.length ?? 0) > 0 || (imagesByBuilding.get(u.building_id)?.length ?? 0) > 0) {
        kept.push(u);
      }
    }
  }

  kept.sort(cmp);
  const page = diversify ? diversifyByBuilding(kept, limit) : kept.slice(0, limit);
  if (!page.length) return empty;

  // 6. Enrich only the final page: full latest snapshot (lease term, net
  //    effective) and floorplans.
  const [{ snapByUnit, capturedAtMax }, floorplansByUnit] = await Promise.all([
    fetchPriceSnapshots(supabase, page.map((u) => u.id)),
    fetchFloorplans(supabase, page),
  ]);

  return {
    city: params.city_slug,
    captured_at_max: capturedAtMax ?? page[0]?.price_captured_at ?? null,
    results: page.map((u) => {
      const unitImages = imagesByUnit.get(u.id) || [];
      const buildingImages = imagesByBuilding.get(u.building_id) || [];
      return {
        building: u.buildings,
        unit: {
          id: u.id,
          unit_number: u.unit_number,
          beds: u.beds,
          baths: u.baths,
          sqft: u.sqft,
          available_on: u.available_on,
          floorplan_id: u.floorplan_id,
        },
        pricing:
          snapByUnit.get(u.id) ?? {
            unit_id: u.id,
            rent: u.latest_rent,
            net_effective_rent: u.latest_net_effective_rent,
            lease_term_months: null,
            captured_at: u.price_captured_at,
          },
        images: unitImages.length > 0 ? unitImages : buildingImages,
        floorplan: floorplansByUnit.get(u.id) || null,
      };
    }),
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
