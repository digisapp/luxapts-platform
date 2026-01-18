// Database operations for the scraper

import { SupabaseClient } from "@supabase/supabase-js";
import { ScrapedUnit, ScrapedAmenity } from "./types";

export async function getBuildingsToScrape(
  supabase: SupabaseClient,
  options: {
    cityId?: string;
    onlyUnits?: boolean;
    limit?: number;
    daysStale?: number;
  } = {}
) {
  const { cityId, onlyUnits = false, limit = 50, daysStale = 30 } = options;

  // Calculate the cutoff date
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysStale);

  let query = supabase
    .from("buildings")
    .select(`
      id,
      name,
      website_url,
      city_id,
      building_scrape_status (
        website_url,
        scrape_enabled,
        amenities_scraped_at,
        units_scraped_at
      )
    `)
    .eq("status", "active")
    .not("website_url", "is", null);

  if (cityId) {
    query = query.eq("city_id", cityId);
  }

  const { data: buildings, error } = await query.limit(limit * 2); // Fetch more to filter

  if (error) {
    console.error("Error fetching buildings to scrape:", error);
    return [];
  }

  // Filter buildings that need scraping
  return (buildings || []).filter((b) => {
    const status = b.building_scrape_status?.[0];

    // If no status record, needs full scrape
    if (!status) return true;

    // If scraping disabled, skip
    if (status.scrape_enabled === false) return false;

    if (onlyUnits) {
      // Only check units scrape date
      if (!status.units_scraped_at) return true;
      return new Date(status.units_scraped_at) < cutoffDate;
    } else {
      // Check if amenities never scraped
      if (!status.amenities_scraped_at) return true;
      // Check if units stale
      if (!status.units_scraped_at) return true;
      return new Date(status.units_scraped_at) < cutoffDate;
    }
  }).slice(0, limit);
}

export async function updateScrapeStatus(
  supabase: SupabaseClient,
  buildingId: string,
  update: {
    type: "amenities" | "units" | "full";
    success: boolean;
    error?: string;
    unitsFound?: number;
    websiteUrl?: string;
  }
) {
  const now = new Date().toISOString();

  const updateData: Record<string, unknown> = {
    building_id: buildingId,
  };

  if (update.websiteUrl) {
    updateData.website_url = update.websiteUrl;
  }

  if (update.type === "amenities" || update.type === "full") {
    updateData.amenities_scraped_at = now;
    updateData.amenities_scrape_success = update.success;
    updateData.amenities_scrape_error = update.success ? null : update.error;
  }

  if (update.type === "units" || update.type === "full") {
    updateData.units_scraped_at = now;
    updateData.units_scrape_success = update.success;
    updateData.units_scrape_error = update.success ? null : update.error;
    if (update.unitsFound !== undefined) {
      updateData.units_found = update.unitsFound;
    }
  }

  const { error } = await supabase
    .from("building_scrape_status")
    .upsert(updateData, { onConflict: "building_id" });

  if (error) {
    console.error("Error updating scrape status:", error);
  }
}

export async function saveScrapedUnits(
  supabase: SupabaseClient,
  buildingId: string,
  units: ScrapedUnit[],
  sourceId?: string
) {
  let unitsCreated = 0;
  let unitsUpdated = 0;

  for (const unit of units) {
    // Try to find existing unit by unit number
    if (unit.unit_number) {
      const { data: existing } = await supabase
        .from("units")
        .select("id")
        .eq("building_id", buildingId)
        .eq("unit_number", unit.unit_number)
        .single();

      if (existing) {
        // Update existing unit
        await supabase
          .from("units")
          .update({
            beds: unit.beds,
            baths: unit.baths,
            sqft: unit.sqft,
            is_available: true,
            available_on: unit.available_on || null,
            floor: unit.floor,
            view: unit.view,
          })
          .eq("id", existing.id);

        // Add price snapshot
        if (unit.rent) {
          await supabase.from("unit_price_snapshots").insert({
            unit_id: existing.id,
            rent: unit.rent,
            source_id: sourceId,
          });
        }

        unitsUpdated++;
        continue;
      }
    }

    // Create new unit
    const { data: newUnit, error: unitError } = await supabase
      .from("units")
      .insert({
        building_id: buildingId,
        unit_number: unit.unit_number,
        floor: unit.floor,
        view: unit.view,
        beds: unit.beds,
        baths: unit.baths,
        sqft: unit.sqft,
        is_available: true,
        available_on: unit.available_on || null,
      })
      .select("id")
      .single();

    if (!unitError && newUnit && unit.rent) {
      // Add price snapshot
      await supabase.from("unit_price_snapshots").insert({
        unit_id: newUnit.id,
        rent: unit.rent,
        source_id: sourceId,
      });
      unitsCreated++;
    }
  }

  return { unitsCreated, unitsUpdated };
}

