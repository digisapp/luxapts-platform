import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkPartnerAuth } from "@/lib/partner/auth";
import { apiError } from "@/lib/api-helpers";
import { z } from "zod";

const unitUpdateSchema = z.object({
  is_available: z.boolean().optional(),
  available_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  rent: z.number().int().min(0).max(100000).optional().nullable(),
});

// PATCH /api/partner/buildings/[id]/units/[unitId]
// Partners can update availability and rent for their own units
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkPartnerAuth();
    if (!auth.isPartner) return apiError(auth.error, auth.status);

    const { id: buildingId } = await params;
    const { searchParams } = new URL(req.url);
    const unitId = searchParams.get("unit_id");

    if (!unitId) return apiError("unit_id query param required");

    const rawBody = await req.json();
    const parsed = unitUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message || "Invalid request");
    }

    const supabase = createAdminClient();

    // Verify the unit belongs to a building owned by this partner
    const { data: unit } = await supabase
      .from("units")
      .select("id, building_id")
      .eq("id", unitId)
      .eq("building_id", buildingId)
      .single();

    if (!unit) return apiError("Unit not found", 404);

    const { data: building } = await supabase
      .from("buildings")
      .select("id")
      .eq("id", buildingId)
      .eq("partner_user_id", auth.userId)
      .single();

    if (!building) return apiError("Building not found or not owned by you", 403);

    const { rent, ...unitFields } = parsed.data;

    // Update the unit record
    const updates: Record<string, unknown> = { ...unitFields };
    if (!updates.is_available) {
      updates.available_on = null;
    }

    if (Object.keys(unitFields).length > 0) {
      const { error: unitError } = await supabase
        .from("units")
        .update(updates)
        .eq("id", unitId);

      if (unitError) {
        console.error("Unit update error:", unitError);
        return apiError("Failed to update unit", 500);
      }
    }

    // If rent provided, insert a new price snapshot
    if (typeof rent === "number") {
      const { error: priceError } = await supabase
        .from("unit_price_snapshots")
        .insert({
          unit_id: unitId,
          rent,
          captured_at: new Date().toISOString(),
        });

      if (priceError) {
        console.error("Price snapshot insert error:", priceError);
        return apiError("Unit updated but failed to record new rent", 500);
      }
    }

    return NextResponse.json({ success: true, unit_id: unitId });
  } catch (error) {
    console.error("Partner unit update error:", error);
    return apiError("Internal server error", 500);
  }
}
