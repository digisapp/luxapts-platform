import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { Resend } from "resend";
import { micrositeLeadSchema, MICROSITE_DOMAINS } from "@/lib/validations";
import { apiError } from "@/lib/api-helpers";
import { autoAssignAgent } from "@/lib/leads/routing";
import { newLeadEmail } from "@/lib/email/templates";
import { rateLimit, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";

// Cross-origin lead capture from the building microsites. Each microsite is a
// static page on its own domain, so this route must answer CORS preflights and
// echo back allowed origins.

const ALLOWED_ORIGINS = new Set(
  MICROSITE_DOMAINS.flatMap((d) => [`https://${d}`, `https://www.${d}`])
);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  if (!ALLOWED_ORIGINS.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export async function POST(req: Request) {
  const cors = corsHeaders(req);
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
      .select("id, name")
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
    const buildingRes = await supabase
      .from("buildings")
      .select("id")
      .eq("city_id", cityRes.data.id)
      .ilike("name", body.building)
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

    if (process.env.RESEND_API_KEY) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        const fromEmail = process.env.FROM_EMAIL || "Staycio <hello@staycio.com>";
        const toEmail = fromEmail.includes("<")
          ? fromEmail.split("<")[1].replace(">", "")
          : fromEmail;
        await resend.emails.send({
          from: fromEmail,
          to: [toEmail],
          subject: `New Microsite Lead: ${body.name} · ${body.building}`,
          html: newLeadEmail({
            leadId,
            city: cityRes.data.name,
            source: `microsite (${body.domain})`,
            name: body.name,
            email: body.email,
            notes,
          }),
        });
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
