import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkPartnerAuth } from "@/lib/partner/auth";
import { apiError } from "@/lib/api-helpers";
import { z } from "zod";

const updateSchema = z.object({
  description: z.string().max(2000).optional(),
  website_url: z.string().url().max(500).optional().nullable(),
  leasing_phone: z.string().max(30).optional().nullable(),
  leasing_email: z.string().email().max(200).optional().nullable(),
  pet_policy: z.string().max(1000).optional().nullable(),
  parking_policy: z.string().max(1000).optional().nullable(),
  deposit_policy: z.string().max(1000).optional().nullable(),
});

// GET /api/partner/buildings/[id] — building detail with units and price history
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkPartnerAuth();
    if (!auth.isPartner) return apiError(auth.error, auth.status);

    const { id } = await params;
    const supabase = createAdminClient();

    const { data: building, error } = await supabase
      .from("buildings")
      .select(`
        *,
        cities:city_id (id, name, slug),
        neighborhoods:neighborhood_id (id, name, slug)
      `)
      .eq("id", id)
      .eq("partner_user_id", auth.userId)
      .single();

    if (error || !building) return apiError("Building not found", 404);

    const [unitsRes, imagesRes, amenitiesRes] = await Promise.all([
      supabase
        .from("units")
        .select("id, unit_number, floor, beds, baths, sqft, is_available, available_on")
        .eq("building_id", id)
        .order("unit_number"),
      supabase
        .from("building_images")
        .select("id, url, alt_text, category, is_primary, sort_order")
        .eq("building_id", id)
        .order("sort_order"),
      supabase
        .from("building_amenities")
        .select("amenities(id, name, category)")
        .eq("building_id", id),
    ]);

    // Latest price per unit
    const unitIds = (unitsRes.data || []).map((u) => u.id);
    const priceByUnit: Record<string, number> = {};
    if (unitIds.length > 0) {
      const { data: prices } = await supabase
        .from("unit_price_snapshots")
        .select("unit_id, rent, captured_at")
        .in("unit_id", unitIds)
        .order("captured_at", { ascending: false });
      for (const p of prices || []) {
        if (!priceByUnit[p.unit_id]) priceByUnit[p.unit_id] = p.rent;
      }
    }

    const units = (unitsRes.data || []).map((u) => ({
      ...u,
      current_rent: priceByUnit[u.id] || null,
    }));

    return NextResponse.json({
      building,
      units,
      images: imagesRes.data || [],
      amenities: (amenitiesRes.data || []).map((a) => {
        const amenity = Array.isArray(a.amenities) ? a.amenities[0] : a.amenities;
        return amenity;
      }).filter(Boolean),
    });
  } catch (error) {
    console.error("Partner building detail error:", error);
    return apiError("Internal server error", 500);
  }
}

// PATCH /api/partner/buildings/[id] — update allowed building fields
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkPartnerAuth();
    if (!auth.isPartner) return apiError(auth.error, auth.status);

    const { id } = await params;
    const rawBody = await req.json();
    const parsed = updateSchema.safeParse(rawBody);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message || "Invalid request");
    }

    const supabase = createAdminClient();

    // Verify ownership before update
    const { data: existing } = await supabase
      .from("buildings")
      .select("id")
      .eq("id", id)
      .eq("partner_user_id", auth.userId)
      .single();

    if (!existing) return apiError("Building not found", 404);

    const { data: updated, error } = await supabase
      .from("buildings")
      .update(parsed.data)
      .eq("id", id)
      .eq("partner_user_id", auth.userId)
      .select("id, name, description, website_url, leasing_phone, leasing_email, pet_policy, parking_policy, deposit_policy")
      .single();

    if (error) {
      console.error("Partner building update error:", error);
      return apiError("Failed to update building", 500);
    }

    return NextResponse.json({ building: updated });
  } catch (error) {
    console.error("Partner building patch error:", error);
    return apiError("Internal server error", 500);
  }
}
