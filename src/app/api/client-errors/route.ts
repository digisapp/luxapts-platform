import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-helpers";
import { createAdminClient } from "@/lib/supabase/server";
import { rateLimit, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { clientErrorSchema } from "@/lib/validations";
import { getDeviceType, isBotUserAgent, osMajorVersion, parseUserAgent } from "@/lib/analytics/user-agent";
import { pathOnly, scrubText } from "@/lib/client-errors/scrub";

// Errors from visitors' browsers (sent by src/lib/client-errors/report.ts).
// Stored as analytics_events rows with event_category "error" — the table
// was built with that category in mind — so /admin/errors can show what
// broke, on which page and browser, and for how many sessions.

const noContent = () => new NextResponse(null, { status: 204 });

export async function POST(req: Request) {
  try {
    const limit = await rateLimit(`client-errors:${getClientIp(req)}`, RATE_LIMITS.clientErrors);
    if (!limit.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const parsed = clientErrorSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message || "Invalid payload");
    }
    const body = parsed.data;

    // .env.local points at the prod database: local errors stay local
    if (process.env.NODE_ENV === "development") return noContent();

    const userAgent = req.headers.get("user-agent") || "";
    // Scanners and headless crawlers throw on half the site; not our visitors
    if (isBotUserAgent(userAgent)) return noContent();

    const { browser, os } = parseUserAgent(userAgent);
    const version = osMajorVersion(userAgent);
    const extra = body.extra
      ? Object.fromEntries(
          Object.entries(body.extra).map(([k, v]) => [k, typeof v === "string" ? scrubText(v) : v])
        )
      : undefined;

    const { error } = await createAdminClient()
      .from("analytics_events")
      .insert({
        session_id: body.session_id || "none",
        event_name: "client_error",
        event_category: "error",
        properties: {
          source: body.source,
          message: scrubText(body.message).slice(0, 500),
          name: body.name ?? null,
          stack: body.stack ? scrubText(body.stack).slice(0, 4000) : null,
          path: pathOnly(body.path),
          browser,
          os: version ? `${os} ${version}` : os,
          device: getDeviceType(userAgent),
          // Which deploy threw it
          release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
          ...(extra && { extra }),
        },
      });
    if (error) console.error("client-errors: insert failed:", error.message);

    return noContent();
  } catch (err) {
    // An error report must never become an error of its own
    console.error("client-errors:", err);
    return noContent();
  }
}
