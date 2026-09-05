// Database operations for the scraper

import { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows, getFirstRelation } from "@/lib/db-helpers";
import { ScrapedUnit, ScrapedAmenity, ScrapedImage } from "./types";

export interface ScrapeStatusRelation {
  website_url: string | null;
  scrape_enabled: boolean | null;
  amenities_scraped_at: string | null;
  units_scraped_at: string | null;
}

export interface ScrapeCandidate {
  id: string;
  name: string;
  website_url: string;
  city_id: string;
  // building_scrape_status.building_id is the table's PRIMARY KEY, so
  // PostgREST treats the relationship as one-to-one and embeds an OBJECT
  // (or null) — NOT an array. Every consumer must go through scrapeStatusOf():
  // indexing it as `[0]` made every building look never-scraped, which sorted
  // the fleet by id and re-scraped the same ~25 buildings every night while
  // 205 others were never reached.
  building_scrape_status: ScrapeStatusRelation | ScrapeStatusRelation[] | null;
}

/** Normalize the one-to-one scrape-status embed regardless of PostgREST's shape. */
export function scrapeStatusOf<T>(
  building: { building_scrape_status?: T | T[] | null } | null | undefined,
): T | null {
  return getFirstRelation(building?.building_scrape_status);
}

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

  // Fetch the ENTIRE eligible fleet (paged past the 1000-row cap), not a
  // window of it: the previous `limit * 2` fetch had no ORDER BY, so the
  // same arbitrary rows won every run and later-inserted cities (e.g. all
  // of New York) were never reached at all.
  const buildings = await fetchAllRows<ScrapeCandidate>((from, to) => {
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
    return query.order("id").range(from, to);
  });

  // Timestamp the staleness decision keys off; null = never scraped
  const scrapeKey = (b: ScrapeCandidate): number | null => {
    const status = scrapeStatusOf(b);
    if (!status) return null;
    if (onlyUnits) {
      return status.units_scraped_at ? new Date(status.units_scraped_at).getTime() : null;
    }
    if (!status.amenities_scraped_at || !status.units_scraped_at) return null;
    return new Date(status.units_scraped_at).getTime();
  };

  return buildings
    .filter((b) => {
      const status = scrapeStatusOf(b);
      if (status?.scrape_enabled === false) return false;
      const key = scrapeKey(b);
      return key === null || key < cutoffDate.getTime();
    })
    // Stalest first, never-scraped at the very front — a fair round-robin
    // instead of the same buildings monopolizing every run
    .sort((a, b) => (scrapeKey(a) ?? -Infinity) - (scrapeKey(b) ?? -Infinity))
    .slice(0, limit);
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

// Out-of-bounds terms are dropped (not the whole unit) — a hallucinated term
// shouldn't cost us an otherwise-good listing.
export function sanitizeLeaseTerm(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const months = Math.round(value);
  return months >= 1 && months <= 36 ? months : null;
}

export interface SaveScrapedUnitsResult {
  unitsCreated: number;
  unitsUpdated: number;
  /** Every unit this scrape matched or created — anything else still listed for the building is gone. */
  seenUnitIds: string[];
}

interface ExistingUnit {
  id: string;
  latest_rent: number | null;
}

/**
 * Identity for listings that carry no unit number (floorplan-level pricing:
 * "1BR/1BA 823 sqft from $2,151"). Without this, every nightly scrape
 * inserted a brand-new unit row per floorplan and nothing ever retired the
 * old ones — Arte Grand Central accumulated 567 phantom "available" units.
 */
export function floorplanKey(u: { beds?: number | null; baths?: number | null; sqft?: number | null }): string {
  return `${u.beds ?? ""}|${u.baths ?? ""}|${u.sqft ?? ""}`;
}

