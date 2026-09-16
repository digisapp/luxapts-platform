import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { Resend } from "resend";
import { micrositeLeadSchema } from "@/lib/validations";
import { corsHeaders, isAllowedOrigin } from "@/lib/microsite-cors";
import { apiError } from "@/lib/api-helpers";
import { autoAssignAgent } from "@/lib/leads/routing";
import { newLeadEmail, micrositeWaitlistEmail } from "@/lib/email/templates";
import {
  getLeadNotificationRecipients,
  getReplyToAddress,
  recordInternalLeadAlert,
} from "@/lib/email/recipients";
import { rateLimit, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";

// Cross-origin lead capture from the building microsites. Each microsite is a
// static page on its own domain, so this route must answer CORS preflights and
// echo back allowed origins.

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export async function POST(req: Request) {
  const cors = corsHeaders(req);
  if (!isAllowedOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const clientIp = getClientIp(req);
    const rateLimitResult = rateLimit(`microsite-leads:${clientIp}`, RATE_LIMITS.leads);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a moment." },
        { status: 429, headers: cors }
      );
    }

    const rawBody = await req.json();
    const parsed = micrositeLeadSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid request" },
        { status: 400, headers: cors }
      );
    }
    const body = parsed.data;

    // Honeypot tripped — pretend success, store nothing.
    if (body.website) {
      return NextResponse.json({ ok: true }, { status: 201, headers: cors });
    }

    const supabase = createAdminClient();

    const cityRes = await supabase
      .from("cities")
      .select("id, name, slug")
      .eq("slug", "miami")
      .single();
    if (cityRes.error || !cityRes.data) {
      return apiError("City not found", 404);
    }

    const prefs = [
      body.unit_type && `Unit: ${body.unit_type}`,
      body.bedrooms && `Bedrooms: ${body.bedrooms}`,
      body.move_in && `Move-in: ${body.move_in}`,
      body.intent && `Intent: ${body.intent}`,
      body.stay_type && `Stay type: ${body.stay_type}`,
    ]
      .filter(Boolean)
      .join(" · ");
    const notes = `[${body.domain}] ${body.building}${prefs ? ` — ${prefs}` : ""}`;

    // Preferred insert uses source='microsite' + source_detail (migration 021).
    // Until that migration runs, fall back to the legacy-compatible shape with
    // attribution folded into notes.
    let leadInsert = await supabase
      .from("leads")
      .insert({
        source: "microsite",
        source_detail: body.domain,
        city_id: cityRes.data.id,
        name: body.name,
        user_email: body.email,
        user_phone: body.phone || null,
        notes,
        status: "new",
      })
      .select("id")
      .single();

    if (leadInsert.error) {
      leadInsert = await supabase
        .from("leads")
        .insert({
          source: "web_form",
          city_id: cityRes.data.id,
          name: body.name,
          user_email: body.email,
        user_phone: body.phone || null,
          notes,
          status: "new",
        })
        .select("id")
        .single();
    }

    if (leadInsert.error) {
      console.error("Microsite lead insert error:", leadInsert.error);
      return NextResponse.json(
        { error: "Failed to save — please try again." },
        { status: 500, headers: cors }
      );
    }

    const leadId = leadInsert.data.id;

    // Link to the building record when it exists in the catalog (e.g. Jade Brickell).
    // `building` is free text from the microsite form. `%` and `_` are LIKE
    // wildcards and PostgREST rewrites `*` to `%`, so an unescaped value could
    // match (and link the lead to) an arbitrary building.
    const buildingPattern = body.building
      .replace(/[\\%_]/g, "\\$&")
      .replace(/\*/g, "");

    const buildingRes = await supabase
      .from("buildings")
      .select("id")
      .eq("city_id", cityRes.data.id)
      .ilike("name", buildingPattern)
      .limit(1)
      .maybeSingle();
    if (buildingRes.data) {
      await supabase.from("lead_targets").insert({
        lead_id: leadId,
        building_id: buildingRes.data.id,
        rank: 1,
      });
    }

    await supabase.from("lead_events").insert({
      lead_id: leadId,
      type: "lead_created",
      payload: {
        source: "microsite",
        domain: body.domain,
        building: body.building,
        city: cityRes.data.name,
      },
    });

    // Internal alert lands in the admin inbox first. That write cannot bounce,
    // which is what mattered here: every microsite lead alert had been mailed
    // to an address on a domain with no MX record and silently lost.
    const alertHtml = newLeadEmail({
      leadId,
      city: cityRes.data.name,
      source: `microsite (${body.domain})`,
      name: body.name,
      email: body.email,
      phone: body.phone,
      notes,
      buildingName: body.building,
    });
    await recordInternalLeadAlert(supabase, {
      leadId,
      name: body.name,
      email: body.email,
      subject: `New Microsite Lead: ${body.name} · ${body.building}`,
      html: alertHtml,
      sourceLabel: `microsite (${body.domain})`,
    });

    // Optional push to a mailbox someone actually reads. Skipped entirely when
    // LEAD_NOTIFY_EMAIL is unset.
    if (process.env.RESEND_API_KEY) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        const fromEmail = process.env.FROM_EMAIL || "Staycio <hello@staycio.com>";
        const recipients = getLeadNotificationRecipients();
        if (recipients.length > 0) {
          const { error: notifyError } = await resend.emails.send({
            from: fromEmail,
            to: recipients,
            replyTo: body.email,
            subject: `New Microsite Lead: ${body.name} · ${body.building}`,
            html: alertHtml,
          });
          if (notifyError) {
            console.error("Microsite lead notification failed:", leadId, notifyError);
          }
        }

        // Confirmation to the person who signed up. The microsite shows
        // "You're on the list!" client-side and, until now, nothing ever
        // followed it — every waitlist signup went unacknowledged.
        const { error: confirmError } = await resend.emails.send({
          from: fromEmail,
          to: [body.email],
          replyTo: getReplyToAddress(),
          subject: `You're on the waitlist for ${body.building}`,
          html: micrositeWaitlistEmail({
            name: body.name,
            buildingName: body.building,
            city: cityRes.data.name,
            citySlug: cityRes.data.slug ?? null,
            domain: body.domain,
            moveIn: body.move_in ?? null,
            unitType: body.unit_type ?? null,
          }),
        });
        if (confirmError) {
          console.error("Microsite waitlist confirmation failed:", leadId, confirmError);
        }
      } catch (emailError) {
        console.error("Microsite lead email failed:", emailError);
      }
    }

    const assignedAgentId = await autoAssignAgent(supabase, leadId, cityRes.data.id);
    if (assignedAgentId) {
      await supabase.from("lead_events").insert({
        lead_id: leadId,
        type: "agent_assigned",
        payload: { agent_user_id: assignedAgentId, method: "auto_routed" },
      });
    }

    return NextResponse.json({ ok: true, lead_id: leadId }, { status: 201, headers: cors });
  } catch (error) {
    console.error("Microsite lead error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: cors }
    );
  }
}
