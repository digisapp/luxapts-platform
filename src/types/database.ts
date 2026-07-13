// Database types for Staycio
// These mirror the Supabase schema

export type UserRole = "admin" | "agent" | "partner" | "renter";
export type BuildingStatus = "active" | "inactive" | "coming_soon";
export type LeadSource = "web_form" | "chat" | "voice";
export type LeadStatus = "new" | "contacted" | "touring" | "applied" | "leased" | "lost";
export type AssignmentStatus = "assigned" | "accepted" | "declined" | "reassigned";
export type AgentStatus = "active" | "paused";
export type ListingSourceType = "api" | "csv" | "manual" | "scrape";
export type EntityType = "building" | "floorplan" | "unit" | "doc";
export type UnitImageCategory = "interior" | "kitchen" | "bathroom" | "bedroom" | "living" | "view" | "other";
export type BuildingImageCategory = "exterior" | "lobby" | "amenity" | "pool" | "gym" | "rooftop" | "common" | "other";

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
  icon: string | null;
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

export interface UnitImage {
  id: string;
  unit_id: string;
  url: string;
  alt_text: string | null;
  category: UnitImageCategory | null;
  is_primary: boolean;
  sort_order: number;
  width: number | null;
  height: number | null;
  created_at: string;
}

export interface BuildingImage {
  id: string;
  building_id: string;
  url: string;
  alt_text: string | null;
  category: BuildingImageCategory | null;
  is_primary: boolean;
  sort_order: number;
  width: number | null;
  height: number | null;
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
  tour_date: string | null;
  tour_time: string | null;
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

export interface Partner {
  user_id: string;
  company_name: string;
  type: "building" | "brokerage";
  status: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
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
  images?: BuildingImage[];
}

export interface UnitWithRelations extends Unit {
  building?: BuildingWithRelations;
  floorplan?: Floorplan;
  latest_price?: UnitPriceSnapshot;
  images?: UnitImage[];
}

export interface LeadWithRelations extends Lead {
  city?: City;
  targets?: LeadTarget[];
  events?: LeadEvent[];
  assignments?: AgentAssignment[];
}

// =========================
// User tables (005_user_tables.sql)
// =========================

export interface UserFavorite {
  id: string;
  user_id: string;
  building_id: string | null;
  unit_id: string | null;
  created_at: string;
}

export interface UserSavedSearch {
  id: string;
  user_id: string;
  name: string;
  query_params: Record<string, unknown>;
  email_alerts: boolean;
  created_at: string;
  updated_at: string;
}

// =========================
// Analytics tables (007_analytics.sql)
// =========================

export type DeviceType = "desktop" | "tablet" | "mobile";

export interface PageView {
  id: string;
  session_id: string;
  user_id: string | null;
  path: string;
  referrer: string | null;
  user_agent: string | null;
  device_type: DeviceType | null;
  city_slug: string | null;
  duration_ms: number | null;
  created_at: string;
}

export interface BuildingView {
  id: string;
  session_id: string;
  user_id: string | null;
  building_id: string;
  source: string | null;
  time_on_page_ms: number | null;
  scrolled_to_bottom: boolean;
  viewed_gallery: boolean;
  clicked_contact: boolean;
  clicked_schedule_tour: boolean;
  created_at: string;
}

export interface AnalyticsEvent {
  id: string;
  session_id: string;
  user_id: string | null;
  event_name: string;
  event_category: string | null;
  properties: Record<string, unknown>;
  created_at: string;
}

export interface UserSession {
  id: string;
  session_id: string;
  user_id: string | null;
  first_seen_at: string;
  last_seen_at: string;
  page_views_count: number;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  country: string | null;
  city: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  landing_page: string | null;
  is_bounce: boolean;
}

// =========================
// Email tables (009/010 migrations)
// =========================

export interface EmailCampaign {
  id: string;
  subject: string;
  body_html: string;
  recipient_filter: Record<string, unknown>;
  recipients_count: number;
  sent_count: number;
  failed_count: number;
  status: "pending" | "sending" | "completed" | "partial_failure" | "failed";
  sent_at: string;
  created_by: string | null;
  created_at: string;
}

export type EmailDirection = "inbound" | "outbound";
export type EmailStatus =
  | "received"
  | "read"
  | "replied"
  | "sent"
  | "delivered"
  | "bounced"
  | "failed";

export interface Email {
  id: string;
  direction: EmailDirection;
  thread_id: string | null;
  resend_message_id: string | null;
  from_email: string;
  from_name: string | null;
  to_email: string;
  to_name: string | null;
  reply_to: string | null;
  cc: string | null;
  bcc: string | null;
  subject: string;
  body_html: string | null;
  body_text: string | null;
  status: EmailStatus;
  sent_by: string | null;
  lead_id: string | null;
  is_starred: boolean;
  metadata: Record<string, unknown>;
  headers: Record<string, unknown>;
  created_at: string;
  read_at: string | null;
  replied_at: string | null;
  ai_draft_html: string | null;
  ai_draft_text: string | null;
  ai_category: string | null;
  ai_confidence: number | null;
  ai_processed_at: string | null;
  ai_summary: string | null;
}

// =========================
// Platform settings (011_platform_settings.sql)
// =========================

export interface PlatformSetting {
  key: string;
  value: unknown;
  updated_at: string;
}

// =========================
// Shower program tables (012_showers.sql)
// =========================

export type ShowerStatus = "pending" | "approved" | "suspended" | "terminated";
export type ShowerTier = "rookie" | "premier" | "elite";
export type ShowerCertificationStatus =
  | "in_progress"
  | "shadow_pending"
  | "certified"
  | "expired";
export type ShowingLeadStatus =
  | "open"
  | "claimed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show";
export type ShowingClaimStatus = "active" | "cancelled" | "completed" | "no_show";
export type ApplicationLikelihood = "high" | "medium" | "low" | "already_interested";
export type ShowerEarningType =
  | "showing_fee"
  | "placement_bonus"
  | "mentorship_bonus"
  | "adjustment";
export type ShowerEarningStatus = "pending" | "approved" | "paid" | "cancelled";
export type ShowerStrikeType = "no_show" | "late_cancel" | "poor_conduct" | "low_rating";

export interface Shower {
  id: string;
  user_id: string;
  display_name: string;
  phone: string | null;
  photo_url: string | null;
  bio: string | null;
  status: ShowerStatus;
  tier: ShowerTier;
  total_showings: number;
  avg_rating: number;
  strike_count: number;
  agreement_accepted: boolean;
  agreement_accepted_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  suspension_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface BuildingCertificationContent {
  id: string;
  building_id: string;
  quiz_questions: unknown[];
  key_selling_points: string | null;
  amenity_notes: string | null;
  pet_policy_notes: string | null;
  parking_notes: string | null;
  pricing_notes: string | null;
  shadows_required: number;
  created_at: string;
  updated_at: string;
}

export interface ShowerCertification {
  id: string;
  shower_id: string;
  building_id: string;
  knowledge_attempts: number;
  knowledge_best_score: number | null;
  knowledge_passed_at: string | null;
  shadow_count: number;
  shadow_completed_at: string | null;
  certified_at: string | null;
  expires_at: string | null;
  status: ShowerCertificationStatus;
}

export interface ShadowSession {
  id: string;
  building_id: string;
  lead_shower_id: string;
  observer_shower_id: string;
  showing_lead_id: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  mentorship_bonus_paid: boolean;
  created_at: string;
}

export interface ShowingLead {
  id: string;
  building_id: string;
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
  preferred_date: string;
  preferred_time: string;
  unit_type: string | null;
  notes: string | null;
  special_instructions: string | null;
  status: ShowingLeadStatus;
  lease_signed: boolean;
  lease_signed_at: string | null;
  monthly_rent: number | null;
  posted_by: string | null;
  source_lead_id: string | null;
  created_at: string;
  expires_at: string | null;
}

export interface ShowingClaim {
  id: string;
  showing_lead_id: string;
  shower_id: string;
  claimed_at: string;
  status: ShowingClaimStatus;
  cancelled_at: string | null;
  cancel_notice_hours: number | null;
  cancel_reason: string | null;
}

export interface ShowingDebrief {
  id: string;
  showing_lead_id: string;
  shower_id: string;
  client_showed_up: boolean;
  interest_level: number | null;
  application_likelihood: ApplicationLikelihood | null;
  units_of_interest: string | null;
  client_objections: string | null;
  broker_notes: string | null;
  photo_urls: string[];
  client_rating: number | null;
  client_rating_received_at: string | null;
  submitted_at: string;
  admin_approved_at: string | null;
  admin_approved_by: string | null;
  admin_notes: string | null;
}

export interface ShowerEarning {
  id: string;
  shower_id: string;
  showing_lead_id: string | null;
  type: ShowerEarningType;
  amount: number;
  status: ShowerEarningStatus;
  description: string | null;
  approved_at: string | null;
  paid_at: string | null;
  monthly_rent: number | null;
  brokerage_commission: number | null;
  estimated_pay_date: string | null;
  created_at: string;
}

export interface CommissionRecord {
  id: string;
  showing_lead_id: string;
  monthly_rent: number;
  commission_amount: number;
  attribution: Record<string, number>;
  received_at: string;
  recorded_by: string;
  notes: string | null;
}

export interface ShowerStrike {
  id: string;
  shower_id: string;
  showing_lead_id: string | null;
  type: ShowerStrikeType;
  description: string | null;
  created_at: string;
  created_by: string;
}

// Extended shower types with relations
export interface ShowerWithProfile extends Shower {
  profile?: Pick<Profile, "full_name">;
}

export interface ShowingLeadWithRelations extends ShowingLead {
  building?: Pick<Building, "id" | "name" | "address_1">;
  showing_claims?: ShowingClaim[];
  showing_debriefs?: Pick<ShowingDebrief, "id" | "submitted_at" | "admin_approved_at" | "client_rating">[];
}

// =========================
// API Response types
// =========================
export interface SearchResult {
  building: BuildingWithRelations;
  unit: Pick<Unit, "id" | "unit_number" | "beds" | "baths" | "sqft" | "available_on" | "floorplan_id">;
  pricing: Pick<UnitPriceSnapshot, "rent" | "net_effective_rent" | "lease_term_months" | "captured_at"> | null;
  images?: UnitImage[];
  floorplan?: Pick<Floorplan, "id" | "name" | "layout_image_url"> | null;
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
