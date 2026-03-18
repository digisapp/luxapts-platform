import { createAdminClient } from "@/lib/supabase/server";
import { getFirstRelation, aggregateByProperty } from "@/lib/db-helpers";
import type {
  AnalyticsDashboardData,
  LeadFunnelMetrics,
  LeadSourceMetrics,
  LeadTimeSeriesPoint,
  BuildingPerformance,
  CityLeadMetrics,
  NeighborhoodLeadMetrics,
} from "@/types/analytics";

// Get lead funnel counts by status
export async function getLeadFunnelMetrics(): Promise<LeadFunnelMetrics> {
  const supabase = createAdminClient();
  const { data } = await supabase.from("leads").select("status");

  const funnel: LeadFunnelMetrics = {
    new: 0,
    contacted: 0,
    touring: 0,
    applied: 0,
    leased: 0,
    lost: 0,
  };

  data?.forEach((lead) => {
    const status = lead.status as keyof LeadFunnelMetrics;
    if (status in funnel) {
      funnel[status]++;
    }
  });

  return funnel;
}

// Get lead source breakdown with percentages
export async function getLeadSourceMetrics(): Promise<LeadSourceMetrics[]> {
  const supabase = createAdminClient();
  const { data } = await supabase.from("leads").select("source");

  const counts: Record<string, number> = {
    web_form: 0,
    chat: 0,
    voice: 0,
  };

  data?.forEach((lead) => {
    if (lead.source in counts) {
      counts[lead.source]++;
    }
  });

  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return [
    {
      source: "web_form",
      count: counts.web_form,
      percentage: total > 0 ? Math.round((counts.web_form / total) * 100) : 0,
    },
    {
      source: "chat",
      count: counts.chat,
      percentage: total > 0 ? Math.round((counts.chat / total) * 100) : 0,
    },
    {
      source: "voice",
      count: counts.voice,
      percentage: total > 0 ? Math.round((counts.voice / total) * 100) : 0,
    },
  ];
}

// Get leads created in the last N days
export async function getLeadsOverTime(
  days: number = 30
): Promise<LeadTimeSeriesPoint[]> {
  const supabase = createAdminClient();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data } = await supabase
    .from("leads")
    .select("created_at")
    .gte("created_at", startDate.toISOString())
    .order("created_at", { ascending: true });

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
  data?.forEach((lead) => {
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

  let query = supabase.from(table).select("building_id");
  if (filter) {
    query = query.eq(filter.column, filter.value);
  }
  const { data: items } = await query;

  const { counts, topIds } = aggregateByProperty(
    items || [],
    (item) => (item as { building_id: string | null }).building_id,
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

  const { data: leads } = await supabase
    .from("leads")
    .select("city_id, cities(id, name)");

  const cityCounts: Record<string, { name: string; count: number }> = {};

  leads?.forEach((lead) => {
    if (lead.city_id && lead.cities) {
      const city = getFirstRelation(lead.cities as { id: string; name: string } | { id: string; name: string }[] | null);
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

  // Get lead_targets with building neighborhoods
  const { data: targets } = await supabase
    .from("lead_targets")
    .select("buildings(neighborhood_id, neighborhoods(id, name, cities(name)))");

  const neighborhoodCounts: Record<
    string,
    { name: string; cityName: string; count: number }
  > = {};

  targets?.forEach((t) => {
    type BuildingType = {
      neighborhood_id: string | null;
      neighborhoods: { id: string; name: string; cities: { name: string } | { name: string }[] | null } | { id: string; name: string; cities: { name: string } | { name: string }[] | null }[] | null;
    };
    const building = getFirstRelation(t.buildings as BuildingType | BuildingType[] | null);

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
