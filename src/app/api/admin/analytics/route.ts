import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { apiError } from "@/lib/api-helpers";
import { fetchAllRows, getFirstRelation } from "@/lib/db-helpers";
import { safeParseInt } from "@/lib/utils";

const CONVERSION_EVENTS = [
  "contact_clicked",
  "tour_scheduled",
  "lead_submitted",
  "favorite_added",
] as const;

export async function GET(req: Request) {
  const auth = await checkAdminAuth();
  if (!auth.isAdmin) {
    return apiError(auth.error || "Unauthorized", auth.status);
  }

  try {
    const { searchParams } = new URL(req.url);
    // Clamped: a bare parseInt let ?days=-5 / ?days=abc reach the RPCs and the
    // date filters as NaN or a negative window.
    const days = safeParseInt(searchParams.get("days"), 30, 1, 365);

    const supabase = createAdminClient();
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Every list read below is paged or counted server-side. Unpaged, each was
    // truncated at PostgREST's 1000 rows, so bounce rate, device split, top
    // pages, conversions and search averages were all computed from an
    // arbitrary first slice of the window.
    const [
      visitorStats,
      topEvents,
      buildingViews,
      sessions,
      conversionCountResults,
      pageViewRows,
      searches,
    ] = await Promise.all([
      // Daily visitor stats
      supabase.rpc("get_visitor_stats", { days_back: days }),

      // Top events
      supabase.rpc("get_top_events", { days_back: days, limit_count: 20 }),

      // Top viewed buildings
      supabase
        .from("building_views")
        .select("building_id, buildings(name, neighborhoods(name))")
        .gte("created_at", since)
        .limit(500),

      // Session summary + device breakdown (one read — they were the same
      // query against the same table)
      fetchAllRows<{
        device_type: string | null;
        browser: string | null;
        is_bounce: boolean | null;
        page_views_count: number | null;
      }>((from, to) =>
        supabase
          .from("user_sessions")
          .select("session_id, device_type, browser, is_bounce, page_views_count")
          .gte("first_seen_at", since)
          .order("session_id")
          .range(from, to)
      ),

      // Conversion events — counted in Postgres, one head count per event
      Promise.all(
        CONVERSION_EVENTS.map((name) =>
          supabase
            .from("analytics_events")
            .select("id", { count: "exact", head: true })
            .eq("event_category", "conversion")
            .eq("event_name", name)
            .gte("created_at", since)
        )
      ),

      // Top pages
      fetchAllRows<{ path: string }>((from, to) =>
        supabase
          .from("page_views")
          .select("id, path")
          .gte("created_at", since)
          .order("id")
          .range(from, to)
      ),

      // Search stats
      fetchAllRows<{
        city_slug: string | null;
        results_count: number | null;
        response_time_ms: number | null;
      }>((from, to) =>
        supabase
          .from("search_events")
          .select("id, city_slug, results_count, response_time_ms")
          .gte("created_at", since)
          .order("id")
          .range(from, to)
      ),
    ]);

    // Process building views for top buildings
    const buildingViewCounts: Record<string, { name: string; neighborhood: string | null; count: number }> = {};
    buildingViews.data?.forEach((bv) => {
      const id = bv.building_id;
      if (!buildingViewCounts[id]) {
        const building = getFirstRelation(bv.buildings);
        const neighborhood = getFirstRelation(building?.neighborhoods);
        buildingViewCounts[id] = {
          name: building?.name || "Unknown",
          neighborhood: neighborhood?.name || null,
          count: 0,
        };
      }
      buildingViewCounts[id].count++;
    });

    const topBuildings = Object.entries(buildingViewCounts)
      .map(([id, data]) => ({ building_id: id, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Process session stats
    const totalSessions = sessions.length;
    const bounces = sessions.filter((s) => s.is_bounce).length;
    const bounceRate = totalSessions > 0 ? Math.round((bounces / totalSessions) * 100) : 0;
    const avgPagesPerSession =
      totalSessions > 0
        ? Math.round((sessions.reduce((sum, s) => sum + (s.page_views_count || 1), 0) / totalSessions) * 10) / 10
        : 0;

    // Process device breakdown (same rows as the session summary)
    const devices = sessions;
    const deviceCounts = {
      desktop: devices.filter((d) => d.device_type === "desktop").length,
      mobile: devices.filter((d) => d.device_type === "mobile").length,
      tablet: devices.filter((d) => d.device_type === "tablet").length,
    };
    const totalDevices = devices.length || 1;
    const devicePercentages = {
      desktop: Math.round((deviceCounts.desktop / totalDevices) * 100),
      mobile: Math.round((deviceCounts.mobile / totalDevices) * 100),
      tablet: Math.round((deviceCounts.tablet / totalDevices) * 100),
    };

    // Process top pages
    const pageCounts: Record<string, number> = {};
    pageViewRows.forEach((pv) => {
      pageCounts[pv.path] = (pageCounts[pv.path] || 0) + 1;
    });
    const topPagesFormatted = Object.entries(pageCounts)
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Process conversion events
    const conversionCounts = {
      contact_clicked: 0,
      tour_scheduled: 0,
      lead_submitted: 0,
      favorite_added: 0,
    };
    CONVERSION_EVENTS.forEach((name, i) => {
      const res = conversionCountResults[i];
      if (res.error) console.error(`Conversion count error (${name}):`, res.error.message);
      conversionCounts[name] = res.count ?? 0;
    });

    // Process search stats
    const totalSearches = searches.length;
    const avgResults =
      totalSearches > 0
        ? Math.round(searches.reduce((sum, s) => sum + (s.results_count || 0), 0) / totalSearches)
        : 0;
    const avgResponseTime =
      totalSearches > 0
        ? Math.round(searches.reduce((sum, s) => sum + (s.response_time_ms || 0), 0) / totalSearches)
        : 0;

    // Search by city
    const searchByCity: Record<string, number> = {};
    searches.forEach((s) => {
      if (s.city_slug) {
        searchByCity[s.city_slug] = (searchByCity[s.city_slug] || 0) + 1;
      }
    });

    return NextResponse.json({
      period: { days },
      visitors: {
        daily: visitorStats.data || [],
        summary: {
          total_sessions: totalSessions,
          bounce_rate: bounceRate,
          avg_pages_per_session: avgPagesPerSession,
        },
      },
      devices: {
        counts: deviceCounts,
        percentages: devicePercentages,
      },
      pages: {
        top: topPagesFormatted,
      },
      buildings: {
        top_viewed: topBuildings,
      },
      events: {
        top: topEvents.data || [],
      },
      conversions: conversionCounts,
      search: {
        total: totalSearches,
        avg_results: avgResults,
        avg_response_time_ms: avgResponseTime,
        by_city: searchByCity,
      },
    });
  } catch (error) {
    console.error("Analytics API error:", error);
    return apiError("Failed to fetch analytics", 500);
  }
}