export async function saveScrapedAmenities(
  supabase: SupabaseClient,
  buildingId: string,
  amenities: ScrapedAmenity[]
) {
  let amenitiesLinked = 0;

  for (const amenity of amenities) {
    // Get or create amenity
    let { data: existingAmenity } = await supabase
      .from("amenities")
      .select("id")
      .eq("name", amenity.name)
      .single();

    if (!existingAmenity) {
      const { data: newAmenity } = await supabase
        .from("amenities")
        .insert({
          name: amenity.name,
          category: amenity.category,
        })
        .select("id")
        .single();

      existingAmenity = newAmenity;
    }

    if (existingAmenity) {
      // Link to building
      const { error } = await supabase
        .from("building_amenities")
        .upsert(
          {
            building_id: buildingId,
            amenity_id: existingAmenity.id,
            details: amenity.description,
          },
          { onConflict: "building_id,amenity_id" }
        );

      if (!error) {
        amenitiesLinked++;
      }
    }
  }

  return amenitiesLinked;
}

export async function markUnitsUnavailable(
  supabase: SupabaseClient,
  buildingId: string,
  activeUnitNumbers: string[]
) {
  // Mark units as unavailable if they weren't found in the latest scrape
  if (activeUnitNumbers.length === 0) return;

  const { error } = await supabase
    .from("units")
    .update({ is_available: false })
    .eq("building_id", buildingId)
    .eq("is_available", true)
    .not("unit_number", "in", `(${activeUnitNumbers.map(n => `'${n}'`).join(",")})`);

  if (error) {
    console.error("Error marking units unavailable:", error);
  }
}

export async function createScrapeJob(
  supabase: SupabaseClient,
  jobType: "amenities" | "units" | "full",
  scope: { buildingId?: string; cityId?: string }
) {
  const { data, error } = await supabase
    .from("scrape_jobs")
    .insert({
      job_type: jobType,
      status: "pending",
      building_id: scope.buildingId,
      city_id: scope.cityId,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Error creating scrape job:", error);
    return null;
  }

  return data?.id;
}

export async function updateScrapeJob(
  supabase: SupabaseClient,
  jobId: string,
  update: {
    status?: "running" | "completed" | "failed";
    buildingsProcessed?: number;
    buildingsSuccess?: number;
    buildingsFailed?: number;
    unitsFound?: number;
    amenitiesFound?: number;
    errors?: unknown[];
  }
) {
  const updateData: Record<string, unknown> = {};

  if (update.status) {
    updateData.status = update.status;
    if (update.status === "running") {
      updateData.started_at = new Date().toISOString();
    } else if (update.status === "completed" || update.status === "failed") {
      updateData.completed_at = new Date().toISOString();
    }
  }

  if (update.buildingsProcessed !== undefined) updateData.buildings_processed = update.buildingsProcessed;
  if (update.buildingsSuccess !== undefined) updateData.buildings_success = update.buildingsSuccess;
  if (update.buildingsFailed !== undefined) updateData.buildings_failed = update.buildingsFailed;
  if (update.unitsFound !== undefined) updateData.units_found = update.unitsFound;
  if (update.amenitiesFound !== undefined) updateData.amenities_found = update.amenitiesFound;
  if (update.errors !== undefined) updateData.errors = update.errors;

  await supabase.from("scrape_jobs").update(updateData).eq("id", jobId);
}
