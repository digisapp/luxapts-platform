// Database operations for the scraper

import { SupabaseClient } from "@supabase/supabase-js";
import { ScrapedUnit, ScrapedAmenity, ScrapedImage } from "./types";

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
    type: "amenities" | "units" | "images" | "full";
    success: boolean;
    error?: string;
    unitsFound?: number;
    imagesFound?: number;
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

  if (update.type === "images" || update.type === "full") {
    updateData.images_scraped_at = now;
    updateData.images_scrape_success = update.success;
    updateData.images_scrape_error = update.success ? null : update.error;
    if (update.imagesFound !== undefined) {
      updateData.images_found = update.imagesFound;
    }
  }

  const { error } = await supabase
    .from("building_scrape_status")
    .upsert(updateData, { onConflict: "building_id" });

  if (error) {
    console.error("Error updating scrape status:", error);
  }
}

// Sanity bounds on AI-extracted data — the model output is untrusted and
// hallucinated values would otherwise flow straight into search results.
function isSaneUnit(unit: ScrapedUnit): boolean {
  if (unit.rent != null && (!Number.isFinite(unit.rent) || unit.rent < 100 || unit.rent > 100000)) return false;
  if (unit.beds != null && (!Number.isFinite(unit.beds) || unit.beds < 0 || unit.beds > 10)) return false;
  if (unit.baths != null && (!Number.isFinite(unit.baths) || unit.baths < 0 || unit.baths > 10)) return false;
  if (unit.sqft != null && (!Number.isFinite(unit.sqft) || unit.sqft < 50 || unit.sqft > 50000)) return false;
  if (unit.unit_number != null && String(unit.unit_number).length > 20) return false;
  return true;
}

