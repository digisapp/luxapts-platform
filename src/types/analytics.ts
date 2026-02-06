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

// ================================
// Visitor Analytics Types
// ================================

export interface DailyVisitorStats {
  date: string;
  unique_visitors: number;
  total_page_views: number;
  pages_per_session: number;
  bounce_rate: number;
}

export interface DeviceStats {
  counts: {
    desktop: number;
    mobile: number;
    tablet: number;
  };
  percentages: {
    desktop: number;
    mobile: number;
    tablet: number;
  };
}

export interface TopPage {
  path: string;
  count: number;
}

export interface TopBuilding {
  building_id: string;
  name: string;
  neighborhood: string | null;
  count: number;
}

export interface TopEvent {
  event_name: string;
  event_category: string | null;
  event_count: number;
}

export interface ConversionCounts {
  contact_clicked: number;
  tour_scheduled: number;
  lead_submitted: number;
  favorite_added: number;
}

export interface SearchStats {
  total: number;
  avg_results: number;
  avg_response_time_ms: number;
  by_city: Record<string, number>;
}

export interface VisitorAnalytics {
  period: { days: number };
  visitors: {
    daily: DailyVisitorStats[];
    summary: {
      total_sessions: number;
      bounce_rate: number;
      avg_pages_per_session: number;
    };
  };
  devices: DeviceStats;
  pages: {
    top: TopPage[];
  };
  buildings: {
    top_viewed: TopBuilding[];
  };
  events: {
    top: TopEvent[];
  };
  conversions: ConversionCounts;
  search: SearchStats;
}
