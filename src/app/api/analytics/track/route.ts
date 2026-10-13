import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-helpers";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { rateLimit, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { analyticsTrackSchema } from "@/lib/validations";
import { getDeviceType, parseUserAgent } from "@/lib/analytics/user-agent";

// Analytics tables no longer have public RLS insert policies (they were
// spoofable/spammable via direct PostgREST calls) — all writes go through
// this route with the service-role client.

export async function POST(req: Request) {
  try {
    const clientIp = getClientIp(req);
    const rateLimitResult = await rateLimit(`analytics:${clientIp}`, RATE_LIMITS.api);
    if (!rateLimitResult.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const supabase = createAdminClient();

    // Validate before touching `body.data` — an absent or non-object `data`
    // used to throw a TypeError and surface as a 500.
    const rawBody = await req.json().catch(() => null);
    const parsed = analyticsTrackSchema.safeParse(rawBody);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message || "Invalid payload");
    }
    const body = parsed.data;

    // Skipped under `next dev`, like search_events: .env.local points at the
    // prod database, so local browsing landed in the real traffic numbers.
    if (process.env.NODE_ENV === "development") {
      return NextResponse.json({ success: true });
    }

    const userAgent = req.headers.get("user-agent") || "";
    const deviceType = getDeviceType(userAgent);

    // Never trust a client-supplied user_id — it can be used to attribute
    // events/sessions to arbitrary real users. Resolve it from the session
    // cookie instead; anonymous visitors get null.
    const sessionClient = await createClient();
    const {
      data: { user },
    } = await sessionClient.auth.getUser();
    const userId = user?.id ?? null;

    switch (body.type) {
      case "page_view": {
        const { path, referrer, duration_ms, city_slug } = body.data;

        // The session row is created with page_views_count = 1 and
        // is_bounce = true, which stands for the landing page. Each later
        // view in the session bumps the count and clears the bounce. A
        // page_view carrying duration_ms is the unmount ping for a view that
        // was already counted (useAnalytics.trackPageDuration), not a new one.
        let isLaterView = false;
        if (duration_ms == null) {
          const { data: earlier } = await supabase
            .from("page_views")
            .select("id")
            .eq("session_id", body.session_id)
            .is("duration_ms", null)
            .limit(1);
          isLaterView = (earlier?.length ?? 0) > 0;
        }

        await supabase.from("page_views").insert({
          session_id: body.session_id,
          user_id: userId,
          path,
          referrer,
          user_agent: userAgent,
          device_type: deviceType,
          city_slug,
          duration_ms,
        });

        if (isLaterView) {
          await supabase.rpc("increment_session_page_views", {
            p_session_id: body.session_id,
          });
        }
        break;
      }

      case "building_view": {
        const {
          building_id,
          source,
          time_on_page_ms,
          scrolled_to_bottom,
          viewed_gallery,
          clicked_contact,
          clicked_schedule_tour,
        } = body.data;

        await supabase.from("building_views").insert({
          session_id: body.session_id,
          user_id: userId,
          building_id,
          source,
          time_on_page_ms,
          scrolled_to_bottom,
          viewed_gallery,
          clicked_contact,
          clicked_schedule_tour,
        });
        break;
      }

      case "event": {
        const { event_name, event_category, properties } = body.data;

        await supabase.from("analytics_events").insert({
          session_id: body.session_id,
          user_id: userId,
          event_name,
          event_category,
          properties: properties || {},
        });
        break;
      }

      case "session": {
        const { browser, os } = parseUserAgent(userAgent);
        const {
          landing_page,
          utm_source,
          utm_medium,
          utm_campaign,
        } = body.data;

        // Upsert session - create new or update existing. page_views_count
        // and is_bounce are left to their defaults (1, true) and only moved
        // by later page views: setting is_bounce: false here, plus an
        // increment on this once-per-session event, recorded every session
        // as 2 pages and no bounce.
        const { error } = await supabase
          .from("user_sessions")
          .upsert(
            {
              session_id: body.session_id,
              user_id: userId,
              last_seen_at: new Date().toISOString(),
              device_type: deviceType,
              browser,
              os,
              landing_page,
              utm_source,
              utm_medium,
              utm_campaign,
            },
            {
              onConflict: "session_id",
              ignoreDuplicates: false,
            }
          );

        if (error) {
          // If upsert fails (new session), try insert
          await supabase.from("user_sessions").insert({
            session_id: body.session_id,
            user_id: userId,
            device_type: deviceType,
            browser,
            os,
            landing_page,
            utm_source,
            utm_medium,
            utm_campaign,
          });
        }
        break;
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Analytics tracking error:", error);
    return apiError("Failed to track", 500);
  }
}
