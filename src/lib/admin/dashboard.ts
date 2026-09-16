import { createAdminClient } from "@/lib/supabase/server";
import { fetchAllRows, getFirstRelation } from "@/lib/db-helpers";
import type { ActivityEvent } from "@/components/admin/dashboard/ActivityFeed";

export async function fetchQuickActionCounts(supabase: ReturnType<typeof createAdminClient>) {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Every list read here is paged. Unpaged, each stopped at PostgREST's
    // 1000-row cap, so "buildings needing images", "stale scrapes" and
    // "unassigned leads" were all computed from a truncated slice — a building
    // whose images sat past row 1000 was reported as having none.
    const [newLeadsRes, allBuildings, buildingImages, scrapeStatus, openLeads, assignments] =
      await Promise.all([
        supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "new"),
        fetchAllRows<{ id: string }>((from, to) =>
          supabase.from("buildings").select("id").eq("status", "active").order("id").range(from, to)
        ),
        fetchAllRows<{ building_id: string }>((from, to) =>
          supabase
            .from("building_images")
            .select("building_id")
            .order("building_id")
            .order("id")
            .range(from, to)
        ),
        fetchAllRows<{ building_id: string; units_scraped_at: string | null }>((from, to) =>
          supabase
            .from("building_scrape_status")
            .select("building_id, units_scraped_at")
            .order("building_id")
            .range(from, to)
        ),
        fetchAllRows<{ id: string }>((from, to) =>
          supabase
            .from("leads")
            .select("id")
            .neq("status", "lost")
            .neq("status", "leased")
            .order("id")
            .range(from, to)
        ),
        fetchAllRows<{ lead_id: string }>((from, to) =>
          supabase.from("agent_assignments").select("id, lead_id").order("id").range(from, to)
        ),
      ]);

    const newLeadsCount = newLeadsRes.count || 0;

    const buildingIdsWithImages = new Set(buildingImages.map(img => img.building_id));
    const buildingsNeedImages = allBuildings.filter(
      b => !buildingIdsWithImages.has(b.id)
    ).length;

    const scrapedMap = new Map(scrapeStatus.map(s => [s.building_id, s.units_scraped_at]));
    const staleScrapes = allBuildings.filter(b => {
      const scrapedAt = scrapedMap.get(b.id);
      if (!scrapedAt) return true;
      return new Date(scrapedAt).getTime() < sevenDaysAgo.getTime();
    }).length;

    const assignedLeadIds = new Set(assignments.map(a => a.lead_id));
    const unassignedLeads = openLeads.filter(
      l => !assignedLeadIds.has(l.id)
    ).length;

    return { newLeadsCount, buildingsNeedImages, staleScrapes, unassignedLeads };
  } catch (error) {
    console.error("fetchQuickActionCounts error:", error);
    return { newLeadsCount: 0, buildingsNeedImages: 0, staleScrapes: 0, unassignedLeads: 0 };
  }
}

export async function fetchActivityFeed(supabase: ReturnType<typeof createAdminClient>): Promise<ActivityEvent[]> {
  try {
    const [leadEventsRes, scrapeJobsRes, assignmentsRes] = await Promise.all([
      supabase
        .from("lead_events")
        .select("id, lead_id, type, payload, created_at")
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("scrape_jobs")
        .select("id, job_type, status, buildings_processed, created_at")
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("agent_assignments")
        .select("id, lead_id, agent_user_id, assigned_at, status, profiles:agent_user_id(full_name)")
        .order("assigned_at", { ascending: false })
        .limit(10),
    ]);

    const events: ActivityEvent[] = [];

    (leadEventsRes.data || []).forEach(e => {
      events.push({
        id: `le-${e.id}`,
        type: "lead_event",
        description: `Lead event: ${e.type}`,
        timestamp: e.created_at,
        link: `/admin/leads/${e.lead_id}`,
      });
    });

    (scrapeJobsRes.data || []).forEach(j => {
      events.push({
        id: `sj-${j.id}`,
        type: "scrape_job",
        description: `Scrape ${j.job_type}: ${j.status} (${j.buildings_processed || 0} buildings)`,
        timestamp: j.created_at,
        link: "/admin/scraping",
      });
    });

    (assignmentsRes.data || []).forEach(a => {
      const profile = getFirstRelation(a.profiles as { full_name: string | null } | { full_name: string | null }[] | null);
      const agentName = profile?.full_name || "Unknown agent";
      events.push({
        id: `aa-${a.id}`,
        type: "assignment",
        description: `Lead ${a.status} to ${agentName}`,
        timestamp: a.assigned_at,
        link: `/admin/leads/${a.lead_id}`,
      });
    });

    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return events.slice(0, 10);
  } catch (error) {
    console.error("fetchActivityFeed error:", error);
    return [];
  }
}
