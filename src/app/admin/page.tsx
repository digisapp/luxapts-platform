import { createAdminClient } from "@/lib/supabase/server";
import { fetchDashboardAnalytics } from "@/lib/admin/analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Building2, TrendingUp, Calendar } from "lucide-react";
import { LeadFunnelChart } from "@/components/admin/analytics/LeadFunnelChart";
import { LeadSourceChart } from "@/components/admin/analytics/LeadSourceChart";
import { LeadsOverTimeChart } from "@/components/admin/analytics/LeadsOverTimeChart";
import { BuildingPerformanceTable } from "@/components/admin/analytics/BuildingPerformanceTable";
import { GeographicInsights } from "@/components/admin/analytics/GeographicInsights";
import { VisitorAnalytics } from "@/components/admin/analytics/VisitorAnalytics";
import { QuickActions } from "@/components/admin/dashboard/QuickActions";
import { ActivityFeed, type ActivityEvent } from "@/components/admin/dashboard/ActivityFeed";

export const dynamic = "force-dynamic";

async function fetchQuickActionCounts(supabase: ReturnType<typeof createAdminClient>) {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [newLeadsRes, allBuildingsRes, buildingImagesRes, scrapeStatusRes, leadsRes, assignmentsRes] =
    await Promise.all([
      // New leads count
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("status", "new"),
      // All active building IDs
      supabase
        .from("buildings")
        .select("id")
        .eq("status", "active"),
      // Building images (to find buildings with 0)
      supabase
        .from("building_images")
        .select("building_id"),
      // Scrape status for stale check
      supabase
        .from("building_scrape_status")
        .select("building_id, units_scraped_at"),
      // All lead IDs for unassigned check
      supabase
        .from("leads")
        .select("id")
        .neq("status", "lost")
        .neq("status", "leased"),
      // All assignments to find unassigned leads
      supabase
        .from("agent_assignments")
        .select("lead_id"),
    ]);

  const newLeadsCount = newLeadsRes.count || 0;

  // Buildings with 0 images
  const buildingIdsWithImages = new Set(
    (buildingImagesRes.data || []).map((img) => img.building_id)
  );
  const buildingsNeedImages = (allBuildingsRes.data || []).filter(
    (b) => !buildingIdsWithImages.has(b.id)
  ).length;

  // Stale scrapes: buildings where units_scraped_at is null or > 7 days old
  const scrapedMap = new Map(
    (scrapeStatusRes.data || []).map((s) => [s.building_id, s.units_scraped_at])
  );
  const staleScrapes = (allBuildingsRes.data || []).filter((b) => {
    const scrapedAt = scrapedMap.get(b.id);
    if (!scrapedAt) return true;
    return new Date(scrapedAt).getTime() < sevenDaysAgo.getTime();
  }).length;

  // Unassigned leads
  const assignedLeadIds = new Set(
    (assignmentsRes.data || []).map((a) => a.lead_id)
  );
  const unassignedLeads = (leadsRes.data || []).filter(
    (l) => !assignedLeadIds.has(l.id)
  ).length;

  return { newLeadsCount, buildingsNeedImages, staleScrapes, unassignedLeads };
}

async function fetchActivityFeed(supabase: ReturnType<typeof createAdminClient>): Promise<ActivityEvent[]> {
  const [leadEventsRes, scrapeJobsRes, assignmentsRes] = await Promise.all([
    supabase
      .from("lead_events")
      .select("id, lead_id, type, payload, created_at")
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("scrape_jobs")
      .select("id, type, status, buildings_processed, created_at")
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("agent_assignments")
      .select("id, lead_id, agent_user_id, assigned_at, status, profiles:agent_user_id(full_name)")
      .order("assigned_at", { ascending: false })
      .limit(10),
  ]);

  const events: ActivityEvent[] = [];

  (leadEventsRes.data || []).forEach((e) => {
    events.push({
      id: `le-${e.id}`,
      type: "lead_event",
      description: `Lead event: ${e.type}`,
      timestamp: e.created_at,
      link: `/admin/leads/${e.lead_id}`,
    });
  });

  (scrapeJobsRes.data || []).forEach((j) => {
    events.push({
      id: `sj-${j.id}`,
      type: "scrape_job",
      description: `Scrape ${j.type}: ${j.status} (${j.buildings_processed || 0} buildings)`,
      timestamp: j.created_at,
      link: "/admin/scraping",
    });
  });

  (assignmentsRes.data || []).forEach((a) => {
    const profiles = a.profiles as { full_name: string | null } | { full_name: string | null }[] | null;
    const profile = Array.isArray(profiles) ? profiles[0] : profiles;
    const agentName = profile?.full_name || "Unknown agent";
    events.push({
      id: `aa-${a.id}`,
      type: "assignment",
      description: `Lead ${a.status} to ${agentName}`,
      timestamp: a.assigned_at,
      link: `/admin/leads/${a.lead_id}`,
    });
  });

  // Sort by timestamp descending, take top 10
  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return events.slice(0, 10);
}

