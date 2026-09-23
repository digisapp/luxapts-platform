import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { Resend } from "resend";
import { createLeadSchema } from "@/lib/validations";
import { apiError } from "@/lib/api-helpers";
import { autoAssignAgent } from "@/lib/leads/routing";
import { bridgeLeadToShowing } from "@/lib/leads/bridge";
import { newLeadEmail, tourConfirmationEmail } from "@/lib/email/templates";
import {
  getLeadNotificationRecipients,
  getReplyToAddress,
  recordInternalLeadAlert,
} from "@/lib/email/recipients";
import { rateLimit, getClientIp, RATE_LIMITS, isInternalRequest } from "@/lib/rate-limit";
import type { CreateLeadResponse } from "@/types/database";

function isSameOrigin(req: Request): boolean {
  try {
    return new URL(req.headers.get("origin") || "").host === new URL(req.url).host;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  try {
    // Internal AI-tool calls are already bounded by the chat rate limit and a
    // per-conversation lead cap, and carry no client IP; only IP-limit external
    // callers.
    if (!isInternalRequest(req)) {
      // External calls come from staycio.com's own forms. A web_form lead
      // emails a tour confirmation to whatever address was posted, so without
      // this any script could make Staycio mail arbitrary inboxes.
      if (!isSameOrigin(req)) {
        return apiError("Forbidden", 403);
      }
      const clientIp = getClientIp(req);
      const rateLimitResult = rateLimit(`leads:${clientIp}`, RATE_LIMITS.leads);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: "Too many requests. Please wait a moment." },
          {
            status: 429,
            headers: {
              "X-RateLimit-Remaining": "0",
              "X-RateLimit-Reset": rateLimitResult.resetTime.toString(),
            },
          }
        );
      }
    }

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
        // `??` not `||`: beds === 0 is a studio, which `||` turned into null.
        beds: body.beds ?? null,
        move_in_date: body.move_in_date || null,
        tour_date: body.tour_date || null,
        tour_time: body.tour_time || null,
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

    // Internal alert lands in the admin inbox first. That write cannot bounce,
    // so a lead is visible at /admin/email the moment it is created regardless
    // of mail configuration.
    const alertHtml = newLeadEmail({
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
    });
    await recordInternalLeadAlert(supabase, {
      leadId,
      name: body.name,
      email: body.email,
      phone: body.phone,
      subject: `New Lead: ${body.name || "Anonymous"} · ${cityRes.data.name}`,
      html: alertHtml,
      sourceLabel: body.source,
    });

    // Optional push to a mailbox someone actually reads. Skipped entirely when
    // LEAD_NOTIFY_EMAIL is unset. Resend v6 reports API failures via the
    // returned `error`, not by throwing.
    if (process.env.RESEND_API_KEY) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        const fromEmail = process.env.FROM_EMAIL || "Staycio <hello@staycio.com>";
        const recipients = getLeadNotificationRecipients();

        if (recipients.length > 0) {
          const { error: notifyError } = await resend.emails.send({
            from: fromEmail,
            to: recipients,
            replyTo: body.email || undefined,
            subject: `New Lead: ${body.name || "Anonymous"} · ${cityRes.data.name}`,
            html: alertHtml,
          });
          if (notifyError) {
            console.error("Lead notification failed:", leadId, notifyError);
          }
        }
      } catch (emailError) {
        console.error("Email notification failed:", emailError);
        // Don't fail the request if email fails
      }
    }

    // Send tour confirmation to the renter (web_form only, requires email + building target)
    if (
      process.env.RESEND_API_KEY &&
      body.source === "web_form" &&
      body.email &&
      body.targets?.[0]?.building_id
    ) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        const fromEmail = process.env.FROM_EMAIL || "Staycio <hello@staycio.com>";

        // Fetch building name/address for the email
        const { data: bld } = await supabase
          .from("buildings")
          .select("id, name, address_1, zip, leasing_phone")
          .eq("id", body.targets[0].building_id)
          .single();

        if (bld && body.name) {
          // Resend v6 surfaces API failures on `error` and never throws, so a
          // rejected confirmation used to disappear silently.
          const { error: confirmError } = await resend.emails.send({
            from: fromEmail,
            to: [body.email],
            // Replies to FROM_EMAIL bounce (staycio.com has no MX record).
            replyTo: getReplyToAddress(),
            subject: `Tour request received — ${bld.name}`,
            html: tourConfirmationEmail({
              name: body.name,
              buildingName: bld.name,
              buildingAddress: `${bld.address_1}${bld.zip ? ` ${bld.zip}` : ""}`,
              preferredDate: body.tour_date ?? body.move_in_date ?? null,
              leasingPhone: bld.leasing_phone ?? null,
              buildingId: bld.id,
            }),
          });
          if (confirmError) {
            console.error("Tour confirmation email failed:", leadId, confirmError);
          }
        }
      } catch (confirmErr) {
        console.error("Tour confirmation email failed:", confirmErr);
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

    // Auto-bridge tour requests into the shower showing-lead pipeline
    await bridgeLeadToShowing(supabase, {
      leadId,
      buildingId: body.targets?.[0]?.building_id,
      name: body.name,
      email: body.email,
      phone: body.phone,
      tourDate: body.tour_date,
      tourTime: body.tour_time,
      notes: body.notes,
    });

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
        budget_min, budget_max, beds, move_in_date, source, source_detail, notes,
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
      // Sanitize search input: `%_\` are PostgREST LIKE wildcards, and
      // `,()"` are the separators of the .or() filter grammar itself — leaving
      // them in let a crafted search term rewrite the filter expression.
      const sanitized = search.replace(/[%_\\,()"]/g, "");
      if (sanitized.length > 0) {
        query = query.or(`name.ilike.%${sanitized}%,user_email.ilike.%${sanitized}%,user_phone.ilike.%${sanitized}%`);
      }
    }

    // Status counts come from head counts, one per status. Selecting every
    // lead's status and tallying in JS was capped at 1000 rows by PostgREST,
    // so the dashboard totals froze once the table grew past that.
    const STATUSES = ["new", "contacted", "touring", "applied", "leased", "lost"] as const;

    const [leadsResult, ...countResults] = await Promise.all([
      query,
      ...STATUSES.map((s) =>
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("status", s)
      ),
    ]);

    if (leadsResult.error) {
      console.error("List leads query error:", leadsResult.error);
      return apiError("Internal server error", 500);
    }

    const status_counts: Record<string, number> = {};
    STATUSES.forEach((s, i) => {
      const res = countResults[i];
      if (res.error) console.error(`Lead status count error (${s}):`, res.error.message);
      status_counts[s] = res.count ?? 0;
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
