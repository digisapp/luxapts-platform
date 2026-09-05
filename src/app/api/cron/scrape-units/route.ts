import { NextResponse } from "next/server";

// Serial multi-building scrape with AI extraction — needs the full window (default serverless timeout kills it mid-run, stranding jobs in "running")
export const maxDuration = 300;
import { createAdminClient } from "@/lib/supabase/server";
import { withTimeout } from "@/lib/with-timeout";
import {
  scrapeUnitsOnly,
  getBuildingsToScrape,
  scrapeStatusOf,
  updateScrapeStatus,
  saveScrapedUnits,
  markUnitsUnavailable,
  createScrapeJob,
  updateScrapeJob,
} from "@/lib/scraper";

// A single building (two fetches, JS-render fallback, two AI extractions)
// can take well over two minutes, so a loop-level budget alone still let the
// platform kill the invocation mid-building and strand the job in "running".
// Each building now gets its own deadline, capped by what is left of the
// window, and the loop stops early enough to write the final job update.
const PER_BUILDING_TIMEOUT_MS = 120_000;
const FINALIZE_HEADROOM_MS = 30_000;
const MIN_USEFUL_REMAINING_MS = 20_000;
const TIME_BUDGET_MS = maxDuration * 1000 - FINALIZE_HEADROOM_MS;

// This endpoint should be called by a cron job (e.g., Vercel Cron)
// to update unit availability across all buildings
// Recommended: Run weekly or bi-weekly for fresh data

export async function GET(req: Request) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const citySlug = url.searchParams.get("city");
    const limitParam = url.searchParams.get("limit");
    const daysStaleParam = url.searchParams.get("days_stale");

    const limit = limitParam ? parseInt(limitParam) : 20;
    const daysStale = daysStaleParam ? parseInt(daysStaleParam) : 7; // Default: scrape if older than 7 days

    const supabase = createAdminClient();

    // Resolve city ID if city slug provided
    let cityId: string | undefined;
    if (citySlug) {
      const { data: city } = await supabase
        .from("cities")
        .select("id")
        .eq("slug", citySlug)
        .single();
      cityId = city?.id;
    }

    // Jobs from invocations the platform killed mid-run never get their
    // final update; anything still "running" after an hour is dead.
    await supabase
      .from("scrape_jobs")
      .update({ status: "failed", completed_at: new Date().toISOString() })
      .eq("status", "running")
      .lt("started_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());

    const startedAt = Date.now();

    // Create scrape job for tracking
    const jobId = await createScrapeJob(supabase, "units", { cityId });

    if (jobId) {
      await updateScrapeJob(supabase, jobId, { status: "running" });
    }

    // Get buildings that need scraping
    const buildings = await getBuildingsToScrape(supabase, {
      cityId,
      onlyUnits: true,
      limit,
      daysStale,
    });

    if (buildings.length === 0) {
      if (jobId) {
        await updateScrapeJob(supabase, jobId, {
          status: "completed",
          buildingsProcessed: 0,
        });
      }

      return NextResponse.json({
        message: "No buildings need scraping",
        buildings_checked: 0,
      });
    }

    // Process buildings with rate limiting
    const results = {
      processed: 0,
      success: 0,
      failed: 0,
      skipped_for_time: 0,
      total_units_found: 0,
      errors: [] as { building_id: string; building_name: string; error: string }[],
    };

    for (const building of buildings) {
      const remainingMs = TIME_BUDGET_MS - (Date.now() - startedAt);
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
        results.errors.push({
          building_id: building.id,
          building_name: building.name,
          error: "No website URL",
        });
        continue;
      }

      try {
        // Add delay between requests to be respectful
        if (results.processed > 0) {
          await new Promise((resolve) => setTimeout(resolve, 3000)); // 3 second delay
        }

        const scrapeResult = await withTimeout(
          scrapeUnitsOnly(websiteUrl),
          Math.min(PER_BUILDING_TIMEOUT_MS, remainingMs),
          "Scrape timed out",
        );

        if (scrapeResult.success && scrapeResult.data) {
          // Save units
          if (scrapeResult.data.units.length > 0) {
            const saved = await saveScrapedUnits(supabase, building.id, scrapeResult.data.units);
            // Anything still listed that this scrape didn't see is no longer available
            await markUnitsUnavailable(supabase, building.id, saved.seenUnitIds);
          }

          await updateScrapeStatus(supabase, building.id, {
            type: "units",
            success: true,
            unitsFound: scrapeResult.data.units.length,
            websiteUrl,
          });

          results.success++;
          results.total_units_found += scrapeResult.data.units.length;
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
        results.errors.push({
          building_id: building.id,
          building_name: building.name,
          error: errorMessage,
        });
      }

      results.processed++;

      // Update job progress
      if (jobId && results.processed % 5 === 0) {
        await updateScrapeJob(supabase, jobId, {
          buildingsProcessed: results.processed,
          buildingsSuccess: results.success,
          buildingsFailed: results.failed,
          unitsFound: results.total_units_found,
        });
      }
    }

    // Final job update
    if (jobId) {
      await updateScrapeJob(supabase, jobId, {
        status: results.failed === results.processed ? "failed" : "completed",
        buildingsProcessed: results.processed,
        buildingsSuccess: results.success,
        buildingsFailed: results.failed,
        unitsFound: results.total_units_found,
        errors: results.errors,
      });
    }

    return NextResponse.json({
      message: "Unit scraping completed",
      job_id: jobId,
      results: {
        buildings_processed: results.processed,
        buildings_success: results.success,
        buildings_failed: results.failed,
        buildings_skipped_for_time: results.skipped_for_time,
        total_units_found: results.total_units_found,
        elapsed_ms: Date.now() - startedAt,
      },
      errors: results.errors.slice(0, 10), // Only return first 10 errors
    });
  } catch (error) {
    console.error("Cron scrape units error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
