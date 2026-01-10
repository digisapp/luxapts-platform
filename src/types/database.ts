// Database types for LuxApts
// These mirror the Supabase schema

export type UserRole = "admin" | "agent" | "partner" | "renter";
export type BuildingStatus = "active" | "inactive" | "coming_soon";
export type LeadSource = "web_form" | "chat" | "voice";
export type LeadStatus = "new" | "contacted" | "touring" | "applied" | "leased" | "lost";
export type AssignmentStatus = "assigned" | "accepted" | "declined" | "reassigned";
export type AgentStatus = "active" | "paused";
export type ListingSourceType = "api" | "csv" | "manual" | "scrape";
export type EntityType = "building" | "floorplan" | "unit" | "doc";

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string | null;
  phone: string | null;
  created_at: string;
}

export interface City {
  id: string;
  name: string;
  slug: string;
  state: string | null;
  country: string;
  center_lat: number | null;
  center_lng: number | null;
  created_at: string;
}

export interface Neighborhood {
  id: string;
  city_id: string;
  name: string;
  slug: string;
  center_lat: number | null;
  center_lng: number | null;
  polygon_geojson: unknown | null;
  created_at: string;
}

export interface Building {
  id: string;
  city_id: string;
  neighborhood_id: string | null;
  partner_user_id: string | null;
  name: string;
  address_1: string;
  address_2: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  year_built: number | null;
  stories: number | null;
  description: string | null;
  website_url: string | null;
  leasing_phone: string | null;
  leasing_email: string | null;
  pet_policy: string | null;
  parking_policy: string | null;
  deposit_policy: string | null;
  move_in_fees: Record<string, unknown> | null;
  status: BuildingStatus;
  created_at: string;
}

export interface Amenity {
  id: string;
  name: string;
  category: string | null;
  created_at: string;
}

export interface BuildingAmenity {
  building_id: string;
  amenity_id: string;
  details: string | null;
  created_at: string;
}

export interface Floorplan {
  id: string;
  building_id: string;
  name: string;
  beds: number;
  baths: number;
  sqft_min: number | null;
  sqft_max: number | null;
  layout_image_url: string | null;
  tour_3d_url: string | null;
  notes: string | null;
  created_at: string;
}

export interface Unit {
  id: string;
  building_id: string;
  floorplan_id: string | null;
  unit_number: string | null;
  floor: string | null;
  view: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  is_available: boolean;
  available_on: string | null;
  created_at: string;
}

export interface UnitPriceSnapshot {
  id: string;
  unit_id: string;
  captured_at: string;
  rent: number;
  net_effective_rent: number | null;
  lease_term_months: number | null;
  concessions: string | null;
  deposit: number | null;
  fees: Record<string, unknown> | null;
  source_id: string | null;
}

export interface ListingSource {
  id: string;
  name: string;
  type: ListingSourceType;
  notes: string | null;
  status: string;
  created_at: string;
}

export interface BuildingFact {
  id: string;
  building_id: string;
  key: string;
  value: unknown;
  source: string | null;
  updated_at: string;
}

export interface BuildingDocument {
  id: string;
  building_id: string;
  title: string;
  content: string;
  source: string | null;
  created_at: string;
}

export interface Embedding {
  id: string;
  entity_type: EntityType;
  entity_id: string;
  content: string;
  embedding: number[];
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Lead {
  id: string;
  created_at: string;
  city_id: string | null;
  name: string | null;
  user_email: string | null;
  user_phone: string | null;
  budget_min: number | null;
  budget_max: number | null;
  beds: number | null;
  move_in_date: string | null;
  preferred_neighborhoods: unknown | null;
  source: LeadSource;
  status: LeadStatus;
  notes: string | null;
}

export interface LeadTarget {
  id: string;
  lead_id: string;
  building_id: string | null;
  unit_id: string | null;
  rank: number | null;
}

export interface LeadEvent {
  id: string;
  lead_id: string;
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface Agent {
  user_id: string;
  city_id: string | null;
  service_area: unknown | null;
  status: AgentStatus;
  commission_rate: number | null;
  created_at: string;
}

export interface AgentAssignment {
  id: string;
  lead_id: string;
  agent_user_id: string;
  assigned_at: string;
  status: AssignmentStatus;
  reason: string | null;
}

// Extended types with relations
export interface BuildingWithRelations extends Building {
  city?: City;
  neighborhood?: Neighborhood;
  amenities?: Amenity[];
}

export interface UnitWithRelations extends Unit {
  building?: BuildingWithRelations;
  floorplan?: Floorplan;
  latest_price?: UnitPriceSnapshot;
}

export interface LeadWithRelations extends Lead {
  city?: City;
  targets?: LeadTarget[];
  events?: LeadEvent[];
  assignments?: AgentAssignment[];
}

// API Response types
export interface SearchResult {
  building: BuildingWithRelations;
  unit: Pick<Unit, "id" | "unit_number" | "beds" | "baths" | "sqft" | "available_on">;
  pricing: Pick<UnitPriceSnapshot, "rent" | "net_effective_rent" | "lease_term_months" | "captured_at"> | null;
}

export interface SearchResponse {
  city: string;
  captured_at_max: string | null;
  results: SearchResult[];
}

export interface CompareBuilding {
  id: string;
  name: string;
  amenities: string[];
  policies: {
    pets: string | null;
    parking: string | null;
  };
  price_stats: {
    by_beds: Record<string, { min: number; median: number; max: number }>;
  };
}

export interface CompareResponse {
  captured_at_max: string | null;
  building_a: CompareBuilding;
  building_b: CompareBuilding;
  deltas: {
    amenities_only_in_a: string[];
    amenities_only_in_b: string[];
  };
}

export interface CreateLeadRequest {
  source: LeadSource;
  city_slug: string;
  name?: string;
  email?: string;
  phone?: string;
  budget_min?: number;
  budget_max?: number;
  beds?: number;
  move_in_date?: string;
  notes?: string;
  targets?: { building_id?: string; unit_id?: string; rank?: number }[];
  conversation_summary?: string;
}

export interface CreateLeadResponse {
  lead_id: string;
  status: LeadStatus;
  assigned_agent_user_id: string | null;
  next_steps: string[];
}
