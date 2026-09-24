// One batch of unit scraping: stalest buildings first, each with its own
// deadline, results written as they land. Shared by the /api/cron/scrape-units
// route and scripts/scrape-units-batch.ts (the GitHub Actions job, which has a
// real browser for JS-rendered leasing sites — Vercel does not).

import type { SupabaseClient } from "@supabase/supabase-js";
import { withTimeout } from "@/lib/with-timeout";
import { scrapeUnitsOnly } from "./fetcher";
import {
  getBuildingsToScrape,
  scrapeStatusOf,
  updateScrapeStatus,
  saveScrapedUnits,
  markUnitsUnavailable,
  shouldRetireUnseenUnits,
  normalizeUnitNumber,
  createScrapeJob,
  updateScrapeJob,
} from "./db";

export interface UnitScrapeBatchOptions {
  cityId?: string;
  limit: number;
  daysStale: number;
  /** Total time this batch may spend on buildings. */
  timeBudgetMs: number;
  /**
   * A single building (two fetches, JS-render fallback, two AI extractions)
   * can take well over two minutes; without a per-building deadline the
   * platform killed invocations mid-building and stranded jobs in "running".
   */
  perBuildingTimeoutMs?: number;
  /** Pause between buildings, to be polite to shared leasing platforms. */
  delayMs?: number;
  log?: (line: string) => void;
}

export interface UnitScrapeBatchResult {
  job_id: string | null;
  buildings_checked: number;
  processed: number;
  success: number;
  failed: number;
  skipped_for_time: number;
  total_units_found: number;
  elapsed_ms: number;
  errors: { building_id: string; building_name: string; error: string }[];
}

const MIN_USEFUL_REMAINING_MS = 20_000;

export async function runUnitScrapeBatch(
  supabase: SupabaseClient,
  opts: UnitScrapeBatchOptions
): Promise<UnitScrapeBatchResult> {
  const { cityId, limit, daysStale, timeBudgetMs, perBuildingTimeoutMs = 120_000, delayMs = 3000 } = opts;
  const log = opts.log ?? (() => {});
  const startedAt = Date.now();

  // Jobs from invocations killed mid-run never get their final update;
  // anything still "running" after an hour is dead.
  await supabase
    .from("scrape_jobs")
    .update({ status: "failed", completed_at: new Date().toISOString() })
    .eq("status", "running")
    .lt("started_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());

  const jobId = await createScrapeJob(supabase, "units", { cityId });
  if (jobId) await updateScrapeJob(supabase, jobId, { status: "running" });

  const buildings = await getBuildingsToScrape(supabase, { cityId, onlyUnits: true, limit, daysStale });

  const results: UnitScrapeBatchResult = {
    job_id: jobId,
    buildings_checked: buildings.length,
    processed: 0,
    success: 0,
    failed: 0,
    skipped_for_time: 0,
    total_units_found: 0,
    elapsed_ms: 0,
    errors: [],
  };

  for (const building of buildings) {
    const remainingMs = timeBudgetMs - (Date.now() - startedAt);
    if (remainingMs < MIN_USEFUL_REMAINING_MS) {
      // Untouched buildings keep their old units_scraped_at, so the fair
      // stalest-first ordering picks them up first next run.
      results.skipped_for_time = buildings.length - results.processed;
      break;
    }

    // Scraper-internal override first: building_scrape_status.website_url points at the
    // best scrape target (portal/API/manager page) without changing the user-facing link
    const websiteUrl = scrapeStatusOf(building)?.website_url || building.website_url;
    if (!websiteUrl) {
      results.failed++;
      results.errors.push({ building_id: building.id, building_name: building.name, error: "No website URL" });
      continue;
    }

    if (results.processed > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));

    try {
      const scrapeResult = await withTimeout(
        scrapeUnitsOnly(websiteUrl),
        Math.min(perBuildingTimeoutMs, remainingMs),
        "Scrape timed out",
      );

      if (scrapeResult.success && scrapeResult.data) {
        if (scrapeResult.data.units.length > 0) {
          const saved = await saveScrapedUnits(supabase, building.id, scrapeResult.data.units);

          // Anything still listed that this scrape didn't see is no longer
          // available — but only when the scrape is evidence of that. A
          // bot-walled availability page or a marketing page's floorplan
          // "from" prices used to retire every real numbered unit purely
          // because units.length > 0.
          const scrapedNumbered = scrapeResult.data.units.filter(
            (u) => normalizeUnitNumber(u.unit_number) !== null
          ).length;

          if (
            shouldRetireUnseenUnits({
              unitsPageFetchFailed: scrapeResult.units_page_fetch_failed,
              scrapedNumbered,
              existingNumberedAvailable: saved.existingNumberedAvailable,
            })
          ) {
            await markUnitsUnavailable(supabase, building.id, saved.seenUnitIds);
          } else {
            console.warn(
              `Skipping retirement for ${building.name}: source=${scrapeResult.source}, ` +
                `units_page_fetch_failed=${scrapeResult.units_page_fetch_failed}, ` +
                `scraped_numbered=${scrapedNumbered}, existing_numbered=${saved.existingNumberedAvailable}`
            );
          }
        }

        await updateScrapeStatus(supabase, building.id, {
          type: "units",
          success: true,
          unitsFound: scrapeResult.data.units.length,
          websiteUrl,
        });

        results.success++;
        results.total_units_found += scrapeResult.data.units.length;
        log(`OK    ${building.name}: ${scrapeResult.data.units.length} units`);
      } else {
        await updateScrapeStatus(supabase, building.id, {
          type: "units",
          success: false,
          error: scrapeResult.error,
          websiteUrl,
        });
        results.failed++;
        results.errors.push({
          building_id: building.id,
          building_name: building.name,
          error: scrapeResult.error || "Unknown error",
        });
        log(`FAIL  ${building.name}: ${scrapeResult.error}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await updateScrapeStatus(supabase, building.id, {
        type: "units",
        success: false,
        error: errorMessage,
        websiteUrl,
      });
      results.failed++;
      results.errors.push({ building_id: building.id, building_name: building.name, error: errorMessage });
      log(`FAIL  ${building.name}: ${errorMessage}`);
    }

    results.processed++;

    if (jobId && results.processed % 5 === 0) {
      await updateScrapeJob(supabase, jobId, {
        buildingsProcessed: results.processed,
        buildingsSuccess: results.success,
        buildingsFailed: results.failed,
        unitsFound: results.total_units_found,
      });
    }
  }

  if (jobId) {
    await updateScrapeJob(supabase, jobId, {
      status: results.processed > 0 && results.failed === results.processed ? "failed" : "completed",
      buildingsProcessed: results.processed,
      buildingsSuccess: results.success,
      buildingsFailed: results.failed,
      unitsFound: results.total_units_found,
      errors: results.errors,
    });
  }

  results.elapsed_ms = Date.now() - startedAt;
  return results;
}
