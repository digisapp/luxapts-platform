import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/db-helpers";

interface ImageRecord {
  id: string;
  url: string;
  alt_text: string | null;
  category: string | null;
}

interface PriceSnapshot {
  unit_id: string;
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
export const IN_CHUNK_SIZE = 100;

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/** Fetch latest price snapshot per unit (one row per unit via the latest_unit_prices view). */
export async function fetchPriceSnapshots(
  supabase: SupabaseClient,
  unitIds: string[],
): Promise<{ snapByUnit: Map<string, PriceSnapshot>; capturedAtMax: string | null }> {
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
    if (res.error) throw new Error(res.error.message);
    for (const s of (res.data || []) as PriceSnapshot[]) {
      snapByUnit.set(s.unit_id, s);
      if (!capturedAtMax || s.captured_at > capturedAtMax) {
        capturedAtMax = s.captured_at;
      }
    }
  }

  return { snapByUnit, capturedAtMax };
}

type UnitImageRow = ImageRecord & { unit_id: string; is_primary: boolean | null; sort_order: number | null };
type BuildingImageRow = ImageRecord & { building_id: string; is_primary: boolean | null; sort_order: number | null };

/** Fetch unit images grouped by unit_id (chunked + paged past the 1000-row cap). */
export async function fetchUnitImages(
  supabase: SupabaseClient,
  unitIds: string[],
): Promise<Map<string, ImageRecord[]>> {
  const pages = await Promise.all(
    chunk(unitIds, IN_CHUNK_SIZE).map((ids) =>
      fetchAllRows<UnitImageRow>((from, to) =>
        supabase
          .from("unit_images")
          .select("id, unit_id, url, alt_text, category, is_primary, sort_order")
          .in("unit_id", ids)
          .order("unit_id")
          .order("is_primary", { ascending: false })
          .order("sort_order", { ascending: true })
          .order("id")
          .range(from, to)
      )
    )
  );

  const map = new Map<string, ImageRecord[]>();
  for (const img of pages.flat()) {
    if (!map.has(img.unit_id)) map.set(img.unit_id, []);
    map.get(img.unit_id)!.push(img);
  }
  return map;
}

/** Fetch building images grouped by building_id (chunked + paged past the 1000-row cap). */
export async function fetchBuildingImages(
  supabase: SupabaseClient,
  buildingIds: string[],
): Promise<Map<string, ImageRecord[]>> {
  const pages = await Promise.all(
    chunk(buildingIds, IN_CHUNK_SIZE).map((ids) =>
      fetchAllRows<BuildingImageRow>((from, to) =>
        supabase
          .from("building_images")
          .select("id, building_id, url, alt_text, category, is_primary, sort_order")
          .in("building_id", ids)
          .order("building_id")
          .order("is_primary", { ascending: false })
          .order("sort_order", { ascending: true })
          .order("id")
          .range(from, to)
      )
    )
  );

  const map = new Map<string, ImageRecord[]>();
  for (const img of pages.flat()) {
    if (!map.has(img.building_id)) map.set(img.building_id, []);
    map.get(img.building_id)!.push(img);
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
    results.flatMap((res) => (res.data || []) as FloorplanRecord[]).map(fp => [fp.id, fp])
  );

  for (const unit of units) {
    if (unit.floorplan_id && floorplansById.has(unit.floorplan_id)) {
      floorplansByUnit.set(unit.id, floorplansById.get(unit.floorplan_id)!);
    }
  }

  return floorplansByUnit;
}

export interface AvailableUnitPrice {
  id: string;
  building_id: string;
  latest_rent: number | null;
}

/**
 * Every available unit for a set of buildings with its latest rent, from the
 * units_with_latest_price view — chunked by building id and paged. Replaces
 * the "fetch unit ids, then latest_unit_prices .in(all unit ids)" pattern,
 * whose URL exceeded PostgREST's limit past a few hundred units: 800 ids →
 * 400 Bad Request (Los Angeles silently lost its minimum prices) and 1,500
 * ids hung the request until the build's 60 s page timeout.
 */
export async function fetchAvailableUnitPrices<T extends AvailableUnitPrice = AvailableUnitPrice>(
  supabase: SupabaseClient,
  buildingIds: string[],
  extraColumns: string[] = [],
): Promise<T[]> {
  if (buildingIds.length === 0) return [];
  const columns = ["id", "building_id", "latest_rent", ...extraColumns].join(", ");
  const pages = await Promise.all(
    chunk(buildingIds, IN_CHUNK_SIZE).map((ids) =>
      fetchAllRows<T>((from, to) =>
        supabase
          .from("units_with_latest_price")
          .select(columns)
          .in("building_id", ids)
          .eq("is_available", true)
          .order("id")
          // dynamic column list → supabase-js can't infer the row type
          .range(from, to) as unknown as PromiseLike<{ data: T[] | null; error: unknown }>
      )
    )
  );
  return pages.flat();
}
