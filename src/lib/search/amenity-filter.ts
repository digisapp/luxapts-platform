import { AMENITY_KEYWORDS } from "@/lib/constants/amenities";
import { fetchAllRows } from "@/lib/db-helpers";
import type { SupabaseClient } from "@supabase/supabase-js";

// PostgREST caps responses at 1000 rows and long `.in()` URLs fail outright —
// both tables are read in chunks/pages so the filter never silently drops a
// building as the catalog grows (amenities: 817 rows and rising monthly).
const IN_CHUNK_SIZE = 100;

/**
 * Filter building IDs by amenity requirements using keyword matching.
 * Returns the filtered list of building IDs that match the amenity criteria.
 */
export async function filterBuildingsByAmenities(
  supabase: SupabaseClient,
  buildingIds: string[],
  amenitiesAny?: string[],
  amenitiesAll?: string[],
): Promise<string[]> {
  if (!amenitiesAny?.length && !amenitiesAll?.length) {
    return buildingIds;
  }

  const amenities = await fetchAllRows<{ id: string; name: string }>((from, to) =>
    supabase.from("amenities").select("id, name").order("id").range(from, to)
  );

  if (!amenities.length) return buildingIds;

  // Build a map of amenity ID to its normalized name ("Washer/Dryer" → "washer dryer")
  const amenityIdToName = new Map(
    amenities.map(a => [a.id, normalizeAmenityTerm(a.name)])
  );

  // Get building_amenities for the current buildings
  const chunks: string[][] = [];
  for (let i = 0; i < buildingIds.length; i += IN_CHUNK_SIZE) {
    chunks.push(buildingIds.slice(i, i + IN_CHUNK_SIZE));
  }
  const buildingAmenities = (
    await Promise.all(
      chunks.map((ids) =>
        fetchAllRows<{ building_id: string; amenity_id: string }>((from, to) =>
          supabase
            .from("building_amenities")
            .select("building_id, amenity_id")
            .in("building_id", ids)
            .order("building_id")
            .order("amenity_id")
            .range(from, to)
        )
      )
    )
  ).flat();

  // Build a map of building -> normalized amenity names
  const buildingToAmenityNames = new Map<string, string[]>();
  for (const ba of buildingAmenities) {
    if (!buildingToAmenityNames.has(ba.building_id)) {
      buildingToAmenityNames.set(ba.building_id, []);
    }
    const amenityName = amenityIdToName.get(ba.amenity_id);
    if (amenityName) {
      buildingToAmenityNames.get(ba.building_id)!.push(amenityName);
    }
  }

  return buildingIds.filter(buildingId => {
    if (amenitiesAny?.length) {
      const hasAny = amenitiesAny.some(term => buildingHasAmenity(buildingToAmenityNames, buildingId, term));
      if (!hasAny) return false;
    }
    if (amenitiesAll?.length) {
      const hasAll = amenitiesAll.every(term => buildingHasAmenity(buildingToAmenityNames, buildingId, term));
      if (!hasAll) return false;
    }
    return true;
  });
}

/**
 * Canonical form for amenity comparison: lowercase, with `-`, `/` and `_`
 * treated as word separators and whitespace collapsed. Requested keys arrive
 * from the UI ("Washer Dryer"), the LLM parser ("washer-dryer", "bike_room")
 * and the DB ("Washer/Dryer"); without this the parser's slugs matched nothing.
 */
export function normalizeAmenityTerm(term: string): string {
  return term
    .toLowerCase()
    .replace(/[-/_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// AMENITY_KEYWORDS with both the display keys and their keyword lists
// normalized, computed once.
const NORMALIZED_AMENITY_KEYWORDS = new Map<string, string[]>(
  Object.entries(AMENITY_KEYWORDS).map(([key, keywords]) => [
    normalizeAmenityTerm(key),
    keywords.map(normalizeAmenityTerm),
  ])
);

/**
 * Map any spelling of a catalog amenity ("washer-dryer", "Washer/Dryer") onto
 * its canonical AMENITY_KEYWORDS key ("Washer Dryer"); unknown terms are
 * returned unchanged so they can still be matched literally.
 */
export function canonicalAmenityKey(term: string): string {
  const normalized = normalizeAmenityTerm(term);
  return Object.keys(AMENITY_KEYWORDS).find((k) => normalizeAmenityTerm(k) === normalized) ?? term;
}

/**
 * Whether a list of amenity names (raw DB spellings are fine) satisfies a
 * requested amenity term, via the shared AMENITY_KEYWORDS config. Exported so
 * the matching rules can be unit-tested without a database.
 */
export function amenityNamesMatch(amenityNames: string[], searchTerm: string): boolean {
  const normalizedTerm = normalizeAmenityTerm(searchTerm);
  if (!normalizedTerm) return false;
  const keywords = NORMALIZED_AMENITY_KEYWORDS.get(normalizedTerm) || [normalizedTerm];

  const patterns = keywords.map(
    (keyword) => new RegExp(`(^|\\W)${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\W|$)`, "i")
  );

  return amenityNames.some((amenityName) => {
    const normalizedName = normalizeAmenityTerm(amenityName);
    return patterns.some((pattern) => pattern.test(normalizedName));
  });
}

/** Check if a building has an amenity by keyword matching against the shared AMENITY_KEYWORDS config. */
function buildingHasAmenity(
  buildingToAmenityNames: Map<string, string[]>,
  buildingId: string,
  searchTerm: string,
): boolean {
  return amenityNamesMatch(buildingToAmenityNames.get(buildingId) || [], searchTerm);
}
