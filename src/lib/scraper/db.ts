// Database operations for the scraper

import { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows, getFirstRelation } from "@/lib/db-helpers";
import { chunk, IN_CHUNK_SIZE } from "@/lib/search/fetch-enrichments";
import { ScrapedUnit, ScrapedAmenity, ScrapedImage } from "./types";
import { isJunkImageUrl } from "@/lib/images/quality";

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

/** Which timestamp decides staleness. "full" needs both to have run. */
export type ScrapeMode = "units" | "amenities" | "full";

export async function getBuildingsToScrape(
  supabase: SupabaseClient,
  options: {
    cityId?: string;
    onlyUnits?: boolean;
    /** Preferred over `onlyUnits`; defaults to units when onlyUnits is set, else full. */
    mode?: ScrapeMode;
    limit?: number;
    daysStale?: number;
  } = {}
) {
  const { cityId, onlyUnits = false, limit = 50, daysStale = 30 } = options;
  const mode: ScrapeMode = options.mode ?? (onlyUnits ? "units" : "full");

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
    if (mode === "units") {
      return status.units_scraped_at ? new Date(status.units_scraped_at).getTime() : null;
    }
    if (mode === "amenities") {
      return status.amenities_scraped_at ? new Date(status.amenities_scraped_at).getTime() : null;
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
  /**
   * How many of the building's currently-available rows carry a unit number.
   * A floorplan-level scrape must never retire a numbered inventory.
   */
  existingNumberedAvailable: number;
}

interface ExistingUnit {
  id: string;
  latest_rent: number | null;
}

/**
 * Canonical string form of a unit number. The DB's unique index
 * (building_id, unit_number) WHERE unit_number IS NOT NULL is exact, but the
 * model happily emits 1204 (a number) or " 1204" — the insert then conflicted
 * silently, the live row never made it into seenUnitIds, and
 * markUnitsUnavailable retired a unit that is very much still for rent.
 */
export function normalizeUnitNumber(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

/** Case-insensitive identity for a unit number ("12a" and "12A" are one unit). */
function unitNumberKey(value: unknown): string | null {
  const normalized = normalizeUnitNumber(value);
  return normalized === null ? null : normalized.toUpperCase();
}

/** Integer columns (units.sqft, units.beds, unit_price_snapshots.rent) reject 823.4. */
function toInt(value: number | null | undefined): number | null {
  return value == null || !Number.isFinite(value) ? null : Math.round(value);
}

/** units.available_on is a DATE; anything else ("Now", "Spring") is a 22007. */
export function normalizeAvailableOn(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

/**
 * Identity for listings that carry no unit number (floorplan-level pricing:
 * "1BR/1BA 823 sqft from $2,151"). Without this, every nightly scrape
 * inserted a brand-new unit row per floorplan and nothing ever retired the
 * old ones — Arte Grand Central accumulated 567 phantom "available" units.
 *
 * The plan NAME is the strongest identity and it round-trips without a
 * migration: saveScrapedUnits resolves floorplan_name against the existing
 * `floorplans` table (building_id + name) and stamps `units.floorplan_id`, so
 * the next scrape resolves to the same id.
 *
 * Geometry is the fallback for sites that show no plan name. When sqft is
 * also missing, rent joins the key: folding two distinct "1bd/1ba, no sqft"
 * plans onto `beds|baths|` retired a real plan every night, and rent is the
 * only remaining discriminator that survives a round trip (via
 * unit_price_snapshots → units_with_latest_price).
 */
export function floorplanKey(u: {
  floorplan_id?: string | null;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  rent?: number | null;
}): string {
  if (u.floorplan_id) return `p:${u.floorplan_id}`;
  const sqft = toInt(u.sqft);
  const base = `${u.beds ?? ""}|${u.baths ?? ""}|${sqft ?? ""}`;
  if (sqft !== null) return base;
  return `${base}|r:${toInt(u.rent) ?? ""}`;
}

/**
 * Resolve the scraped floorplan names for a building to floorplan ids,
 * creating rows that don't exist yet. Case-insensitive: "The Aspen" and
 * "the aspen" are one plan.
 */
async function resolveFloorplanIds(
  supabase: SupabaseClient,
  buildingId: string,
  units: ScrapedUnit[],
): Promise<Map<string, string>> {
  const byName = new Map<string, ScrapedUnit>();
  for (const u of units) {
    const name = String(u.floorplan_name ?? "").trim();
    if (!name) continue;
    if (!byName.has(name.toLowerCase())) byName.set(name.toLowerCase(), u);
  }

  const resolved = new Map<string, string>();
  if (byName.size === 0) return resolved;

  const existing = await fetchAllRows<{ id: string; name: string | null }>((from, to) =>
    supabase
      .from("floorplans")
      .select("id, name")
      .eq("building_id", buildingId)
      .order("id")
      .range(from, to)
  );

  for (const plan of existing) {
    const key = String(plan.name ?? "").trim().toLowerCase();
    if (key && !resolved.has(key)) resolved.set(key, plan.id);
  }

  for (const [key, unit] of byName) {
    if (resolved.has(key)) continue;
    const name = String(unit.floorplan_name ?? "").trim();
    const beds = toInt(unit.beds);
    const baths = typeof unit.baths === "number" && Number.isFinite(unit.baths) ? unit.baths : null;
    // floorplans.beds and .baths are NOT NULL. Floorplan-level extraction
    // often omits baths; inserting anyway just logged a constraint error per
    // plan. Skip the row instead — the caller falls back to the geometry
    // identity, which is what happened before plans were persisted at all.
    if (beds === null || baths === null) continue;

    const sqft = toInt(unit.sqft);
    const { data: created, error } = await supabase
      .from("floorplans")
      .insert({
        building_id: buildingId,
        name,
        beds,
        baths,
        sqft_min: sqft,
        sqft_max: sqft,
      })
      .select("id")
      .single();

    if (created?.id) {
      resolved.set(key, created.id);
      continue;
    }
    if (error?.code === "23505") {
      // Concurrent scrape created it first — adopt that row.
      const { data: existingPlan } = await supabase
        .from("floorplans")
        .select("id")
        .eq("building_id", buildingId)
        .ilike("name", name)
        .limit(1)
        .maybeSingle();
      if (existingPlan?.id) resolved.set(key, existingPlan.id);
    } else if (error) {
      console.error(`Floorplan insert failed for building ${buildingId}:`, error.message);
    }
  }

  return resolved;
}

/**
 * Whether a scrape is trustworthy enough to retire the units it did not see.
 * Pure, and exported so both the cron and the admin route share one rule.
 */
export function shouldRetireUnseenUnits(opts: {
  /** The availability page was found but every fetch of it failed. */
  unitsPageFetchFailed?: boolean;
  /** How many scraped listings carry a unit number. */
  scrapedNumbered: number;
  /** How many currently-available existing rows carry a unit number. */
  existingNumberedAvailable: number;
}): boolean {
  // Bot wall / timeout on the units page: whatever we extracted came off the
  // marketing page and says nothing about the real inventory.
  if (opts.unitsPageFetchFailed) return false;
  // Floorplan-level "from" prices must never retire a numbered inventory.
  if (opts.scrapedNumbered === 0 && opts.existingNumberedAvailable > 0) return false;
  return true;
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

  // Existing units with their latest snapshot rent, so unchanged prices don't
  // get a new snapshot. Paged: a building past 1000 rows (every building that
  // ever accumulated floorplan phantoms) silently lost its tail, so live units
  // went unmatched and were retired as "gone". Retired rows are kept in the
  // map too — a unit that comes back on the market must re-match, not
  // re-insert into a unique-index conflict.
  const existingUnits = await fetchAllRows<{
    id: string;
    unit_number: string | null;
    floorplan_id: string | null;
    beds: number | null;
    baths: number | null;
    sqft: number | null;
    is_available: boolean | null;
    latest_rent: number | null;
  }>((from, to) =>
    supabase
      .from("units_with_latest_price")
      .select("id, unit_number, floorplan_id, beds, baths, sqft, is_available, latest_rent, created_at")
      .eq("building_id", buildingId)
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to)
  );

  const floorplanIds = await resolveFloorplanIds(supabase, buildingId, saneUnits);

  // Newest row wins for either identity, so pre-existing duplicates collapse
  // onto one canonical unit and the rest get retired by markUnitsUnavailable.
  const existingByNumber = new Map<string, ExistingUnit>();
  const existingByFloorplan = new Map<string, ExistingUnit>();
  let existingNumberedAvailable = 0;
  for (const u of existingUnits) {
    const rec: ExistingUnit = { id: u.id, latest_rent: u.latest_rent };
    const numberKey = unitNumberKey(u.unit_number);
    if (numberKey) {
      if (u.is_available !== false) existingNumberedAvailable++;
      if (!existingByNumber.has(numberKey)) existingByNumber.set(numberKey, rec);
      continue;
    }

    // Register under the floorplan-id key AND the geometry key. Rows written
    // before the scraper stamped floorplan_id have none, so the geometry key
    // is what lets them be adopted (and stamped) instead of duplicated on the
    // first run after this change.
    const geometryKey = floorplanKey({ ...u, floorplan_id: null, rent: u.latest_rent });
    if (u.floorplan_id) {
      const planKey = floorplanKey({ floorplan_id: u.floorplan_id });
      if (!existingByFloorplan.has(planKey)) existingByFloorplan.set(planKey, rec);
    }
    if (!existingByFloorplan.has(geometryKey)) existingByFloorplan.set(geometryKey, rec);
  }

  const snapshots: Array<{
    unit_id: string;
    rent: number;
    lease_term_months: number | null;
    source_id?: string;
  }> = [];

  for (const unit of saneUnits) {
    const unitNumber = normalizeUnitNumber(unit.unit_number);
    const numberKey = unitNumberKey(unit.unit_number);
    const planName = String(unit.floorplan_name ?? "").trim().toLowerCase();
    const floorplanId = planName ? floorplanIds.get(planName) ?? null : null;

    const fpKey = floorplanKey({ ...unit, floorplan_id: floorplanId });
    const identity = numberKey ? `n:${numberKey}` : `f:${fpKey}`;
    // The extractor sometimes lists the same floorplan twice on one page.
    if (seenIdentities.has(identity)) continue;
    seenIdentities.add(identity);

    let existing: ExistingUnit | undefined;
    if (numberKey) {
      existing = existingByNumber.get(numberKey);
      if (existing) existingByNumber.delete(numberKey);
    } else {
      // Try the plan-id key, then fall back to geometry for rows written
      // before floorplan_id was stamped. Consume whichever matched so two
      // distinct plans can never land on the same row.
      const geometryKey = floorplanKey({ ...unit, floorplan_id: null });
      for (const key of fpKey === geometryKey ? [fpKey] : [fpKey, geometryKey]) {
        const candidate = existingByFloorplan.get(key);
        if (candidate) {
          existing = candidate;
          for (const [k, v] of [...existingByFloorplan]) {
            if (v.id === candidate.id) existingByFloorplan.delete(k);
          }
          break;
        }
      }
    }

    const shared = {
      beds: toInt(unit.beds),
      baths: unit.baths,
      sqft: toInt(unit.sqft),
      is_available: true,
      available_on: normalizeAvailableOn(unit.available_on),
      floor: unit.floor ?? null,
      view: unit.view ?? null,
      // Only stamp when we resolved one — never blank out an importer's value.
      ...(floorplanId ? { floorplan_id: floorplanId } : {}),
    };

    if (existing) {
      seenUnitIds.add(existing.id);
      const { error: updateError } = await supabase
        .from("units")
        .update(shared)
        .eq("id", existing.id);

      if (updateError) {
        console.error(`Unit update failed for ${existing.id} (building ${buildingId}):`, updateError.message);
      }

      // Snapshot only when rent actually changed — blind daily inserts grew
      // unit_price_snapshots unboundedly and pushed units past PostgREST's
      // 1000-row cap in downstream latest-price reads.
      const rent = toInt(unit.rent);
      if (rent && rent !== existing.latest_rent) {
        snapshots.push({
          unit_id: existing.id,
          rent,
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
      .insert({ building_id: buildingId, unit_number: unitNumber, ...shared })
      .select("id")
      .single();

    let unitId = newUnit?.id as string | undefined;

    // 23505: a row for this (building_id, unit_number) already exists that our
    // existing-units read did not surface (differently-cased/typed number, or
    // written by a concurrent job). Adopt it instead of dropping the listing —
    // dropping it is what made the live unit "unseen" and got it retired.
    if (!unitId && unitError?.code === "23505" && unitNumber) {
      const { data: conflicting } = await supabase
        .from("units")
        .select("id")
        .eq("building_id", buildingId)
        .eq("unit_number", unitNumber)
        .limit(1)
        .maybeSingle();

      if (conflicting?.id) {
        unitId = conflicting.id;
        await supabase.from("units").update(shared).eq("id", unitId);
        unitsUpdated++;
      }
    } else if (unitId) {
      unitsCreated++;
    } else if (unitError) {
      console.error(`Unit insert failed for building ${buildingId}:`, unitError.message);
    }

    if (unitId) {
      seenUnitIds.add(unitId);
      const rent = toInt(unit.rent);
      if (rent) {
        snapshots.push({
          unit_id: unitId,
          rent,
          lease_term_months: sanitizeLeaseTerm(unit.lease_term_months),
          source_id: sourceId,
        });
      }
    }
  }

  await insertSnapshots(supabase, buildingId, snapshots);

  return { unitsCreated, unitsUpdated, seenUnitIds: [...seenUnitIds], existingNumberedAvailable };
}

/**
 * Bulk-insert price snapshots, falling back to row-by-row on failure: one bad
 * row (a FK race on a just-deleted unit, say) used to reject the whole batch
 * and lose the entire building's prices for the night.
 */
async function insertSnapshots(
  supabase: SupabaseClient,
  buildingId: string,
  snapshots: Array<{ unit_id: string; rent: number; lease_term_months: number | null; source_id?: string }>,
) {
  if (snapshots.length === 0) return;

  const { error } = await supabase.from("unit_price_snapshots").insert(snapshots);
  if (!error) return;

  console.error(`Snapshot batch insert failed for building ${buildingId}:`, error.message);
  for (const snapshot of snapshots) {
    const { error: rowError } = await supabase.from("unit_price_snapshots").insert(snapshot);
    if (rowError) {
      console.error(`Snapshot insert failed for unit ${snapshot.unit_id}:`, rowError.message);
    }
  }
}

export async function saveScrapedAmenities(
  supabase: SupabaseClient,
  buildingId: string,
  amenities: ScrapedAmenity[]
) {
  let amenitiesLinked = 0;

  // amenities.name is UNIQUE and case-SENSITIVE, so an exact-match lookup let
  // "Rooftop Pool" and "rooftop pool" become two amenities (and every third
  // variant hit a 23505 that was silently discarded). Match case-insensitively.
  const resolved = new Map<string, string>();

  for (const amenity of amenities) {
    const name = String(amenity.name ?? "").trim();
    if (!name) continue;
    const lookupKey = name.toLowerCase();

    let amenityId = resolved.get(lookupKey);

    if (!amenityId) {
      const { data: candidates } = await supabase
        .from("amenities")
        .select("id, name")
        .ilike("name", name)
        .limit(50);

      amenityId = (candidates || []).find(
        (a) => String(a.name ?? "").trim().toLowerCase() === lookupKey
      )?.id;
    }

    if (!amenityId) {
      const { data: newAmenity, error: insertError } = await supabase
        .from("amenities")
        .insert({ name, category: amenity.category })
        .select("id")
        .single();

      amenityId = newAmenity?.id;

      // Lost a race (or a casing variant slipped past ilike) — adopt the row.
      if (!amenityId && insertError?.code === "23505") {
        const { data: raced } = await supabase
          .from("amenities")
          .select("id")
          .eq("name", name)
          .limit(1)
          .maybeSingle();
        amenityId = raced?.id;
      }
    }

    if (amenityId) {
      resolved.set(lookupKey, amenityId);
      // Link to building
      const { error } = await supabase
        .from("building_amenities")
        .upsert(
          {
            building_id: buildingId,
            amenity_id: amenityId,
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

  // Paged: buildings that accumulated floorplan phantoms hold well over 1000
  // "available" rows, and the tail past the cap was never reachable.
  const availableUnits = await fetchAllRows<{ id: string }>((from, to) =>
    supabase
      .from("units")
      .select("id")
      .eq("building_id", buildingId)
      .eq("is_available", true)
      .order("id")
      .range(from, to)
  );

  if (availableUnits.length === 0) return;

  const seen = new Set(seenUnitIds);
  const unitsToMark = availableUnits.filter((u) => !seen.has(u.id)).map((u) => u.id);
  if (unitsToMark.length === 0) return;

  // Keep the .in() URL bounded
  for (const ids of chunk(unitsToMark, IN_CHUNK_SIZE)) {
    const { error } = await supabase.from("units").update({ is_available: false }).in("id", ids);
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
      // Favicons, brand logos and Open Graph share cards read as photos to the
      // extractor but render as an obviously wrong thumbnail on the listing
      !isJunkImageUrl(img.url) &&
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

  // Only the images we are actually inserting get indexes — primaryIdx used
  // to be computed over the unfiltered array, so once any earlier image was
  // already stored the hero index pointed at the wrong row (or past the end,
  // leaving the building with no primary image at all).
  const newImages = buildingImages.filter((img) => !existingUrlSet.has(img.url));

  if (newImages.length === 0) return 0;

  // Find which image should be primary (hero image, or first exterior)
  const heroIdx = newImages.findIndex((img) => img.is_hero);
  const exteriorIdx = newImages.findIndex((img) => img.category === "exterior");
  const primaryIdx = heroIdx >= 0 ? heroIdx : exteriorIdx >= 0 ? exteriorIdx : 0;

  // Check if building already has a primary image
  const { data: existingPrimary } = await supabase
    .from("building_images")
    .select("id")
    .eq("building_id", buildingId)
    .eq("is_primary", true)
    .limit(1);

  const hasPrimary = (existingPrimary?.length || 0) > 0;

  const rows = newImages.map((img, i) => ({
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
      // Same site-furniture gate as the building images
      !isJunkImageUrl(img.url) &&
      unitCategories.has(img.category)
  );

  if (unitImages.length === 0) return 0;

  // Only units that are actually on the market, and paged past the 1000-row
  // cap. The old read took every row for the building — including years of
  // retired phantoms — and then did four round trips per unit, so a building
  // with 600 dead rows spent its whole budget attaching model-apartment
  // photos to listings nobody can see.
  const units = await fetchAllRows<{ id: string }>((from, to) =>
    supabase
      .from("units")
      .select("id")
      .eq("building_id", buildingId)
      .eq("is_available", true)
      .order("id")
      .range(from, to)
  );

  if (units.length === 0) {
    // No available units - store as building-level images with "other" category
    return saveScrapedBuildingImages(supabase, buildingId, unitImages.map((img) => ({
      ...img,
      category: "other" as const,
    })));
  }

  const unitIds = units.map((u) => u.id);

  // One paged read per id chunk replaces the per-unit round trips.
  const existingImages: Array<{ id: string; unit_id: string; url: string; is_primary: boolean | null }> = [];
  for (const ids of chunk(unitIds, IN_CHUNK_SIZE)) {
    const page = await fetchAllRows<{ id: string; unit_id: string; url: string; is_primary: boolean | null }>(
      (from, to) =>
        supabase
          .from("unit_images")
          .select("id, unit_id, url, is_primary")
          .in("unit_id", ids)
          .order("id")
          .range(from, to)
    );
    existingImages.push(...page);
  }

  // Remove old Unsplash placeholders in bulk
  const unsplashIds = existingImages.filter((img) => img.url.includes("unsplash.com")).map((img) => img.id);
  const removed = new Set(unsplashIds);
  for (const ids of chunk(unsplashIds, IN_CHUNK_SIZE)) {
    const { error } = await supabase.from("unit_images").delete().in("id", ids);
    if (error) console.error("Unit image cleanup failed:", error.message);
  }

  const urlsByUnit = new Map<string, Set<string>>();
  const unitsWithPrimary = new Set<string>();
  for (const img of existingImages) {
    if (removed.has(img.id)) continue;
    if (!urlsByUnit.has(img.unit_id)) urlsByUnit.set(img.unit_id, new Set());
    urlsByUnit.get(img.unit_id)!.add(img.url);
    if (img.is_primary) unitsWithPrimary.add(img.unit_id);
  }

  // Distribute unit-level images across the available units
  // (Most building websites show model/sample unit photos, not per-unit photos)
  const rows: Array<Record<string, unknown>> = [];
  for (const unitId of unitIds) {
    const existingUrlSet = urlsByUnit.get(unitId) ?? new Set<string>();
    const hasPrimary = unitsWithPrimary.has(unitId);
    unitImages
      .filter((img) => !existingUrlSet.has(img.url))
      .forEach((img, i) => {
        rows.push({
          unit_id: unitId,
          url: img.url,
          alt_text: img.alt_text || null,
          category: unitCategories.has(img.category) ? img.category : "other",
          is_primary: !hasPrimary && i === 0,
          sort_order: i,
          width: img.width || null,
          height: img.height || null,
        });
      });
  }

  // Batched inserts: one statement per ~500 rows instead of one per unit.
  let totalSaved = 0;
  for (const batch of chunk(rows, 500)) {
    const { error } = await supabase.from("unit_images").insert(batch);
    if (error) console.error("Unit image insert failed:", error.message);
    else totalSaved += batch.length;
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
