import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { Resend } from "resend";
import { createLeadSchema } from "@/lib/validations";
import { apiError } from "@/lib/api-helpers";
import { autoAssignAgent } from "@/lib/leads/routing";
import { newLeadEmail } from "@/lib/email/templates";
import type { CreateLeadResponse } from "@/types/database";

export async function POST(req: Request) {
  try {
    const rawBody = await req.json();

    // Validate with Zod schema (email, phone, budget, dates, etc.)
    const parsed = createLeadSchema.safeParse(rawBody);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message || "Invalid request");
    }

    const body = parsed.data;

    const supabase = createAdminClient();

    // Resolve city
    const cityRes = await supabase
      .from("cities")
      .select("id, slug, name")
      .eq("slug", body.city_slug)
      .single();

    if (cityRes.error || !cityRes.data) {
      return apiError("City not found", 404);
    }

    // Create lead
    const leadInsert = await supabase
      .from("leads")
      .insert({
        source: body.source,
        city_id: cityRes.data.id,
        name: body.name || null,
        user_email: body.email || null,
        user_phone: body.phone || null,
        budget_min: body.budget_min || null,
        budget_max: body.budget_max || null,
        beds: body.beds || null,
        move_in_date: body.move_in_date || null,
        notes: body.notes || null,
        status: "new",
      })
      .select("id, status, created_at")
      .single();

    if (leadInsert.error) {
      console.error("Lead insert error:", leadInsert.error);
      return apiError("Failed to create lead", 500);
    }

    const leadId = leadInsert.data.id;

    // Insert lead targets if provided
    if (body.targets?.length) {
      const targetRows = body.targets.map((t) => ({
        lead_id: leadId,
        building_id: t.building_id || null,
        unit_id: t.unit_id || null,
        rank: t.rank || null,
      }));

      await supabase.from("lead_targets").insert(targetRows);
    }

    // Log conversation summary if provided
    if (body.conversation_summary) {
      await supabase.from("lead_events").insert({
        lead_id: leadId,
        type: "conversation_summary",
        payload: { summary: body.conversation_summary },
      });
    }

    // Log lead creation event
    await supabase.from("lead_events").insert({
      lead_id: leadId,
      type: "lead_created",
      payload: {
        source: body.source,
        city: cityRes.data.name,
      },
    });

    // Send notification email (only if Resend is configured)
    if (process.env.RESEND_API_KEY) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        const fromEmail = process.env.FROM_EMAIL || "LuxApts <hello@luxapts.co>";
        const toEmail = fromEmail.includes("<")
          ? fromEmail.split("<")[1].replace(">", "")
          : fromEmail;

        await resend.emails.send({
          from: fromEmail,
          to: [toEmail],
          subject: `New Lead: ${body.name || "Anonymous"} · ${cityRes.data.name}`,
          html: newLeadEmail({
            leadId,
            city: cityRes.data.name,
            source: body.source,
            name: body.name,
            email: body.email,
            phone: body.phone,
            budgetMin: body.budget_min,
            budgetMax: body.budget_max,
            beds: body.beds,
            moveInDate: body.move_in_date,
            notes: body.notes,
          }),
        });
      } catch (emailError) {
        console.error("Email notification failed:", emailError);
        // Don't fail the request if email fails
      }
    }

    // Auto-assign an agent via load-balanced round-robin
    const assignedAgentId = await autoAssignAgent(supabase, leadId, cityRes.data.id);

    if (assignedAgentId) {
      await supabase.from("lead_events").insert({
        lead_id: leadId,
        type: "agent_assigned",
        payload: { agent_user_id: assignedAgentId, method: "auto_routed" },
      });
    }

    const response: CreateLeadResponse = {
      lead_id: leadId,
      status: leadInsert.data.status,
      assigned_agent_user_id: assignedAgentId,
      next_steps: assignedAgentId
        ? ["agent_outreach", "schedule_tour"]
        : ["pending_agent_assignment", "schedule_tour"],
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error("Create lead error:", error);
    return apiError("Internal server error", 500);
  }
}

// GET endpoint to list leads (admin only)
export async function GET(req: Request) {
  try {
    const auth = await checkAdminAuth();
    if (!auth.isAdmin) {
      return apiError(auth.error || "Unauthorized", auth.status);
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const source = searchParams.get("source");
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "25", 10) || 25, 1), 100);
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10) || 0, 0);

    const supabase = createAdminClient();

    let query = supabase
      .from("leads")
      .select(`
        id, created_at, status, name, user_email, user_phone,
        budget_min, budget_max, beds, move_in_date, source, notes,
        cities:city_id (name, slug)
      `, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq("status", status);
    }

    if (source) {
      query = query.eq("source", source);
    }

    if (search) {
      // Sanitize search input to prevent wildcard injection
      const sanitized = search.replace(/[%_\\]/g, "");
      if (sanitized.length > 0) {
        query = query.or(`name.ilike.%${sanitized}%,user_email.ilike.%${sanitized}%,user_phone.ilike.%${sanitized}%`);
      }
    }

    // Fetch leads and status counts in parallel
    const [leadsResult, statusCountsResult] = await Promise.all([
      query,
      supabase.from("leads").select("status"),
    ]);

    if (leadsResult.error) {
      console.error("List leads query error:", leadsResult.error);
      return apiError("Internal server error", 500);
    }

    // Aggregate status counts
    const status_counts: Record<string, number> = {
      new: 0,
      contacted: 0,
      touring: 0,
      applied: 0,
      leased: 0,
      lost: 0,
    };
    statusCountsResult.data?.forEach((row) => {
      const s = row.status as string;
      if (s in status_counts) {
        status_counts[s]++;
      }
    });

    return NextResponse.json({
      leads: leadsResult.data,
      total: leadsResult.count,
      limit,
      offset,
      status_counts,
    });
  } catch (error) {
    console.error("List leads error:", error);
    return apiError("Internal server error", 500);
  }
}
