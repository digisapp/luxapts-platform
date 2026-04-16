import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { checkPartnerAuth } from "@/lib/partner/auth";
import { apiError } from "@/lib/api-helpers";

// GET /api/partner/settings — fetch partner profile
export async function GET() {
  try {
    const auth = await checkPartnerAuth();
    if (!auth.isPartner) return apiError(auth.error, auth.status);

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("partners")
      .select("company_name, contact_name, contact_email, contact_phone, status, created_at")
      .eq("user_id", auth.userId)
      .single();

    if (error || !data) return apiError("Partner profile not found", 404);

    return NextResponse.json(data);
  } catch (error) {
    console.error("Partner settings GET error:", error);
    return apiError("Internal server error", 500);
  }
}

const PatchSchema = z.object({
  company_name: z.string().min(1).max(120).nullable().optional(),
  contact_name: z.string().max(100).nullable().optional(),
  contact_email: z.string().email().nullable().optional(),
  contact_phone: z.string().max(30).nullable().optional(),
});

// PATCH /api/partner/settings — update partner profile
export async function PATCH(req: Request) {
  try {
    const auth = await checkPartnerAuth();
    if (!auth.isPartner) return apiError(auth.error, auth.status);

    const body = await req.json();
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
    }

    const updates: Record<string, string | null> = {};
    if (parsed.data.company_name !== undefined) updates.company_name = parsed.data.company_name;
    if (parsed.data.contact_name !== undefined) updates.contact_name = parsed.data.contact_name;
    if (parsed.data.contact_email !== undefined) updates.contact_email = parsed.data.contact_email;
    if (parsed.data.contact_phone !== undefined) updates.contact_phone = parsed.data.contact_phone;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: true });
    }

    const supabase = createAdminClient();
    const { error } = await supabase
      .from("partners")
      .update(updates)
      .eq("user_id", auth.userId);

    if (error) {
      console.error("Partner settings PATCH error:", error);
      return apiError("Failed to update settings", 500);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Partner settings PATCH error:", error);
    return apiError("Internal server error", 500);
  }
}
