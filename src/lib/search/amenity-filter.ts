import { AMENITY_KEYWORDS } from "@/lib/constants/amenities";
import type { SupabaseClient } from "@supabase/supabase-js";

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

  const amenitiesRes = await supabase
    .from("amenities")
    .select("id, name");

  if (!amenitiesRes.data?.length) return buildingIds;

  // Build a map of amenity ID to its lowercase name
  const amenityIdToName = new Map(
    amenitiesRes.data.map(a => [a.id, a.name.toLowerCase()])
  );

  // Get building_amenities for the current buildings
  const buildingAmenitiesRes = await supabase
    .from("building_amenities")
    .select("building_id, amenity_id")
    .in("building_id", buildingIds);

  if (!buildingAmenitiesRes.data) return buildingIds;

  // Build a map of building -> amenity names (lowercase)
  const buildingToAmenityNames = new Map<string, string[]>();
  for (const ba of buildingAmenitiesRes.data) {
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

/** Check if a building has an amenity by keyword matching against the shared AMENITY_KEYWORDS config. */
function buildingHasAmenity(
  buildingToAmenityNames: Map<string, string[]>,
  buildingId: string,
  searchTerm: string,
): boolean {
  const buildingAmenities = buildingToAmenityNames.get(buildingId) || [];
  const lowerTerm = searchTerm.toLowerCase();
  const keywords = Object.entries(AMENITY_KEYWORDS).find(
    ([k]) => k.toLowerCase() === lowerTerm
  )?.[1] || [lowerTerm];

  return buildingAmenities.some(amenityName =>
    keywords.some(keyword => {
      const pattern = new RegExp(`(^|\\W)${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\W|$)`, "i");
      return pattern.test(amenityName);
    })
  );
}
