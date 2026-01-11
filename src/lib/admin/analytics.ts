import { createAdminClient } from "@/lib/supabase/server";
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

// Get top buildings by lead interest (lead_targets count)
export async function getTopBuildingsByLeads(
  limit: number = 10
): Promise<BuildingPerformance[]> {
  const supabase = createAdminClient();

  // Get lead_targets grouped by building
  const { data: targets } = await supabase
    .from("lead_targets")
    .select("building_id");

  const buildingCounts: Record<string, number> = {};
  targets?.forEach((t) => {
    if (t.building_id) {
      buildingCounts[t.building_id] = (buildingCounts[t.building_id] || 0) + 1;
    }
  });

  // Get top building IDs
  const topBuildingIds = Object.entries(buildingCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);

  if (topBuildingIds.length === 0) {
    return [];
  }

  // Fetch building details
  const { data: buildings } = await supabase
    .from("buildings")
    .select("id, name, neighborhoods(name)")
    .in("id", topBuildingIds);

  return (
    buildings?.map((b) => {
      const neighborhoods = b.neighborhoods as { name: string } | { name: string }[] | null;
      const neighborhoodName = Array.isArray(neighborhoods)
        ? neighborhoods[0]?.name
        : neighborhoods?.name;
      return {
        id: b.id,
        name: b.name,
        neighborhood: neighborhoodName || null,
        leadCount: buildingCounts[b.id] || 0,
        favoritesCount: 0,
        availableUnits: 0,
      };
    }) || []
  ).sort((a, b) => b.leadCount - a.leadCount);
}

// Get most favorited buildings
export async function getMostFavoritedBuildings(
  limit: number = 10
): Promise<BuildingPerformance[]> {
  const supabase = createAdminClient();

  // Get favorites grouped by building
  const { data: favorites } = await supabase
    .from("user_favorites")
    .select("building_id");

  const buildingCounts: Record<string, number> = {};
  favorites?.forEach((f) => {
    if (f.building_id) {
      buildingCounts[f.building_id] =
        (buildingCounts[f.building_id] || 0) + 1;
    }
  });

  // Get top building IDs
  const topBuildingIds = Object.entries(buildingCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);

  if (topBuildingIds.length === 0) {
    return [];
  }

  // Fetch building details
  const { data: buildings } = await supabase
    .from("buildings")
    .select("id, name, neighborhoods(name)")
    .in("id", topBuildingIds);

  return (
    buildings?.map((b) => {
      const neighborhoods = b.neighborhoods as { name: string } | { name: string }[] | null;
      const neighborhoodName = Array.isArray(neighborhoods)
        ? neighborhoods[0]?.name
        : neighborhoods?.name;
      return {
        id: b.id,
        name: b.name,
        neighborhood: neighborhoodName || null,
        leadCount: 0,
        favoritesCount: buildingCounts[b.id] || 0,
        availableUnits: 0,
      };
    }) || []
  ).sort((a, b) => b.favoritesCount - a.favoritesCount);
}

// Get buildings with most available units
export async function getBuildingsWithMostAvailable(
  limit: number = 10
): Promise<BuildingPerformance[]> {
  const supabase = createAdminClient();

  // Get available units grouped by building
  const { data: units } = await supabase
    .from("units")
    .select("building_id")
    .eq("is_available", true);

  const buildingCounts: Record<string, number> = {};
  units?.forEach((u) => {
    if (u.building_id) {
      buildingCounts[u.building_id] =
        (buildingCounts[u.building_id] || 0) + 1;
    }
  });

  // Get top building IDs
  const topBuildingIds = Object.entries(buildingCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);

  if (topBuildingIds.length === 0) {
    return [];
  }

  // Fetch building details
  const { data: buildings } = await supabase
    .from("buildings")
    .select("id, name, neighborhoods(name)")
    .in("id", topBuildingIds);

  return (
    buildings?.map((b) => {
      const neighborhoods = b.neighborhoods as { name: string } | { name: string }[] | null;
      const neighborhoodName = Array.isArray(neighborhoods)
        ? neighborhoods[0]?.name
        : neighborhoods?.name;
      return {
        id: b.id,
        name: b.name,
        neighborhood: neighborhoodName || null,
        leadCount: 0,
        favoritesCount: 0,
        availableUnits: buildingCounts[b.id] || 0,
      };
    }) || []
  ).sort((a, b) => b.availableUnits - a.availableUnits);
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
      const cities = lead.cities as { id: string; name: string } | { id: string; name: string }[];
      const city = Array.isArray(cities) ? cities[0] : cities;
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
    const buildings = t.buildings as BuildingType | BuildingType[] | null;
    const building = Array.isArray(buildings) ? buildings[0] : buildings;

    if (building?.neighborhoods) {
      const neighborhoods = building.neighborhoods;
      const n = Array.isArray(neighborhoods) ? neighborhoods[0] : neighborhoods;
      if (n && !neighborhoodCounts[n.id]) {
        const cities = n.cities;
        const city = Array.isArray(cities) ? cities[0] : cities;
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
