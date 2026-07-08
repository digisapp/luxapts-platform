import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-helpers";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { rateLimit, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";

// Analytics tables no longer have public RLS insert policies (they were
// spoofable/spammable via direct PostgREST calls) — all writes go through
// this route with the service-role client.

interface TrackingPayload {
  type: "page_view" | "building_view" | "event" | "session";
  session_id: string;
  user_id?: string;
  data: Record<string, unknown>;
}

function getDeviceType(userAgent: string): "desktop" | "tablet" | "mobile" {
  if (/tablet|ipad|playbook|silk/i.test(userAgent)) return "tablet";
  if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(userAgent)) return "mobile";
  return "desktop";
}

function parseUserAgent(userAgent: string): { browser: string; os: string } {
  let browser = "Unknown";
  let os = "Unknown";

  // Browser detection
  if (userAgent.includes("Chrome")) browser = "Chrome";
  else if (userAgent.includes("Safari")) browser = "Safari";
  else if (userAgent.includes("Firefox")) browser = "Firefox";
  else if (userAgent.includes("Edge")) browser = "Edge";

  // OS detection
  if (userAgent.includes("Windows")) os = "Windows";
  else if (userAgent.includes("Mac")) os = "macOS";
  else if (userAgent.includes("Linux")) os = "Linux";
  else if (userAgent.includes("Android")) os = "Android";
  else if (userAgent.includes("iOS") || userAgent.includes("iPhone")) os = "iOS";

  return { browser, os };
}

export async function POST(req: Request) {
  try {
    const clientIp = getClientIp(req);
    const rateLimitResult = rateLimit(`analytics:${clientIp}`, RATE_LIMITS.api);
    if (!rateLimitResult.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const supabase = createAdminClient();
    const body = (await req.json()) as TrackingPayload;
    const userAgent = req.headers.get("user-agent") || "";
    const deviceType = getDeviceType(userAgent);

    if (!body.session_id || !body.type) {
      return apiError("Missing required fields");
    }

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
        const { path, referrer, duration_ms, city_slug } = body.data as {
          path: string;
          referrer?: string;
          duration_ms?: number;
          city_slug?: string;
        };

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
        } = body.data as {
          building_id: string;
          source?: string;
          time_on_page_ms?: number;
          scrolled_to_bottom?: boolean;
          viewed_gallery?: boolean;
          clicked_contact?: boolean;
          clicked_schedule_tour?: boolean;
        };

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
        const { event_name, event_category, properties } = body.data as {
          event_name: string;
          event_category?: string;
          properties?: Record<string, unknown>;
        };

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
        } = body.data as {
          landing_page?: string;
          utm_source?: string;
          utm_medium?: string;
          utm_campaign?: string;
        };

        // Upsert session - create new or update existing
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
              is_bounce: false,
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

        // Increment page view count
        await supabase.rpc("increment_session_page_views", {
          p_session_id: body.session_id,
        });
        break;
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Analytics tracking error:", error);
    return apiError("Failed to track", 500);
  }
}