export async function saveScrapedUnits(
  supabase: SupabaseClient,
  buildingId: string,
  units: ScrapedUnit[],
  sourceId?: string
) {
  let unitsCreated = 0;
  let unitsUpdated = 0;

  const saneUnits = units.filter((u) => {
    const ok = isSaneUnit(u);
    if (!ok) console.warn(`Skipping out-of-bounds scraped unit for building ${buildingId}:`, u);
    return ok;
  });

  for (const unit of saneUnits) {
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

  // First get all available units for this building
  const { data: availableUnits, error: fetchError } = await supabase
    .from("units")
    .select("id, unit_number")
    .eq("building_id", buildingId)
    .eq("is_available", true);

  if (fetchError || !availableUnits?.length) {
    if (fetchError) console.error("Error fetching available units:", fetchError);
    return;
  }

  // Filter to units NOT in the active list
  const activeSet = new Set(activeUnitNumbers);
  const unitsToMark = availableUnits.filter(u => !activeSet.has(u.unit_number));

  if (unitsToMark.length === 0) return;

  const { error } = await supabase
    .from("units")
    .update({ is_available: false })
    .in("id", unitsToMark.map(u => u.id));

  if (error) {
    console.error("Error marking units unavailable:", error);
  }
}

export async function saveScrapedBuildingImages(
  supabase: SupabaseClient,
  buildingId: string,
  images: ScrapedImage[],
  options: { replaceExisting?: boolean } = {}
) {
  const { replaceExisting = true } = options;

  if (images.length === 0) return 0;

  // Building image categories
  const buildingCategories = new Set(['exterior', 'lobby', 'amenity', 'pool', 'gym', 'rooftop', 'common', 'other']);

  const buildingImages = images.filter(
    (img) =>
      // Only https URLs — image URLs come from untrusted scraped HTML
      typeof img.url === "string" && img.url.startsWith("https://") &&
      (buildingCategories.has(img.category) || !img.category)
  );

  if (buildingImages.length === 0) return 0;

  if (replaceExisting) {
    // Remove old Unsplash placeholder images but keep any previously scraped real images
    // We identify Unsplash images by URL pattern
    const { data: existing } = await supabase
      .from("building_images")
      .select("id, url")
      .eq("building_id", buildingId);

    if (existing?.length) {
      const unsplashIds = existing
        .filter((img) => img.url.includes("unsplash.com"))
        .map((img) => img.id);

      if (unsplashIds.length > 0) {
        await supabase
          .from("building_images")
          .delete()
          .in("id", unsplashIds);
      }
    }
  }

  // Check for existing URLs to avoid duplicates
  const { data: existingUrls } = await supabase
    .from("building_images")
    .select("url")
    .eq("building_id", buildingId);

  const existingUrlSet = new Set(existingUrls?.map((r) => r.url) || []);

  // Find which image should be primary (hero image, or first exterior)
  const heroIdx = buildingImages.findIndex((img) => img.is_hero);
  const exteriorIdx = buildingImages.findIndex((img) => img.category === "exterior");
  const primaryIdx = heroIdx >= 0 ? heroIdx : exteriorIdx >= 0 ? exteriorIdx : 0;

  // Check if building already has a primary image
  const { data: existingPrimary } = await supabase
    .from("building_images")
    .select("id")
    .eq("building_id", buildingId)
    .eq("is_primary", true)
    .limit(1);

  const hasPrimary = (existingPrimary?.length || 0) > 0;

  const rows = buildingImages
    .filter((img) => !existingUrlSet.has(img.url))
    .map((img, i) => ({
      building_id: buildingId,
      url: img.url,
      alt_text: img.alt_text || null,
      category: buildingCategories.has(img.category) ? img.category : "other",
      is_primary: !hasPrimary && i === primaryIdx,
      sort_order: i,
      width: img.width || null,
      height: img.height || null,
    }));

  if (rows.length === 0) return 0;

  const { error } = await supabase.from("building_images").insert(rows);

  if (error) {
    console.error("Error saving building images:", error);
    return 0;
  }

  return rows.length;
}

export async function saveScrapedUnitImages(
  supabase: SupabaseClient,
  buildingId: string,
  images: ScrapedImage[]
) {
  const unitCategories = new Set(['interior', 'kitchen', 'bathroom', 'bedroom', 'living', 'view', 'other']);

  const unitImages = images.filter(
    (img) =>
      typeof img.url === "string" && img.url.startsWith("https://") &&
      unitCategories.has(img.category)
  );

  if (unitImages.length === 0) return 0;

  // Get all units for this building to distribute images
  const { data: units } = await supabase
    .from("units")
    .select("id, unit_number")
    .eq("building_id", buildingId)
    .order("unit_number");

  if (!units?.length) {
    // No units yet - store as building-level images with "other" category
    return saveScrapedBuildingImages(supabase, buildingId, unitImages.map((img) => ({
      ...img,
      category: "other" as const,
    })));
  }

  // Remove old Unsplash images from all units of this building
  for (const unit of units) {
    const { data: existing } = await supabase
      .from("unit_images")
      .select("id, url")
      .eq("unit_id", unit.id);

    if (existing?.length) {
      const unsplashIds = existing
        .filter((img) => img.url.includes("unsplash.com"))
        .map((img) => img.id);

      if (unsplashIds.length > 0) {
        await supabase
          .from("unit_images")
          .delete()
          .in("id", unsplashIds);
      }
    }
  }

  // Distribute unit-level images across all units
  // (Most building websites show model/sample unit photos, not per-unit photos)
  let totalSaved = 0;

  for (const unit of units) {
    // Check existing non-unsplash images
    const { data: existingUrls } = await supabase
      .from("unit_images")
      .select("url")
      .eq("unit_id", unit.id);

    const existingUrlSet = new Set(existingUrls?.map((r) => r.url) || []);

    const { data: existingPrimary } = await supabase
      .from("unit_images")
      .select("id")
      .eq("unit_id", unit.id)
      .eq("is_primary", true)
      .limit(1);

    const hasPrimary = (existingPrimary?.length || 0) > 0;

    const rows = unitImages
      .filter((img) => !existingUrlSet.has(img.url))
      .map((img, i) => ({
        unit_id: unit.id,
        url: img.url,
        alt_text: img.alt_text || null,
        category: unitCategories.has(img.category) ? img.category : "other",
        is_primary: !hasPrimary && i === 0,
        sort_order: i,
        width: img.width || null,
        height: img.height || null,
      }));

    if (rows.length > 0) {
      const { error } = await supabase.from("unit_images").insert(rows);
      if (!error) {
        totalSaved += rows.length;
      }
    }
  }

  return totalSaved;
}

export async function createScrapeJob(
  supabase: SupabaseClient,
  jobType: "amenities" | "units" | "images" | "full",
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
