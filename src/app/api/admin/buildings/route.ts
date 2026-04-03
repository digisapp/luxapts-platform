import { NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-helpers";
import { z } from "zod";

const createBuildingSchema = z.object({
  name: z.string().min(1).max(200),
  address_1: z.string().min(1).max(300),
  address_2: z.string().max(200).optional(),
  city_id: z.string().uuid(),
  zip: z.string().max(20).optional(),
  status: z.enum(["active", "inactive", "coming_soon"]).default("active"),
  description: z.string().max(5000).optional(),
  website_url: z.string().url().optional().or(z.literal("")),
  leasing_phone: z.string().max(30).optional(),
  leasing_email: z.string().email().optional().or(z.literal("")),
  year_built: z.number().int().min(1800).max(new Date().getFullYear() + 5).optional(),
  stories: z.number().int().min(1).max(200).optional(),
  pet_policy: z.string().max(1000).optional(),
  parking_policy: z.string().max(1000).optional(),
  deposit_policy: z.string().max(1000).optional(),
});

export async function POST(req: Request) {
  const authResult = await checkAdminAuth();
  if (!authResult.isAdmin) {
    return apiError(authResult.error || "Unauthorized", authResult.status);
  }

  const rawBody = await req.json();
  const parsed = createBuildingSchema.safeParse(rawBody);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message || "Invalid request");
  }

  const body = parsed.data;
  const supabase = createAdminClient();

  // Verify city exists
  const { data: city } = await supabase
    .from("cities")
    .select("id")
    .eq("id", body.city_id)
    .single();

  if (!city) return apiError("City not found", 404);

  const { data: building, error } = await supabase
    .from("buildings")
    .insert({
      name: body.name,
      address_1: body.address_1,
      address_2: body.address_2 || null,
      city_id: body.city_id,
      zip: body.zip || null,
      status: body.status,
      description: body.description || null,
      website_url: body.website_url || null,
      leasing_phone: body.leasing_phone || null,
      leasing_email: body.leasing_email || null,
      year_built: body.year_built || null,
      stories: body.stories || null,
      pet_policy: body.pet_policy || null,
      parking_policy: body.parking_policy || null,
      deposit_policy: body.deposit_policy || null,
    })
    .select(`*, cities:city_id (id, name, slug)`)
    .single();

  if (error || !building) {
    console.error("Create building error:", error);
    return apiError("Failed to create building", 500);
  }

  return NextResponse.json({ building }, { status: 201 });
}

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
