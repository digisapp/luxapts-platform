import { NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-helpers";

export async function GET() {
  const authResult = await checkAdminAuth();
  if (!authResult.isAdmin) {
    return apiError(authResult.error || "Unauthorized", authResult.status);
  }

  const supabase = createAdminClient();

  // Fetch all cities
  const { data: cities, error: citiesError } = await supabase
    .from("cities")
    .select("id, name, slug")
    .order("name");

  if (citiesError) {
    return apiError("Failed to fetch cities", 500);
  }

  // Fetch all buildings with city info
  const { data: buildings, error: buildingsError } = await supabase
    .from("buildings")
    .select(`
      id, name, address_1, zip, status, website_url, year_built, stories,
      city_id,
      cities:city_id (id, name, slug)
    `)
    .order("name");

  if (buildingsError) {
    return apiError("Failed to fetch buildings", 500);
  }

  // Fetch image counts per building
  const { data: imageCounts, error: imageError } = await supabase
    .from("building_images")
    .select("building_id");

  // Fetch unit counts per building
  const { data: units, error: unitsError } = await supabase
    .from("units")
    .select("building_id, is_available");

  if (imageError || unitsError) {
    return apiError("Failed to fetch counts", 500);
  }

  // Aggregate counts
  const imageCountMap: Record<string, number> = {};
  for (const img of imageCounts || []) {
    imageCountMap[img.building_id] = (imageCountMap[img.building_id] || 0) + 1;
  }

  const unitCountMap: Record<string, { total: number; available: number }> = {};
  for (const unit of units || []) {
    if (!unitCountMap[unit.building_id]) {
      unitCountMap[unit.building_id] = { total: 0, available: 0 };
    }
    unitCountMap[unit.building_id].total++;
    if (unit.is_available) {
      unitCountMap[unit.building_id].available++;
    }
  }

  // Merge data
  const enrichedBuildings = (buildings || []).map((b) => ({
    ...b,
    image_count: imageCountMap[b.id] || 0,
    unit_count: unitCountMap[b.id]?.total || 0,
    available_unit_count: unitCountMap[b.id]?.available || 0,
  }));

  return NextResponse.json({ cities, buildings: enrichedBuildings });
}
