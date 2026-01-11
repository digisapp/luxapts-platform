// CSV row structure for buildings
export interface BuildingCSVRow {
  name: string;
  address_1: string;
  address_2?: string;
  zip?: string;
  city_slug: string;
  neighborhood_slug?: string;
  year_built?: number;
  stories?: number;
  description?: string;
  website_url?: string;
  leasing_phone?: string;
  leasing_email?: string;
  pet_policy?: string;
  parking_policy?: string;
  status?: "active" | "inactive" | "coming_soon";
}

// Validation result for a single row
export interface RowValidationResult {
  rowIndex: number;
  isValid: boolean;
  errors: string[];
  warnings: string[];
  data: BuildingCSVRow;
}

// Overall validation response
export interface ValidationResponse {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  results: RowValidationResult[];
}

// Import progress
export interface ImportProgress {
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  currentRow?: string;
  status: "idle" | "validating" | "importing" | "complete" | "error";
}

// Import result for a single row
export interface ImportRowResult {
  rowIndex: number;
  success: boolean;
  building_id?: string;
  error?: string;
  action: "created" | "updated" | "skipped" | "failed";
}

// Final import response
export interface ImportResponse {
  success: boolean;
  total: number;
  created: number;
  updated: number;
  failed: number;
  results: ImportRowResult[];
}
