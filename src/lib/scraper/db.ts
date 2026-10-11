// Database operations for the scraper

import { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows, getFirstRelation } from "@/lib/db-helpers";
import { chunk, IN_CHUNK_SIZE } from "@/lib/search/fetch-enrichments";
import { ScrapedUnit, ScrapedAmenity, ScrapedImage } from "./types";
import { isJunkImageUrl, isPropertySpecificUrl } from "@/lib/images/quality";

export interface ScrapeStatusRelation {
  website_url: string | null;
  scrape_enabled: boolean | null;
  amenities_scraped_at: string | null;
  amenities_scrape_success?: boolean | null;
  units_scraped_at: string | null;
}

/**
 * A failed amenity scrape (AI outage, bot wall) is retried after this many
 * days instead of the ~180 a successful one earns — the failure still stamps
 * amenities_scraped_at, which is the staleness key.
 */
const AMENITIES_RETRY_AFTER_FAILURE_DAYS = 7;

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

/**
 * The URL a scrape should fetch for a building.
 *
 * building_scrape_status.website_url is a scraper-only override (a leasing
 * portal or manager page) that wins over the user-facing link. Until
 * 2026-10 every scrape wrote back whatever URL it used, so that column also
 * holds frozen copies of old links — portfolio homepages (glenwoodnyc.com,
 * tfc.com) that scraped 0 units or another building's, and that silently
 * outranked every later admin edit of buildings.website_url. An override
 * that doesn't even name the building is one of those, not a deliberate pick.
 */
