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
  /** Shortest lease term offered (months), when the source page shows terms */
  lease_term_months?: number;
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

export interface ScrapedImage {
  url: string;
  alt_text?: string;
  category: 'exterior' | 'lobby' | 'amenity' | 'pool' | 'gym' | 'rooftop' | 'common' | 'interior' | 'kitchen' | 'bathroom' | 'bedroom' | 'living' | 'view' | 'floorplan' | 'other';
  /** Whether this looks like a primary/hero image */
  is_hero?: boolean;
  /** Estimated width from srcset or attributes */
  width?: number;
  /** Estimated height from srcset or attributes */
  height?: number;
}

export interface ImageScrapeResult {
  building_images: ScrapedImage[];
  unit_images: ScrapedImage[];
  gallery_page_url?: string;
}

export interface ScrapeJobResult {
  building_id: string;
  building_name: string;
  success: boolean;
  units_found: number;
  amenities_found: number;
  images_found?: number;
  error?: string;
}
