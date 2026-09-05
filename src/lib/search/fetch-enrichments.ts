import type { SupabaseClient } from "@supabase/supabase-js";

interface ImageRecord {
  id: string;
  url: string;
  alt_text: string | null;
  category: string | null;
}

interface PriceSnapshot {
  rent: number;
  net_effective_rent: number | null;
  lease_term_months: number | null;
  captured_at: string;
}

interface FloorplanRecord {
  id: string;
  name: string;
  layout_image_url: string | null;
}

// PostgREST `.in()` filters are encoded in the request URL. Past ~150 UUIDs
// the URL gets long enough that the fetch fails outright ("fetch failed"),
// which 500'd every search the UI issued (limit 200 → 400 unit ids).
// Query in chunks and merge.
const IN_CHUNK_SIZE = 100;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/** Fetch latest price snapshot per unit. */
export async function fetchPriceSnapshots(
  supabase: SupabaseClient,
  unitIds: string[],
): Promise<{ snapByUnit: Map<string, PriceSnapshot>; capturedAtMax: string | null }> {
  // latest_unit_prices returns exactly one row per unit. The old query
  // fetched FULL snapshot history and kept the first row per unit in JS —
  // silently truncated at PostgREST's 1000-row cap, which dropped units
  // from search results as daily snapshots accumulated.
  const results = await Promise.all(
    chunk(unitIds, IN_CHUNK_SIZE).map((ids) =>
      supabase
        .from("latest_unit_prices")
        .select("unit_id, rent, net_effective_rent, lease_term_months, captured_at")
        .in("unit_id", ids)
    )
  );

  const snapByUnit = new Map<string, PriceSnapshot>();
  let capturedAtMax: string | null = null;
  for (const res of results) {
    if (res.error) {
      // 42P01 = view missing (migration 023 not applied yet). Fall back to
      // the legacy history scan so a deploy ahead of the migration can't
      // take down search. Remove once 023 is confirmed in production.
      if (res.error.code === "42P01") {
        return fetchPriceSnapshotsLegacy(supabase, unitIds);
      }
      throw new Error(res.error.message);
    }
    for (const s of res.data || []) {
      snapByUnit.set(s.unit_id, s);
      if (!capturedAtMax || s.captured_at > capturedAtMax) {
        capturedAtMax = s.captured_at;
      }
    }
  }

  return { snapByUnit, capturedAtMax };
}

async function fetchPriceSnapshotsLegacy(
  supabase: SupabaseClient,
  unitIds: string[],
): Promise<{ snapByUnit: Map<string, PriceSnapshot>; capturedAtMax: string | null }> {
  const results = await Promise.all(
    chunk(unitIds, IN_CHUNK_SIZE).map((ids) =>
      supabase
        .from("unit_price_snapshots")
        .select("unit_id, rent, net_effective_rent, lease_term_months, captured_at")
        .in("unit_id", ids)
        .order("captured_at", { ascending: false })
    )
  );

  const snapByUnit = new Map<string, PriceSnapshot>();
  let capturedAtMax: string | null = null;
  for (const res of results) {
    if (res.error) throw new Error(res.error.message);
    for (const s of res.data || []) {
      if (!snapByUnit.has(s.unit_id)) {
        snapByUnit.set(s.unit_id, s);
      }
      if (!capturedAtMax || s.captured_at > capturedAtMax) {
        capturedAtMax = s.captured_at;
      }
    }
  }

  return { snapByUnit, capturedAtMax };
}

/** Fetch unit images grouped by unit_id. */
export async function fetchUnitImages(
  supabase: SupabaseClient,
  unitIds: string[],
): Promise<Map<string, ImageRecord[]>> {
  const results = await Promise.all(
    chunk(unitIds, IN_CHUNK_SIZE).map((ids) =>
      supabase
        .from("unit_images")
        .select("id, unit_id, url, alt_text, category, is_primary, sort_order")
        .in("unit_id", ids)
        .order("is_primary", { ascending: false })
        .order("sort_order", { ascending: true })
    )
  );

  const map = new Map<string, ImageRecord[]>();
  for (const res of results) {
    for (const img of res.data || []) {
      if (!map.has(img.unit_id)) map.set(img.unit_id, []);
      map.get(img.unit_id)!.push(img);
    }
  }
  return map;
}

/** Fetch building images grouped by building_id. */
export async function fetchBuildingImages(
  supabase: SupabaseClient,
  buildingIds: string[],
): Promise<Map<string, ImageRecord[]>> {
  const results = await Promise.all(
    chunk(buildingIds, IN_CHUNK_SIZE).map((ids) =>
      supabase
        .from("building_images")
        .select("id, building_id, url, alt_text, category, is_primary, sort_order")
        .in("building_id", ids)
        .order("is_primary", { ascending: false })
        .order("sort_order", { ascending: true })
    )
  );

  const map = new Map<string, ImageRecord[]>();
  for (const res of results) {
    for (const img of res.data || []) {
      if (!map.has(img.building_id)) map.set(img.building_id, []);
      map.get(img.building_id)!.push(img);
    }
  }
  return map;
}

/** Fetch floorplans and map them to their respective units. */
export async function fetchFloorplans(
  supabase: SupabaseClient,
  units: Array<{ id: string; floorplan_id: string | null }>,
): Promise<Map<string, FloorplanRecord>> {
  const floorplanIds = [...new Set(
    units.map(u => u.floorplan_id).filter((id): id is string => id !== null)
  )];

  const floorplansByUnit = new Map<string, FloorplanRecord>();

  if (floorplanIds.length === 0) return floorplansByUnit;

  const results = await Promise.all(
    chunk(floorplanIds, IN_CHUNK_SIZE).map((ids) =>
      supabase
        .from("floorplans")
        .select("id, name, layout_image_url")
        .in("id", ids)
    )
  );

  const floorplansById = new Map(
    results.flatMap((res) => res.data || []).map(fp => [fp.id, fp])
  );

  for (const unit of units) {
    if (unit.floorplan_id && floorplansById.has(unit.floorplan_id)) {
      floorplansByUnit.set(unit.id, floorplansById.get(unit.floorplan_id)!);
    }
  }

  return floorplansByUnit;
}
