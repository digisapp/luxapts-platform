// Lead funnel metrics
export interface LeadFunnelMetrics {
  new: number;
  contacted: number;
  touring: number;
  applied: number;
  leased: number;
  lost: number;
}

// Lead source breakdown
export interface LeadSourceMetrics {
  source: "web_form" | "chat" | "voice";
  count: number;
  percentage: number;
}

// Leads over time data point
export interface LeadTimeSeriesPoint {
  date: string;
  count: number;
}

// Building performance metrics
export interface BuildingPerformance {
  id: string;
  name: string;
  neighborhood: string | null;
  leadCount: number;
  favoritesCount: number;
  availableUnits: number;
}

// City lead metrics
export interface CityLeadMetrics {
  cityId: string;
  cityName: string;
  leadCount: number;
}

// Neighborhood lead metrics
export interface NeighborhoodLeadMetrics {
  neighborhoodId: string;
  neighborhoodName: string;
  cityName: string;
  leadCount: number;
}

// Dashboard data bundle
export interface AnalyticsDashboardData {
  funnel: LeadFunnelMetrics;
  sources: LeadSourceMetrics[];
  leadsOverTime: LeadTimeSeriesPoint[];
  topBuildings: BuildingPerformance[];
  mostFavorited: BuildingPerformance[];
  buildingsWithAvailability: BuildingPerformance[];
  leadsByCity: CityLeadMetrics[];
  topNeighborhoods: NeighborhoodLeadMetrics[];
  totalLeads: number;
  newLeadsThisWeek: number;
  conversionRate: number;
}
