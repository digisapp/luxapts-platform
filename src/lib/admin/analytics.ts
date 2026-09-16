import { createAdminClient } from "@/lib/supabase/server";
import { fetchAllRows, getFirstRelation, aggregateByProperty } from "@/lib/db-helpers";
import type {
  AnalyticsDashboardData,
  LeadFunnelMetrics,
  LeadSourceMetrics,
  LeadTimeSeriesPoint,
  BuildingPerformance,
  CityLeadMetrics,
  NeighborhoodLeadMetrics,
} from "@/types/analytics";

const LEAD_STATUSES = [
  "new",
  "contacted",
  "touring",
  "applied",
  "leased",
  "lost",
] as const satisfies readonly (keyof LeadFunnelMetrics)[];

// 'microsite' has existed since migration 021 and is now the source of
// essentially every production lead; leaving it out of this list reported the
// funnel as empty on the analytics dashboard.
const LEAD_SOURCES = ["web_form", "chat", "voice", "microsite"] as const;

/** Exact row count for a single-column equality filter (head:true sends no rows). */
async function countLeads(column: string, value: string): Promise<number> {
  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq(column, value);
  if (error) {
    console.error(`Lead count error (${column}=${value}):`, error.message);
    return 0;
  }
  return count ?? 0;
}

// Get lead funnel counts by status.
// Counted in Postgres — selecting every lead's status and tallying in JS was
// silently capped at PostgREST's 1000 rows, freezing the funnel totals.
export async function getLeadFunnelMetrics(): Promise<LeadFunnelMetrics> {
  const counts = await Promise.all(
    LEAD_STATUSES.map((status) => countLeads("status", status))
  );

  const funnel: LeadFunnelMetrics = {
    new: 0,
    contacted: 0,
    touring: 0,
    applied: 0,
    leased: 0,
    lost: 0,
  };
  LEAD_STATUSES.forEach((status, i) => {
    funnel[status] = counts[i];
  });

  return funnel;
}

// Get lead source breakdown with percentages (counted in Postgres, see above)
export async function getLeadSourceMetrics(): Promise<LeadSourceMetrics[]> {
  const counts = await Promise.all(
    LEAD_SOURCES.map((source) => countLeads("source", source))
  );

  const total = counts.reduce((a, b) => a + b, 0);

  return LEAD_SOURCES.map((source, i) => ({
    source,
    count: counts[i],
    percentage: total > 0 ? Math.round((counts[i] / total) * 100) : 0,
  }));
}

// Get leads created in the last N days
export async function getLeadsOverTime(
  days: number = 30
): Promise<LeadTimeSeriesPoint[]> {
  const supabase = createAdminClient();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const data = await fetchAllRows<{ created_at: string }>((from, to) =>
    supabase
      .from("leads")
      .select("id, created_at")
      .gte("created_at", startDate.toISOString())
      .order("created_at", { ascending: true })
      .order("id")
      .range(from, to)
  );

  // Group by date
  const countsByDate: Record<string, number> = {};

  // Initialize all dates in range
  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() - (days - 1 - i));
    const dateStr = date.toISOString().split("T")[0];
    countsByDate[dateStr] = 0;
  }

  // Count leads per date
  data.forEach((lead) => {
    const dateStr = lead.created_at.split("T")[0];
    if (dateStr in countsByDate) {
      countsByDate[dateStr]++;
    }
  });

  return Object.entries(countsByDate).map(([date, count]) => ({
    date,
    count,
  }));
}

// Shared helper: fetch items from a table, aggregate by building_id, enrich with building details
async function getTopBuildingsByMetric(
  table: string,
  metricField: "leadCount" | "favoritesCount" | "availableUnits",
  limit: number = 10,
  filter?: { column: string; value: unknown },
): Promise<BuildingPerformance[]> {
  const supabase = createAdminClient();

  // Paged: an unpaged select stopped at 1000 rows, so "top buildings" was
  // really "top buildings among the first 1000 rows of the table".
  const items = await fetchAllRows<{ building_id: string | null }>((from, to) => {
    let query = supabase.from(table).select("id, building_id");
    if (filter) {
      query = query.eq(filter.column, filter.value);
    }
    return query.order("id").range(from, to) as unknown as PromiseLike<{
      data: { building_id: string | null }[] | null;
      error: unknown;
    }>;
  });

  const { counts, topIds } = aggregateByProperty(
    items,
    (item) => item.building_id,
    limit,
  );

  if (topIds.length === 0) return [];

  const { data: buildings } = await supabase
    .from("buildings")
    .select("id, name, neighborhoods(name)")
    .in("id", topIds);

  return (
    buildings?.map((b) => ({
      id: b.id,
      name: b.name,
      neighborhood: getFirstRelation(b.neighborhoods as { name: string } | { name: string }[] | null)?.name || null,
      leadCount: metricField === "leadCount" ? counts[b.id] || 0 : 0,
      favoritesCount: metricField === "favoritesCount" ? counts[b.id] || 0 : 0,
      availableUnits: metricField === "availableUnits" ? counts[b.id] || 0 : 0,
    })) || []
  ).sort((a, b) => (b[metricField] as number) - (a[metricField] as number));
}

