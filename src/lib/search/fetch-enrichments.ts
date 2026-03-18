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

/** Fetch latest price snapshot per unit. */
export async function fetchPriceSnapshots(
  supabase: SupabaseClient,
  unitIds: string[],
): Promise<{ snapByUnit: Map<string, PriceSnapshot>; capturedAtMax: string | null }> {
  const snapsRes = await supabase
    .from("unit_price_snapshots")
    .select("unit_id, rent, net_effective_rent, lease_term_months, captured_at")
    .in("unit_id", unitIds)
    .order("captured_at", { ascending: false });

  if (snapsRes.error) throw new Error(snapsRes.error.message);

  const snapByUnit = new Map<string, PriceSnapshot>();
  for (const s of snapsRes.data || []) {
    if (!snapByUnit.has(s.unit_id)) {
      snapByUnit.set(s.unit_id, s);
    }
  }

  return { snapByUnit, capturedAtMax: snapsRes.data?.[0]?.captured_at || null };
}

/** Fetch unit images grouped by unit_id. */
export async function fetchUnitImages(
  supabase: SupabaseClient,
  unitIds: string[],
): Promise<Map<string, ImageRecord[]>> {
  const res = await supabase
    .from("unit_images")
    .select("id, unit_id, url, alt_text, category, is_primary, sort_order")
    .in("unit_id", unitIds)
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true });

  const map = new Map<string, ImageRecord[]>();
  for (const img of res.data || []) {
    if (!map.has(img.unit_id)) map.set(img.unit_id, []);
    map.get(img.unit_id)!.push(img);
  }
  return map;
}

/** Fetch building images grouped by building_id. */
export async function fetchBuildingImages(
  supabase: SupabaseClient,
  buildingIds: string[],
): Promise<Map<string, ImageRecord[]>> {
  const res = await supabase
    .from("building_images")
    .select("id, building_id, url, alt_text, category, is_primary, sort_order")
    .in("building_id", buildingIds)
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true });

  const map = new Map<string, ImageRecord[]>();
  for (const img of res.data || []) {
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

  const floorplansRes = await supabase
    .from("floorplans")
    .select("id, name, layout_image_url")
    .in("id", floorplanIds);

  const floorplansById = new Map(
    (floorplansRes.data || []).map(fp => [fp.id, fp])
  );

  for (const unit of units) {
    if (unit.floorplan_id && floorplansById.has(unit.floorplan_id)) {
      floorplansByUnit.set(unit.id, floorplansById.get(unit.floorplan_id)!);
    }
  }

  return floorplansByUnit;
}