export function resolveScrapeUrl(building: {
  name: string;
  website_url: string | null;
  building_scrape_status?:
    | { website_url: string | null }
    | { website_url: string | null }[]
    | null;
}): string | null {
  const override = scrapeStatusOf(building)?.website_url?.trim();
  if (override && isPropertySpecificUrl(override, building.name)) return override;
  return building.website_url || null;
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
  const failedAmenitiesCutoff = new Date();
  failedAmenitiesCutoff.setDate(
    failedAmenitiesCutoff.getDate() - Math.min(daysStale, AMENITIES_RETRY_AFTER_FAILURE_DAYS)
  );

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
          amenities_scrape_success,
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
      if (key === null) return true;
      const failedAmenities = mode === "amenities" && status?.amenities_scrape_success === false;
      return key < (failedAmenities ? failedAmenitiesCutoff : cutoffDate).getTime();
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
  }
) {
  const now = new Date().toISOString();

  // Never writes website_url: that column is a deliberate scrape-target
  // override (see resolveScrapeUrl). Persisting the URL each run used froze
  // whatever link was current at the first scrape and outranked every later
  // fix to buildings.website_url.
  const updateData: Record<string, unknown> = {
    building_id: buildingId,
  };

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

/**
 * A finite number inside [min, max], else null. Absent stays absent: units.baths
 * is written as-is, and turning a missing value into null would blank a
 * stored one on every scrape that omits it.
 */
function inBounds(value: unknown, min: number, max: number): number | null | undefined {
  if (value === undefined) return undefined;
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null;
}

/**
 * Sanity bounds on AI-extracted data — the model output is untrusted and
 * hallucinated values would otherwise flow straight into search results.
 *
 * Bad FIELDS are nulled, not the whole unit: dropping unit 101 for sqft:0 (or
 * seven Dey Street units for rent:-1) left them unseen, so retirement marked
 * listings that were still on the site as gone. A null rent just writes no
 * snapshot. Only a unit with no usable identity is dropped — an absurd unit
 * number, or no number AND no bedroom count to key a floorplan on.
 * Exported for tests.
 */
export function sanitizeScrapedUnit(unit: ScrapedUnit): ScrapedUnit | null {
  const unitNumber = normalizeUnitNumber(unit.unit_number);
  if (unitNumber !== null && unitNumber.length > 20) return null;

  const beds = inBounds(unit.beds, 0, 10);
  if (unitNumber === null && beds == null) return null;

  // ScrapedUnit types these as numbers, but model output already carries
  // nulls through them and every writer below treats null as "unknown".
  return {
    ...unit,
    beds: beds as number,
    baths: inBounds(unit.baths, 0, 10) as number,
    sqft: inBounds(unit.sqft, 50, 50000) as number,
    rent: inBounds(unit.rent, 100, 100000) as number,
  };
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
  /**
   * How many of the building's rows (numbered and floorplan-level) were
   * available before this scrape — the inventory a retirement would act on.
   */
  existingAvailable: number;
}

interface ExistingUnit {
  id: string;
  latest_rent: number | null;
  price_captured_at: string | null;
}

/**
 * An unchanged rent is re-snapshotted once it is this old. Verified pricing
 * (45 days) and best-match ordering read the LATEST capture's date, so a
 * unit re-seen every two days at the same price aged out and became "Contact
 * for pricing". Weekly keeps growth bounded: one row per unit per week.
 */
const SNAPSHOT_REFRESH_DAYS = 7;

/** Whether a unit seen at `rent` now needs a new price snapshot. Exported for tests. */
export function needsPriceSnapshot(
  rent: number | null,
  existing: { latest_rent: number | null; price_captured_at: string | null },
  now: Date = new Date(),
): boolean {
  if (!rent) return false;
  if (rent !== existing.latest_rent) return true;
  const captured = existing.price_captured_at ? new Date(existing.price_captured_at).getTime() : NaN;
  if (Number.isNaN(captured)) return true;
  return captured < now.getTime() - SNAPSHOT_REFRESH_DAYS * 86_400_000;
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
 * Below this many available rows, a scrape that sees few units is believable
 * (a small building really can lease most of its handful in a few days).
 */
const PARTIAL_SCRAPE_MIN_EXISTING = 6;
/** A scrape that saw less than this share of a real inventory is partial. */
const PARTIAL_SCRAPE_MIN_SHARE = 0.5;
/**
 * After a partial scrape, units unseen this long are still retired. Partial
 * renders are intermittent, so a live unit is re-seen by the next full one;
 * without this a genuine drop (or another building's floorplans picked up
 * from a sibling page) would stay "available" forever.
 */
export const UNSEEN_RETIRE_AFTER_DAYS = 14;

export interface RetirementInput {
  /** The availability page was found but every fetch of it failed. */
  unitsPageFetchFailed?: boolean;
  /** How many scraped listings carry a unit number. */
  scrapedNumbered: number;
  /** How many currently-available existing rows carry a unit number. */
  existingNumberedAvailable: number;
  /** How many distinct units this scrape matched or created (seenUnitIds). */
  seenCount: number;
  /** How many rows of any kind were available before this scrape. */
  existingAvailable: number;
}

/**
 * How far a scrape is evidence that the units it did not see are gone:
 * "all" retires every unseen unit, "stale" only those no scrape has seen for
 * UNSEEN_RETIRE_AFTER_DAYS, "none" nothing. Pure, and exported so both the
 * cron and the admin route share one rule.
 */
export function unseenRetirementScope(opts: RetirementInput): "all" | "stale" | "none" {
  // Bot wall / timeout on the units page: whatever we extracted came off the
  // marketing page and says nothing about the real inventory.
  if (opts.unitsPageFetchFailed) return "none";
  // Floorplan-level "from" prices must never retire a numbered unit a recent
  // scrape saw. Numbered units no scrape has seen for UNSEEN_RETIRE_AFTER_DAYS
  // are gone, though: a site that switched to floorplan-only listings
  // otherwise kept its last numbered inventory "available" forever.
  if (opts.scrapedNumbered === 0 && opts.existingNumberedAvailable > 0) return "stale";
  // A lazy-loaded list cut short: Loria Ansley went from 59 units to 5 off the
  // same URL three days later and 54 live listings were retired.
  if (
    opts.existingAvailable >= PARTIAL_SCRAPE_MIN_EXISTING &&
    opts.seenCount < opts.existingAvailable * PARTIAL_SCRAPE_MIN_SHARE
  ) {
    return "stale";
  }
  return "all";
}

/** Boolean form of unseenRetirementScope: may every unseen unit be retired? */
export function shouldRetireUnseenUnits(opts: RetirementInput): boolean {
  return unseenRetirementScope(opts) === "all";
}

/**
 * Retire what a scrape did not see, as far as the scrape is evidence of it,
 * and log when it is not. Shared by the batch job and the admin route.
 */
export async function retireUnseenUnits(
  supabase: SupabaseClient,
  building: { id: string; name: string },
  scrape: { units: ScrapedUnit[]; unitsPageFetchFailed?: boolean; source?: string },
  saved: SaveScrapedUnitsResult,
): Promise<"all" | "stale" | "none"> {
  const opts: RetirementInput = {
    unitsPageFetchFailed: scrape.unitsPageFetchFailed,
    scrapedNumbered: scrape.units.filter((u) => normalizeUnitNumber(u.unit_number) !== null).length,
    existingNumberedAvailable: saved.existingNumberedAvailable,
    seenCount: saved.seenUnitIds.length,
    existingAvailable: saved.existingAvailable,
  };
  const scope = unseenRetirementScope(opts);

  if (scope !== "all") {
    console.warn(
      `${scope === "stale" ? `Retiring only units unseen for ${UNSEEN_RETIRE_AFTER_DAYS}+ days` : "Skipping retirement"} ` +
        `for ${building.name}: source=${scrape.source}, ` +
        `units_page_fetch_failed=${opts.unitsPageFetchFailed}, ` +
        `scraped_numbered=${opts.scrapedNumbered}, existing_numbered=${opts.existingNumberedAvailable}, ` +
        `seen=${opts.seenCount}, existing_available=${opts.existingAvailable}`
    );
  }
  if (scope === "all") {
    await markUnitsUnavailable(supabase, building.id, saved.seenUnitIds);
  } else if (scope === "stale") {
    await markUnitsUnavailable(supabase, building.id, saved.seenUnitIds, {
      unseenSince: new Date(Date.now() - UNSEEN_RETIRE_AFTER_DAYS * 86_400_000),
    });
  }
  return scope;
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

  const saneUnits: ScrapedUnit[] = [];
  for (const u of units) {
    const sane = sanitizeScrapedUnit(u);
    if (!sane) {
      console.warn(`Skipping scraped unit with no usable identity for building ${buildingId}:`, u);
    } else {
      const nulled = (["rent", "beds", "baths", "sqft"] as const).filter((k) => u[k] != null && sane[k] == null);
      if (nulled.length > 0) {
        console.warn(`Dropping out-of-bounds ${nulled.join(", ")} from scraped unit for building ${buildingId}:`, u);
      }
      saneUnits.push(sane);
    }
  }

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
    price_captured_at: string | null;
  }>((from, to) =>
    supabase
      .from("units_with_latest_price")
      .select("id, unit_number, floorplan_id, beds, baths, sqft, is_available, latest_rent, price_captured_at, created_at")
      .eq("building_id", buildingId)
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to)
  );

  // A floorplan-level page ("1BR from $2,151") while the building's numbered
  // units were seen recently is a coarser view of the same apartments, not
  // more inventory. Saving it stacked a floorplan row on top of the numbered
  // ones and availability counted twice (Manchester State Thomas 15 + 16)
  // until the next unit-level scrape retired them. Recency comes from the
  // price capture, which saveScrapedUnits refreshes at least weekly.
  const recentSince = Date.now() - UNSEEN_RETIRE_AFTER_DAYS * 86_400_000;
  const recentNumbered = existingUnits.filter(
    (u) =>
      unitNumberKey(u.unit_number) !== null &&
      u.is_available !== false &&
      u.price_captured_at != null &&
      new Date(u.price_captured_at).getTime() >= recentSince
  ).length;
  if (
    saneUnits.length > 0 &&
    recentNumbered > 0 &&
    !saneUnits.some((u) => unitNumberKey(u.unit_number) !== null)
  ) {
    console.warn(
      `Not saving ${saneUnits.length} floorplan-level listings for building ${buildingId}: ` +
        `${recentNumbered} numbered units were seen in the last ${UNSEEN_RETIRE_AFTER_DAYS} days`
    );
    const available = existingUnits.filter((u) => u.is_available !== false);
    return {
      unitsCreated: 0,
      unitsUpdated: 0,
      seenUnitIds: [],
      existingNumberedAvailable: available.filter((u) => unitNumberKey(u.unit_number) !== null).length,
      existingAvailable: available.length,
    };
  }

  const floorplanIds = await resolveFloorplanIds(supabase, buildingId, saneUnits);

  // Newest row wins for either identity, so pre-existing duplicates collapse
  // onto one canonical unit and the rest get retired by markUnitsUnavailable.
  const existingByNumber = new Map<string, ExistingUnit>();
  const existingByFloorplan = new Map<string, ExistingUnit>();
  let existingNumberedAvailable = 0;
  let existingAvailable = 0;
  for (const u of existingUnits) {
    const rec: ExistingUnit = { id: u.id, latest_rent: u.latest_rent, price_captured_at: u.price_captured_at };
    if (u.is_available !== false) existingAvailable++;
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

      // Snapshot when rent changed or the last capture is a week old — blind
      // daily inserts grew unit_price_snapshots unboundedly and pushed units
      // past PostgREST's 1000-row cap in downstream latest-price reads.
      const rent = toInt(unit.rent);
      if (rent && needsPriceSnapshot(rent, existing)) {
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

  return {
    unitsCreated,
    unitsUpdated,
    seenUnitIds: [...seenUnitIds],
    existingNumberedAvailable,
    existingAvailable,
  };
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
  seenUnitIds: string[],
  options: {
    /**
     * Only retire units no scrape has touched since this time. saveScrapedUnits
     * updates every unit it sees, so units.updated_at is when one last was.
     */
    unseenSince?: Date;
  } = {}
) {
  // A scrape that saw nothing is not evidence the building is empty (it is
  // far more often a bot wall or a layout change) — never retire on it.
  if (seenUnitIds.length === 0) return;

  // Paged: buildings that accumulated floorplan phantoms hold well over 1000
  // "available" rows, and the tail past the cap was never reachable.
  const availableUnits = await fetchAllRows<{ id: string }>((from, to) => {
    let query = supabase
      .from("units")
      .select("id")
      .eq("building_id", buildingId)
      .eq("is_available", true);
    if (options.unseenSince) query = query.lt("updated_at", options.unseenSince.toISOString());
    return query.order("id").range(from, to);
  });

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
  options: {
    replaceExisting?: boolean;
    /** The page these images came from, with the building it is supposed to depict. */
    source?: { websiteUrl: string; buildingName: string };
  } = {}
) {
  const { replaceExisting = true, source } = options;

  if (images.length === 0) return 0;

  // A management-company homepage depicts the portfolio, not this building —
  // saving its hero shot gives every property under that company the same
  // thumbnail. Better to show nothing than to show someone else's building.
  if (source && !isPropertySpecificUrl(source.websiteUrl, source.buildingName)) {
    console.warn(
      `Skipping images for "${source.buildingName}": ${source.websiteUrl} is not a property-specific page`
    );
    return 0;
  }

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

  // A photo already attached to a different building cannot also be this
  // building. Sites that share a CMS hand out the same asset to every property
  // on them, which is how five Glenwood towers ended up with one lobby shot.
  for (const urls of chunk(buildingImages.map((img) => img.url), IN_CHUNK_SIZE)) {
    const { data: claimed } = await supabase
      .from("building_images")
      .select("url")
      .in("url", urls)
      .neq("building_id", buildingId);
    for (const row of claimed ?? []) existingUrlSet.add(row.url);
  }

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