// Get top buildings by lead interest (lead_targets count)
export function getTopBuildingsByLeads(limit: number = 10): Promise<BuildingPerformance[]> {
  return getTopBuildingsByMetric("lead_targets", "leadCount", limit);
}

// Get most favorited buildings
export function getMostFavoritedBuildings(limit: number = 10): Promise<BuildingPerformance[]> {
  return getTopBuildingsByMetric("user_favorites", "favoritesCount", limit);
}

// Get buildings with most available units
export function getBuildingsWithMostAvailable(limit: number = 10): Promise<BuildingPerformance[]> {
  return getTopBuildingsByMetric("units", "availableUnits", limit, { column: "is_available", value: true });
}

// Get leads grouped by city
export async function getLeadsByCity(): Promise<CityLeadMetrics[]> {
  const supabase = createAdminClient();

  type CityRel = { id: string; name: string };
  const leads = await fetchAllRows<{ city_id: string | null; cities: CityRel | CityRel[] | null }>(
    (from, to) =>
      supabase
        .from("leads")
        .select("id, city_id, cities(id, name)")
        .order("id")
        .range(from, to) as unknown as PromiseLike<{
        data: { city_id: string | null; cities: CityRel | CityRel[] | null }[] | null;
        error: unknown;
      }>
  );

  const cityCounts: Record<string, { name: string; count: number }> = {};

  leads.forEach((lead) => {
    if (lead.city_id && lead.cities) {
      const city = getFirstRelation(lead.cities);
      if (city && !cityCounts[city.id]) {
        cityCounts[city.id] = { name: city.name, count: 0 };
      }
      if (city) {
        cityCounts[city.id].count++;
      }
    }
  });

  return Object.entries(cityCounts)
    .map(([cityId, { name, count }]) => ({
      cityId,
      cityName: name,
      leadCount: count,
    }))
    .sort((a, b) => b.leadCount - a.leadCount);
}

// Get top neighborhoods by lead interest
export async function getTopNeighborhoods(
  limit: number = 10
): Promise<NeighborhoodLeadMetrics[]> {
  const supabase = createAdminClient();

  type NeighborhoodRel = {
    id: string;
    name: string;
    cities: { name: string } | { name: string }[] | null;
  };
  type BuildingType = {
    neighborhood_id: string | null;
    neighborhoods: NeighborhoodRel | NeighborhoodRel[] | null;
  };

  // Get lead_targets with building neighborhoods (paged past the 1000-row cap)
  const targets = await fetchAllRows<{ buildings: BuildingType | BuildingType[] | null }>(
    (from, to) =>
      supabase
        .from("lead_targets")
        .select("id, buildings(neighborhood_id, neighborhoods(id, name, cities(name)))")
        .order("id")
        .range(from, to) as unknown as PromiseLike<{
        data: { buildings: BuildingType | BuildingType[] | null }[] | null;
        error: unknown;
      }>
  );

  const neighborhoodCounts: Record<
    string,
    { name: string; cityName: string; count: number }
  > = {};

  targets.forEach((t) => {
    const building = getFirstRelation(t.buildings);

    if (building?.neighborhoods) {
      const n = getFirstRelation(building.neighborhoods);
      if (n && !neighborhoodCounts[n.id]) {
        const city = getFirstRelation(n.cities);
        neighborhoodCounts[n.id] = {
          name: n.name,
          cityName: city?.name || "Unknown",
          count: 0,
        };
      }
      if (n) {
        neighborhoodCounts[n.id].count++;
      }
    }
  });

  return Object.entries(neighborhoodCounts)
    .map(([neighborhoodId, { name, cityName, count }]) => ({
      neighborhoodId,
      neighborhoodName: name,
      cityName,
      leadCount: count,
    }))
    .sort((a, b) => b.leadCount - a.leadCount)
    .slice(0, limit);
}

// Main function to fetch all analytics data
export async function fetchDashboardAnalytics(): Promise<AnalyticsDashboardData> {
  const [
    funnel,
    sources,
    leadsOverTime,
    topBuildings,
    mostFavorited,
    buildingsWithAvailability,
    leadsByCity,
    topNeighborhoods,
  ] = await Promise.all([
    getLeadFunnelMetrics(),
    getLeadSourceMetrics(),
    getLeadsOverTime(30),
    getTopBuildingsByLeads(10),
    getMostFavoritedBuildings(10),
    getBuildingsWithMostAvailable(10),
    getLeadsByCity(),
    getTopNeighborhoods(10),
  ]);

  // Calculate totals
  const totalLeads = Object.values(funnel).reduce((a, b) => a + b, 0);
  const leasedCount = funnel.leased;
  const conversionRate =
    totalLeads > 0 ? Math.round((leasedCount / totalLeads) * 100) : 0;

  // Count new leads this week
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const newLeadsThisWeek = leadsOverTime
    .filter((p) => new Date(p.date) >= weekAgo)
    .reduce((sum, p) => sum + p.count, 0);

  return {
    funnel,
    sources,
    leadsOverTime,
    topBuildings,
    mostFavorited,
    buildingsWithAvailability,
    leadsByCity,
    topNeighborhoods,
    totalLeads,
    newLeadsThisWeek,
    conversionRate,
  };
}
