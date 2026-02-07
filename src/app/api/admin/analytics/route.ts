import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/lib/admin/auth";

export async function GET(req: Request) {
  const auth = await checkAdminAuth();
  if (!auth.isAdmin) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get("days") || "30");

    const supabase = createAdminClient();

    // Fetch all analytics data in parallel
    const [
      visitorStats,
      topEvents,
      buildingViews,
      sessionStats,
      conversionEvents,
      deviceBreakdown,
      topPages,
      searchStats,
    ] = await Promise.all([
      // Daily visitor stats
      supabase.rpc("get_visitor_stats", { days_back: days }),

      // Top events
      supabase.rpc("get_top_events", { days_back: days, limit_count: 20 }),

      // Top viewed buildings
      supabase
        .from("building_views")
        .select("building_id, buildings(name, neighborhoods(name))")
        .gte("created_at", new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
        .limit(500),

      // Session summary
      supabase
        .from("user_sessions")
        .select("device_type, browser, is_bounce, page_views_count")
        .gte("first_seen_at", new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()),

      // Conversion events count
      supabase
        .from("analytics_events")
        .select("event_name, properties")
        .eq("event_category", "conversion")
        .gte("created_at", new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()),

      // Device breakdown
      supabase
        .from("user_sessions")
        .select("device_type")
        .gte("first_seen_at", new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()),

      // Top pages
      supabase
        .from("page_views")
        .select("path")
        .gte("created_at", new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
        .limit(1000),

      // Search stats
      supabase
        .from("search_events")
        .select("city_slug, results_count, response_time_ms")
        .gte("created_at", new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()),
    ]);

    // Process building views for top buildings
    const buildingViewCounts: Record<string, { name: string; neighborhood: string | null; count: number }> = {};
    buildingViews.data?.forEach((bv) => {
      const id = bv.building_id;
      if (!buildingViewCounts[id]) {
        // Handle both array and object return types from Supabase
        const buildingsData = bv.buildings;
        const building = Array.isArray(buildingsData) ? buildingsData[0] : buildingsData;
        const neighborhoods = building?.neighborhoods;
        const neighborhood = Array.isArray(neighborhoods) ? neighborhoods[0] : neighborhoods;
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
    const sessions = sessionStats.data || [];
    const totalSessions = sessions.length;
    const bounces = sessions.filter((s) => s.is_bounce).length;
    const bounceRate = totalSessions > 0 ? Math.round((bounces / totalSessions) * 100) : 0;
    const avgPagesPerSession =
      totalSessions > 0
        ? Math.round((sessions.reduce((sum, s) => sum + (s.page_views_count || 1), 0) / totalSessions) * 10) / 10
        : 0;

    // Process device breakdown
    const devices = deviceBreakdown.data || [];
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
    topPages.data?.forEach((pv) => {
      pageCounts[pv.path] = (pageCounts[pv.path] || 0) + 1;
    });
    const topPagesFormatted = Object.entries(pageCounts)
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Process conversion events
    const conversions = conversionEvents.data || [];
    const conversionCounts = {
      contact_clicked: conversions.filter((c) => c.event_name === "contact_clicked").length,
      tour_scheduled: conversions.filter((c) => c.event_name === "tour_scheduled").length,
      lead_submitted: conversions.filter((c) => c.event_name === "lead_submitted").length,
      favorite_added: conversions.filter((c) => c.event_name === "favorite_added").length,
    };

    // Process search stats
    const searches = searchStats.data || [];
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
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
}
