import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import type {
  BuildingCSVRow,
  ValidationResponse,
  RowValidationResult,
} from "@/types/import";

export async function POST(req: Request) {
  try {
    // Check admin authentication
    const authResult = await checkAdminAuth();
    if (!authResult.isAdmin) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const { rows } = (await req.json()) as { rows: BuildingCSVRow[] };

    if (!rows || !Array.isArray(rows)) {
      return NextResponse.json(
        { error: "Invalid request: rows must be an array" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Fetch all valid city slugs
    const { data: cities } = await supabase.from("cities").select("id, slug");
    const validCitySlugs = new Set(cities?.map((c) => c.slug) || []);
    const cityIdMap = new Map(cities?.map((c) => [c.slug, c.id]) || []);

    // Fetch all valid neighborhood slugs by city
    const { data: neighborhoods } = await supabase
      .from("neighborhoods")
      .select("slug, city_id");

    const validNeighborhoods = new Map<string, Set<string>>();
    neighborhoods?.forEach((n) => {
      const cityId = n.city_id;
      if (cityId) {
        if (!validNeighborhoods.has(cityId)) {
          validNeighborhoods.set(cityId, new Set());
        }
        validNeighborhoods.get(cityId)!.add(n.slug);
      }
    });

    const results: RowValidationResult[] = rows.map((row, index) => {
      const errors: string[] = [];
      const warnings: string[] = [];

      // Required field validation
      if (!row.name?.trim()) errors.push("name is required");
      if (!row.address_1?.trim()) errors.push("address_1 is required");
      if (!row.city_slug?.trim()) errors.push("city_slug is required");

      // City exists validation
      if (row.city_slug && !validCitySlugs.has(row.city_slug)) {
        errors.push(`city_slug "${row.city_slug}" does not exist`);
      }

      // Neighborhood validation
      if (row.neighborhood_slug && row.city_slug) {
        const cityId = cityIdMap.get(row.city_slug);
        if (cityId) {
          const cityNeighborhoods = validNeighborhoods.get(cityId);
          if (!cityNeighborhoods?.has(row.neighborhood_slug)) {
            warnings.push(
              `neighborhood_slug "${row.neighborhood_slug}" not found in ${row.city_slug}`
            );
          }
        }
      }

      // Status validation
      if (
        row.status &&
        !["active", "inactive", "coming_soon"].includes(row.status)
      ) {
        errors.push("status must be active, inactive, or coming_soon");
      }

      // Year built validation
      if (row.year_built) {
        const year = Number(row.year_built);
        if (isNaN(year) || year < 1800 || year > new Date().getFullYear() + 5) {
          warnings.push("year_built appears invalid");
        }
      }

      // Stories validation
      if (row.stories) {
        const stories = Number(row.stories);
        if (isNaN(stories) || stories < 1 || stories > 200) {
          warnings.push("stories appears invalid");
        }
      }

      // Email validation
      if (
        row.leasing_email &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.leasing_email)
      ) {
        warnings.push("leasing_email format appears invalid");
      }

      // URL validation
      if (row.website_url && !row.website_url.startsWith("http")) {
        warnings.push("website_url should start with http:// or https://");
      }

      return {
        rowIndex: index + 1,
        isValid: errors.length === 0,
        errors,
        warnings,
        data: row,
      };
    });

    const response: ValidationResponse = {
      totalRows: rows.length,
      validRows: results.filter((r) => r.isValid).length,
      invalidRows: results.filter((r) => !r.isValid).length,
      results,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Validation error:", error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