export async function saveScrapedUnits(
  supabase: SupabaseClient,
  buildingId: string,
  units: ScrapedUnit[],
  sourceId?: string
): Promise<SaveScrapedUnitsResult> {
  let unitsCreated = 0;
  let unitsUpdated = 0;
  const seenUnitIds = new Set<string>();
  const seenIdentities = new Set<string>();

  const saneUnits = units.filter((u) => {
    const ok = isSaneUnit(u);
    if (!ok) console.warn(`Skipping out-of-bounds scraped unit for building ${buildingId}:`, u);
    return ok;
  });

  // One round trip replaces the old per-unit SELECT: existing units with
  // their latest snapshot rent, so unchanged prices don't get a new snapshot.
  const { data: existingUnits } = await supabase
    .from("units_with_latest_price")
    .select("id, unit_number, beds, baths, sqft, latest_rent, created_at")
    .eq("building_id", buildingId)
    .order("created_at", { ascending: false });

  // Newest row wins for either identity, so pre-existing duplicates collapse
  // onto one canonical unit and the rest get retired by markUnitsUnavailable.
  const existingByNumber = new Map<string, ExistingUnit>();
  const existingByFloorplan = new Map<string, ExistingUnit>();
  for (const u of existingUnits || []) {
    const rec: ExistingUnit = { id: u.id, latest_rent: u.latest_rent };
    if (u.unit_number) {
      if (!existingByNumber.has(u.unit_number)) existingByNumber.set(u.unit_number, rec);
    } else {
      const key = floorplanKey(u);
      if (!existingByFloorplan.has(key)) existingByFloorplan.set(key, rec);
    }
  }

  const snapshots: Array<{
    unit_id: string;
    rent: number;
    lease_term_months: number | null;
    source_id?: string;
  }> = [];

  for (const unit of saneUnits) {
    const identity = unit.unit_number ? `n:${unit.unit_number}` : `f:${floorplanKey(unit)}`;
    // The extractor sometimes lists the same floorplan twice on one page.
    if (seenIdentities.has(identity)) continue;
    seenIdentities.add(identity);

    const existing = unit.unit_number
      ? existingByNumber.get(unit.unit_number)
      : existingByFloorplan.get(floorplanKey(unit));

    if (existing) {
      seenUnitIds.add(existing.id);
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

      // Snapshot only when rent actually changed — blind daily inserts grew
      // unit_price_snapshots unboundedly and pushed units past PostgREST's
      // 1000-row cap in downstream latest-price reads.
      if (unit.rent && unit.rent !== existing.latest_rent) {
        snapshots.push({
          unit_id: existing.id,
          rent: unit.rent,
          lease_term_months: sanitizeLeaseTerm(unit.lease_term_months),
          source_id: sourceId,
        });
      }

      unitsUpdated++;
      continue;
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

    if (!unitError && newUnit) {
      seenUnitIds.add(newUnit.id);
      if (unit.rent) {
        snapshots.push({
          unit_id: newUnit.id,
          rent: unit.rent,
          lease_term_months: sanitizeLeaseTerm(unit.lease_term_months),
          source_id: sourceId,
        });
      }
      unitsCreated++;
    }
  }

  if (snapshots.length > 0) {
    const { error: snapError } = await supabase.from("unit_price_snapshots").insert(snapshots);
    if (snapError) console.error(`Snapshot insert failed for building ${buildingId}:`, snapError.message);
  }

  return { unitsCreated, unitsUpdated, seenUnitIds: [...seenUnitIds] };
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
  seenUnitIds: string[]
) {
  // A scrape that saw nothing is not evidence the building is empty (it is
  // far more often a bot wall or a layout change) — never retire on it.
  if (seenUnitIds.length === 0) return;

  const { data: availableUnits, error: fetchError } = await supabase
    .from("units")
    .select("id")
    .eq("building_id", buildingId)
    .eq("is_available", true);

  if (fetchError || !availableUnits?.length) {
    if (fetchError) console.error("Error fetching available units:", fetchError);
    return;
  }

  const seen = new Set(seenUnitIds);
  const unitsToMark = availableUnits.filter((u) => !seen.has(u.id)).map((u) => u.id);
  if (unitsToMark.length === 0) return;

  // Keep the .in() URL bounded
  for (let i = 0; i < unitsToMark.length; i += 100) {
    const { error } = await supabase
      .from("units")
      .update({ is_available: false })
      .in("id", unitsToMark.slice(i, i + 100));
    if (error) console.error("Error marking units unavailable:", error);
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
