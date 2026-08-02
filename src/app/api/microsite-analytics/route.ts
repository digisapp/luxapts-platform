import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { micrositeAnalyticsSchema, MICROSITE_DOMAINS } from "@/lib/validations";
import { rateLimit, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";

// Traffic tracking for the standalone building microsites. Writes into the
// platform's own page_views / analytics_events tables tagged with
// source_domain (migration 022), so microsite traffic and microsite leads
// (leads.source_detail, migration 021) report on the same key.

const ALLOWED_ORIGINS = new Set(
  MICROSITE_DOMAINS.flatMap((d) => [
    `https://${d}`,
    `https://www.${d}`,
    `https://${d.replace(/\./g, "")}.vercel.app`,
  ])
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

function deviceType(ua: string): "desktop" | "tablet" | "mobile" {
  if (/tablet|ipad|playbook|silk/i.test(ua)) return "tablet";
  if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) return "mobile";
  return "desktop";
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export async function POST(req: Request) {
  const cors = corsHeaders(req);
  try {
    const clientIp = getClientIp(req);
    const limit = rateLimit(`microsite-analytics:${clientIp}`, RATE_LIMITS.api);
    if (!limit.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: cors });
    }

    // navigator.sendBeacon may deliver as text/plain, so parse the raw body
    // rather than relying on req.json()'s content-type handling.
    const raw = await req.text();
    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400, headers: cors });
    }

    const parsed = micrositeAnalyticsSchema.safeParse(parsedBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid payload" },
        { status: 400, headers: cors }
      );
    }
    const body = parsed.data;

    const supabase = createAdminClient();
    const ua = req.headers.get("user-agent") || "";

    if (body.type === "pageview") {
      await supabase.from("page_views").insert({
        session_id: body.session_id,
        path: body.path,
        referrer: body.referrer || null,
        user_agent: ua.slice(0, 500),
        device_type: deviceType(ua),
        source_domain: body.domain,
      });
    } else {
      await supabase.from("analytics_events").insert({
        session_id: body.session_id,
        event_name: body.event_name,
        event_category: body.event_name === "form_submit" ? "conversion" : "engagement",
        properties: body.properties ?? {},
        source_domain: body.domain,
      });
    }

    // 204 keeps sendBeacon cheap — nothing to parse client-side.
    return new NextResponse(null, { status: 204, headers: cors });
  } catch (error) {
    console.error("Microsite analytics error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: cors });
  }
}
