import { NextResponse } from "next/server";
import { apiError, apiSuccess } from "@/lib/api-helpers";
import { checkAdminAuth } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { notifyCertifiedShowers } from "@/lib/shower/notify";
import { z } from "zod";

const postLeadSchema = z.object({
  building_id: z.string().uuid(),
  client_name: z.string().min(1).max(100),
  client_email: z.string().email().optional(),
  client_phone: z.string().min(7).max(20).optional(),
  preferred_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  preferred_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  unit_type: z.string().max(50).optional(),
  notes: z.string().max(1000).optional(),
  special_instructions: z.string().max(500).optional(),
  expires_hours: z.number().int().min(1).max(72).optional(), // hours until lead expires if unclaimed
});

// POST /api/admin/showing-leads — post a new showing lead
export async function POST(req: Request) {
  try {
    const auth = await checkAdminAuth();
    if (!auth.isAdmin) return apiError(auth.error, auth.status);

    const rawBody = await req.json();
    const parsed = postLeadSchema.safeParse(rawBody);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message || "Invalid request");
    }

    const body = parsed.data;
    const adminClient = createAdminClient();

    // Verify building exists
    const { data: building } = await adminClient
      .from("buildings")
      .select("id, name")
      .eq("id", body.building_id)
      .single();

    if (!building) {
      return apiError("Building not found", 404);
    }

    const expiresAt = body.expires_hours
      ? new Date(Date.now() + body.expires_hours * 60 * 60 * 1000).toISOString()
      : null;

    const { data: lead, error } = await adminClient
      .from("showing_leads")
      .insert({
        building_id: body.building_id,
        client_name: body.client_name,
        client_email: body.client_email || null,
        client_phone: body.client_phone || null,
        preferred_date: body.preferred_date,
        preferred_time: body.preferred_time,
        unit_type: body.unit_type || null,
        notes: body.notes || null,
        special_instructions: body.special_instructions || null,
        status: "open",
        posted_by: auth.userId,
        expires_at: expiresAt,
      })
      .select("id, status, created_at")
      .single();

    if (error || !lead) {
      console.error("Post showing lead error:", error);
      return apiError("Failed to create showing lead", 500);
    }

    await notifyCertifiedShowers(adminClient, {
      buildingId: body.building_id,
      preferredDate: body.preferred_date,
      preferredTime: body.preferred_time,
      unitType: body.unit_type,
      expiresAt,
    });

    return NextResponse.json({ lead_id: lead.id, status: lead.status }, { status: 201 });
  } catch (error) {
    console.error("Admin post showing lead error:", error);
    return apiError("Internal server error", 500);
  }
}

// GET /api/admin/showing-leads — list all showing leads with pipeline info
export async function GET(req: Request) {
  try {
    const auth = await checkAdminAuth();
    if (!auth.isAdmin) return apiError(auth.error, auth.status);

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const buildingId = searchParams.get("building_id");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const offset = Math.max(parseInt(searchParams.get("offset") || "0"), 0);

    const adminClient = createAdminClient();

    let query = adminClient
      .from("showing_leads")
      .select(`
        id, client_name, client_email, client_phone,
        preferred_date, preferred_time, unit_type, notes, status,
        lease_signed, lease_signed_at, monthly_rent,
        created_at, expires_at, posted_by, source_lead_id,
        buildings:building_id (id, name, address),
        showing_claims (
          id, claimed_at, status,
          showers:shower_id (id, display_name, phone, tier)
        ),
        showing_debriefs (
          id, submitted_at, admin_approved_at,
          client_showed_up, interest_level, application_likelihood
        )
      `, { count: "exact" })
      .order("preferred_date", { ascending: true })
      .order("preferred_time", { ascending: true })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq("status", status as "open" | "claimed" | "in_progress" | "completed" | "cancelled" | "no_show");
    }

    if (buildingId) {
      query = query.eq("building_id", buildingId);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error("List showing leads error:", error);
      return apiError("Failed to load showing leads", 500);
    }

    // Status counts for pipeline view
    const { data: statusRows } = await adminClient
      .from("showing_leads")
      .select("status");

    const status_counts: Record<string, number> = {
      open: 0, claimed: 0, in_progress: 0, completed: 0, cancelled: 0, no_show: 0,
    };
    statusRows?.forEach((r) => {
      const s = r.status as string;
      if (s in status_counts) status_counts[s]++;
    });

    return apiSuccess({ leads: data || [], total: count, status_counts, limit, offset });
  } catch (error) {
    console.error("Admin list showing leads error:", error);
    return apiError("Internal server error", 500);
  }
}
