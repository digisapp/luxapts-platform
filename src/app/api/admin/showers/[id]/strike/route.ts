import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api-helpers";
import { checkAdminAuth } from "@/lib/admin/auth";
import { logAuditEvent, AuditAction } from "@/lib/admin/audit";
import { createAdminClient } from "@/lib/supabase/server";
import { z } from "zod";

const strikeSchema = z.object({
  type: z.enum(["no_show", "late_cancel", "poor_conduct", "low_rating"]),
  description: z.string().min(1).max(500),
  showing_lead_id: z.string().uuid().optional(),
});

// POST /api/admin/showers/[id]/strike — manually add a strike to a shower
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkAdminAuth();
    if (!auth.isAdmin) return apiError(auth.error, auth.status);

    const { id: showerId } = await params;
    const rawBody = await req.json();
    const parsed = strikeSchema.safeParse(rawBody);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message || "Invalid request");
    }

    const adminClient = createAdminClient();

    const { data: strike, error } = await adminClient
      .from("shower_strikes")
      .insert({
        shower_id: showerId,
        showing_lead_id: parsed.data.showing_lead_id || null,
        type: parsed.data.type,
        description: parsed.data.description,
        created_by: auth.userId,
      })
      .select("id, type, created_at")
      .single();

    if (error || !strike) {
      console.error("Add strike error:", error);
      return apiError("Failed to add strike", 500);
    }

    // Return updated strike count
    const { data: shower } = await adminClient
      .from("showers")
      .select("strike_count, status")
      .eq("id", showerId)
      .single();

    await logAuditEvent(auth.userId, AuditAction.SHOWER_STRIKE_ADD, "shower", showerId, {
      strike_id: strike.id,
      strike_type: strike.type,
      description: parsed.data.description,
      showing_lead_id: parsed.data.showing_lead_id || null,
      new_strike_count: shower?.strike_count,
      shower_status: shower?.status,
    });

    return apiSuccess({
      strike,
      shower_status: shower?.status,
      strike_count: shower?.strike_count,
    }, 201);
  } catch (error) {
    console.error("Admin add strike error:", error);
    return apiError("Internal server error", 500);
  }
}
