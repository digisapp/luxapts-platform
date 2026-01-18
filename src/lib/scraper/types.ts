// Types for the AI-powered building scraper

export interface ScrapedUnit {
  unit_number?: string;
  floor?: string;
  beds: number;
  baths: number;
  sqft?: number;
  rent: number;
  available_on?: string;
  floorplan_name?: string;
  view?: string;
  features?: string[];
}

export interface ScrapedAmenity {
  name: string;
  category?: string;
  description?: string;
}

export interface ScrapedBuildingData {
  // Building info
  name?: string;
  address?: string;
  phone?: string;
  email?: string;
  leasing_hours?: string;

  // Units
  units: ScrapedUnit[];
  total_available?: number;

  // Amenities
  amenities: ScrapedAmenity[];

  // Policies
  pet_policy?: string;
  parking_policy?: string;
  deposit_policy?: string;

  // Move-in specials
  move_in_specials?: string[];

  // Metadata
  scraped_at: string;
  source_url: string;
}

export interface ScrapeResult {
  success: boolean;
  data?: ScrapedBuildingData;
  error?: string;
  raw_html_length?: number;
  ai_tokens_used?: number;
}

export interface ScrapeJobResult {
  building_id: string;
  building_name: string;
  success: boolean;
  units_found: number;
  amenities_found: number;
  error?: string;
}