export default async function AdminDashboardPage() {
  const supabase = createAdminClient();

  // Fetch all data in parallel
  const [analytics, buildingsRes, citiesRes, recentLeads, quickActions, activityFeed] =
    await Promise.all([
      fetchDashboardAnalytics(),
      supabase.from("buildings").select("id", { count: "exact" }).eq("status", "active"),
      supabase.from("cities").select("id", { count: "exact" }),
      supabase
        .from("leads")
        .select("id, name, user_email, status, created_at, cities:city_id(name)")
        .order("created_at", { ascending: false })
        .limit(5),
      fetchQuickActionCounts(supabase),
      fetchActivityFeed(supabase),
    ]);

  const activeBuildings = buildingsRes.count || 0;
  const activeCities = citiesRes.count || 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Command center for LuxApts</p>
      </div>

      {/* Quick Actions */}
      <QuickActions
        newLeadsCount={quickActions.newLeadsCount}
        buildingsNeedImages={quickActions.buildingsNeedImages}
        staleScrapes={quickActions.staleScrapes}
        unassignedLeads={quickActions.unassignedLeads}
      />

      {/* Activity Feed */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <ActivityFeed events={activityFeed} />
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.totalLeads}</div>
            <p className="text-xs text-muted-foreground">
              {analytics.funnel.new} new leads pending
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Buildings</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeBuildings}</div>
            <p className="text-xs text-muted-foreground">
              Across {activeCities} cities
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {analytics.conversionRate > 0 ? `${analytics.conversionRate}%` : "--"}
            </div>
            <p className="text-xs text-muted-foreground">
              {analytics.funnel.leased} leads converted to leased
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">This Week</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.newLeadsThisWeek}</div>
            <p className="text-xs text-muted-foreground">
              New leads in last 7 days
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Lead Metrics */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Lead Conversion Funnel</CardTitle>
          </CardHeader>
          <CardContent>
            <LeadFunnelChart data={analytics.funnel} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Leads by Source</CardTitle>
          </CardHeader>
          <CardContent>
            <LeadSourceChart data={analytics.sources} />
          </CardContent>
        </Card>
      </div>

      {/* Leads Over Time */}
      <Card>
        <CardHeader>
          <CardTitle>Leads Over Time (Last 30 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          <LeadsOverTimeChart data={analytics.leadsOverTime} />
        </CardContent>
      </Card>

      {/* Building Performance */}
      <Card>
        <CardHeader>
          <CardTitle>Building Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <BuildingPerformanceTable
            topBuildings={analytics.topBuildings}
            mostFavorited={analytics.mostFavorited}
            buildingsWithAvailability={analytics.buildingsWithAvailability}
          />
        </CardContent>
      </Card>

      {/* Visitor Analytics */}
      <Card>
        <CardHeader>
          <CardTitle>Visitor Analytics</CardTitle>
        </CardHeader>
        <CardContent>
          <VisitorAnalytics days={30} />
        </CardContent>
      </Card>

      {/* Geographic Insights */}
      <GeographicInsights
        leadsByCity={analytics.leadsByCity}
        topNeighborhoods={analytics.topNeighborhoods}
      />

      {/* Recent Leads */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Leads</CardTitle>
        </CardHeader>
        <CardContent>
          {recentLeads.data?.length ? (
            <div className="space-y-4">
              {recentLeads.data.map((lead) => (
                <div
                  key={lead.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div>
                    <p className="font-medium">{lead.name || "Unnamed Lead"}</p>
                    <p className="text-sm text-muted-foreground">
                      {lead.user_email || "No email"} •{" "}
                      {(() => {
                        const city = lead.cities as { name: string } | { name: string }[] | null;
                        return Array.isArray(city) ? city[0]?.name : city?.name;
                      })() || "Unknown city"}
                    </p>
                  </div>
                  <div className="text-right">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        lead.status === "new"
                          ? "bg-green-100 text-green-800"
                          : lead.status === "contacted"
                          ? "bg-blue-100 text-blue-800"
                          : lead.status === "touring"
                          ? "bg-purple-100 text-purple-800"
                          : lead.status === "applied"
                          ? "bg-yellow-100 text-yellow-800"
                          : lead.status === "leased"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {lead.status}
                    </span>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(lead.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">
              No leads yet. They will appear here when captured.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
