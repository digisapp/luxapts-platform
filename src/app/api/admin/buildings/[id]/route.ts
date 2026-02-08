import { NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { isValidUUID } from "@/lib/utils";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, context: RouteContext) {
  const authResult = await checkAdminAuth();
  if (!authResult.isAdmin) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }

  const { id } = await context.params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid building ID" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Fetch building with city
  const { data: building, error: buildingError } = await supabase
    .from("buildings")
    .select(`
      *,
      cities:city_id (id, name, slug)
    `)
    .eq("id", id)
    .single();

  if (buildingError || !building) {
    return NextResponse.json({ error: "Building not found" }, { status: 404 });
  }

  // Fetch related data in parallel
  const [amenitiesRes, imagesRes, unitsRes] = await Promise.all([
    supabase
      .from("building_amenities")
      .select(`
        amenity_id, details,
        amenities:amenity_id (id, name, category)
      `)
      .eq("building_id", id),
    supabase
      .from("building_images")
      .select("*")
      .eq("building_id", id)
      .order("sort_order"),
    supabase
      .from("units")
      .select(`
        id, unit_number, floor, beds, baths, sqft, is_available, available_on,
        unit_images (id, url, category, is_primary)
      `)
      .eq("building_id", id)
      .order("unit_number"),
  ]);

  return NextResponse.json({
    building,
    amenities: amenitiesRes.data || [],
    images: imagesRes.data || [],
    units: unitsRes.data || [],
  });
}

export async function PATCH(req: Request, context: RouteContext) {
  const authResult = await checkAdminAuth();
  if (!authResult.isAdmin) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }

  const { id } = await context.params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid building ID" }, { status: 400 });
  }

  const body = await req.json();

  // Only allow updating specific fields
  const allowedFields = [
    "status",
    "name",
    "description",
    "website_url",
    "leasing_phone",
    "leasing_email",
    "pet_policy",
    "parking_policy",
    "deposit_policy",
  ];
  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body) {
      updates[field] = body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  // Validate status if provided
  if (updates.status && !["active", "inactive", "coming_soon"].includes(updates.status as string)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("buildings")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to update building" }, { status: 500 });
  }

  return NextResponse.json({ building: data });
}

export async function POST(req: Request, context: RouteContext) {
  const authResult = await checkAdminAuth();
  if (!authResult.isAdmin) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }

  const { id } = await context.params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid building ID" }, { status: 400 });
  }

  const body = await req.json();
  const { url, category, alt_text } = body;

  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  const validCategories = ["exterior", "lobby", "amenity", "pool", "gym", "rooftop", "common", "other"];
  if (category && !validCategories.includes(category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Get current max sort_order
  const { data: existing } = await supabase
    .from("building_images")
    .select("sort_order")
    .eq("building_id", id)
    .order("sort_order", { ascending: false })
    .limit(1);

  const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;

  const { data, error } = await supabase
    .from("building_images")
    .insert({
      building_id: id,
      url,
      category: category || "other",
      alt_text: alt_text || null,
      sort_order: nextOrder,
      is_primary: false,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to add image" }, { status: 500 });
  }

  return NextResponse.json({ image: data }, { status: 201 });
}

export async function DELETE(req: Request, context: RouteContext) {
  const authResult = await checkAdminAuth();
  if (!authResult.isAdmin) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }

  const { id } = await context.params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid building ID" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const imageId = searchParams.get("imageId");

  if (!imageId || !isValidUUID(imageId)) {
    return NextResponse.json({ error: "Valid imageId query param required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("building_images")
    .delete()
    .eq("id", imageId)
    .eq("building_id", id);

  if (error) {
    return NextResponse.json({ error: "Failed to delete image" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
