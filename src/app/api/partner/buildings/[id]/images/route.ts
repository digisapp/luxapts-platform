import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { checkPartnerAuth } from "@/lib/partner/auth";
import { apiError } from "@/lib/api-helpers";

const VALID_CATEGORIES = ["exterior", "lobby", "amenity", "pool", "gym", "rooftop", "common", "other"] as const;

const AddImageSchema = z.object({
  url: z.string().url("Must be a valid URL").max(2048),
  category: z.enum(VALID_CATEGORIES).default("exterior"),
  alt_text: z.string().max(300).nullable().optional(),
});

async function verifyOwnership(supabase: ReturnType<typeof createAdminClient>, buildingId: string, userId: string) {
  const { data } = await supabase
    .from("buildings")
    .select("id")
    .eq("id", buildingId)
    .eq("partner_user_id", userId)
    .single();
  return !!data;
}

// POST /api/partner/buildings/[id]/images — add image by URL
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkPartnerAuth();
    if (!auth.isPartner) return apiError(auth.error, auth.status);

    const { id } = await params;
    const supabase = createAdminClient();

    if (!(await verifyOwnership(supabase, id, auth.userId))) {
      return apiError("Building not found", 404);
    }

    const body = await req.json();
    const parsed = AddImageSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
    }

    // Get current max sort_order
    const { data: existing } = await supabase
      .from("building_images")
      .select("sort_order")
      .eq("building_id", id)
      .order("sort_order", { ascending: false })
      .limit(1);

    const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;

    // Check if this will be the first image (make it primary)
    const { count } = await supabase
      .from("building_images")
      .select("id", { count: "exact", head: true })
      .eq("building_id", id);

    const isPrimary = (count ?? 0) === 0;

    const { data: image, error } = await supabase
      .from("building_images")
      .insert({
        building_id: id,
        url: parsed.data.url,
        category: parsed.data.category,
        alt_text: parsed.data.alt_text ?? null,
        sort_order: nextOrder,
        is_primary: isPrimary,
      })
      .select()
      .single();

    if (error) {
      console.error("Partner image insert error:", error);
      return apiError("Failed to add image", 500);
    }

    return NextResponse.json({ image }, { status: 201 });
  } catch (error) {
    console.error("Partner images POST error:", error);
    return apiError("Internal server error", 500);
  }
}

// DELETE /api/partner/buildings/[id]/images?imageId=xxx — remove an image
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkPartnerAuth();
    if (!auth.isPartner) return apiError(auth.error, auth.status);

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const imageId = searchParams.get("imageId");

    if (!imageId) return apiError("imageId is required", 400);

    const supabase = createAdminClient();

    if (!(await verifyOwnership(supabase, id, auth.userId))) {
      return apiError("Building not found", 404);
    }

    // Verify the image belongs to this building before deleting
    const { data: img } = await supabase
      .from("building_images")
      .select("id, is_primary")
      .eq("id", imageId)
      .eq("building_id", id)
      .single();

    if (!img) return apiError("Image not found", 404);

    const { error } = await supabase
      .from("building_images")
      .delete()
      .eq("id", imageId)
      .eq("building_id", id);

    if (error) {
      console.error("Partner image delete error:", error);
      return apiError("Failed to delete image", 500);
    }

    // If we deleted the primary, promote the next image
    if (img.is_primary) {
      const { data: next } = await supabase
        .from("building_images")
        .select("id")
        .eq("building_id", id)
        .order("sort_order", { ascending: true })
        .limit(1)
        .single();

      if (next) {
        await supabase
          .from("building_images")
          .update({ is_primary: true })
          .eq("id", next.id);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Partner images DELETE error:", error);
    return apiError("Internal server error", 500);
  }
}

// PATCH /api/partner/buildings/[id]/images?imageId=xxx — set as primary
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkPartnerAuth();
    if (!auth.isPartner) return apiError(auth.error, auth.status);

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const imageId = searchParams.get("imageId");

    if (!imageId) return apiError("imageId is required", 400);

    const supabase = createAdminClient();

    if (!(await verifyOwnership(supabase, id, auth.userId))) {
      return apiError("Building not found", 404);
    }

    // Verify image belongs to this building
    const { data: img } = await supabase
      .from("building_images")
      .select("id")
      .eq("id", imageId)
      .eq("building_id", id)
      .single();

    if (!img) return apiError("Image not found", 404);

    // Clear existing primary, set new one
    await supabase
      .from("building_images")
      .update({ is_primary: false })
      .eq("building_id", id)
      .eq("is_primary", true);

    await supabase
      .from("building_images")
      .update({ is_primary: true })
      .eq("id", imageId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Partner images PATCH error:", error);
    return apiError("Internal server error", 500);
  }
}
