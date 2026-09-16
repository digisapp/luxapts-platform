import { NextResponse } from "next/server";
import { scrapeStatusOf } from "@/lib/scraper/db";

// Batch image scrape across buildings (default serverless timeout kills it mid-run, stranding jobs in "running")
export const maxDuration = 300;
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { fetchAllRows } from "@/lib/db-helpers";
import { withTimeout } from "@/lib/with-timeout";
import {
  scrapeImagesOnly,
  updateScrapeStatus,
  saveScrapedBuildingImages,
  saveScrapedUnitImages,
  createScrapeJob,
  updateScrapeJob,
} from "@/lib/scraper";

// Same guard as cron/scrape-units: a per-building deadline plus a loop budget,
// so the job's final status is always written inside the function window
// instead of the platform killing the invocation and stranding it in "running".
const PER_BUILDING_TIMEOUT_MS = 120_000;
const FINALIZE_HEADROOM_MS = 30_000;
const MIN_USEFUL_REMAINING_MS = 20_000;
const TIME_BUDGET_MS = maxDuration * 1000 - FINALIZE_HEADROOM_MS;

interface ImageScrapeCandidate {
  id: string;
  name: string;
  website_url: string | null;
  city_id: string | null;
  building_scrape_status:
    | { images_scraped_at: string | null; images_scrape_success: boolean | null }
    | { images_scraped_at: string | null; images_scrape_success: boolean | null }[]
    | null;
}

// POST: Batch scrape images for multiple buildings
// Body: { city_slug?, building_ids?, limit?, skip_already_scraped? }
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      city_slug,
      building_ids,
      limit = 10,
      skip_already_scraped = true,
    } = body;

    // Verify authorization
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    const isAuthorized = cronSecret && authHeader === `Bearer ${cronSecret}`;

    if (!isAuthorized) {
      const authResult = await checkAdminAuth();
      if (!authResult.isAdmin) {
        return NextResponse.json({ error: authResult.error }, { status: authResult.status });
      }
    }

    const supabase = createAdminClient();

    let cityId: string | undefined;
    if (city_slug) {
      const { data: city } = await supabase
        .from("cities")
        .select("id")
        .eq("slug", city_slug)
        .single();

      if (!city) {
        return NextResponse.json({ error: `City not found: ${city_slug}` }, { status: 404 });
      }
      cityId = city.id;
    }

    // Fetch the ENTIRE eligible fleet (paged past the 1000-row cap). The old
    // `.limit(limit * 2)` had no ORDER BY, so the same arbitrary window was
    // filtered every run and buildings outside it were never imaged at all.
    const buildings = await fetchAllRows<ImageScrapeCandidate>((from, to) => {
      let query = supabase
        .from("buildings")
        .select(`
          id,
          name,
          website_url,
          city_id,
          building_scrape_status (
            images_scraped_at,
            images_scrape_success
          )
        `)
        .eq("status", "active")
        .not("website_url", "is", null);

      if (cityId) query = query.eq("city_id", cityId);
      if (building_ids?.length) query = query.in("id", building_ids);

      return query.order("id").range(from, to);
    });

    if (!buildings.length) {
      return NextResponse.json({ error: "No buildings found" }, { status: 404 });
    }

    // Filter out already-scraped buildings if requested
    let eligible = buildings;
    if (skip_already_scraped) {
      eligible = buildings.filter((b) => {
        const status = scrapeStatusOf(b);
        return !status?.images_scraped_at || !status?.images_scrape_success;
      });
    }

    // Never-imaged first, then stalest — a fair round-robin over the fleet.
    const imagedAt = (b: ImageScrapeCandidate): number | null => {
      const at = scrapeStatusOf(b)?.images_scraped_at;
      return at ? new Date(at).getTime() : null;
    };

    const toScrape = [...eligible]
      .sort((a, b) => (imagedAt(a) ?? -Infinity) - (imagedAt(b) ?? -Infinity))
      .slice(0, limit);

    if (toScrape.length === 0) {
      return NextResponse.json({
        success: true,
        message: "All buildings already have scraped images",
        total_buildings: buildings.length,
        buildings_scraped: 0,
      });
    }

    // Create a scrape job for tracking
    const jobId = await createScrapeJob(supabase, "images", { cityId });

    if (jobId) {
      await updateScrapeJob(supabase, jobId, { status: "running" });
    }

    // Process buildings sequentially (rate limiting)
    const results: {
      building_id: string;
      building_name: string;
      success: boolean;
      images_saved: number;
      error?: string;
    }[] = [];

    let totalSuccess = 0;
    let totalFailed = 0;
    let totalImages = 0;
    let skippedForTime = 0;
    let processed = 0;

    const startedAt = Date.now();

    for (const building of toScrape) {
      const remainingMs = TIME_BUDGET_MS - (Date.now() - startedAt);
      if (remainingMs < MIN_USEFUL_REMAINING_MS) {
        // Untouched buildings keep their old images_scraped_at, so the
        // never-imaged-first ordering picks them up first next run.
        skippedForTime = toScrape.length - processed;
        break;
      }
      processed++;

      try {
        const imageResult = await withTimeout(
          scrapeImagesOnly(building.website_url!),
          Math.min(PER_BUILDING_TIMEOUT_MS, remainingMs),
          "Image scrape timed out",
        );

        if (!imageResult.success || !imageResult.data) {
          await updateScrapeStatus(supabase, building.id, {
            type: "images",
            success: false,
            error: imageResult.error,
            websiteUrl: building.website_url!,
          });

          results.push({
            building_id: building.id,
            building_name: building.name,
            success: false,
            images_saved: 0,
            error: imageResult.error,
          });
          totalFailed++;
          continue;
        }

        const buildingImagesSaved = await saveScrapedBuildingImages(
          supabase,
          building.id,
          imageResult.data.building_images,
          { source: { websiteUrl: building.website_url!, buildingName: building.name } }
        );

        const unitImagesSaved = await saveScrapedUnitImages(
          supabase,
          building.id,
          imageResult.data.unit_images
        );

        const imagesSaved = buildingImagesSaved + unitImagesSaved;
        totalImages += imagesSaved;

        await updateScrapeStatus(supabase, building.id, {
          type: "images",
          success: true,
          imagesFound: imagesSaved,
          websiteUrl: building.website_url!,
        });

        results.push({
          building_id: building.id,
          building_name: building.name,
          success: true,
          images_saved: imagesSaved,
        });

        totalSuccess++;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Unknown error";

        // Record the failure so a permanently broken building doesn't sit at
        // the front of the never-imaged queue forever.
        await updateScrapeStatus(supabase, building.id, {
          type: "images",
          success: false,
          error: errMsg,
          websiteUrl: building.website_url!,
        });

        results.push({
          building_id: building.id,
          building_name: building.name,
          success: false,
          images_saved: 0,
          error: errMsg,
        });
        totalFailed++;
      }
    }

    // Update job status
    if (jobId) {
      await updateScrapeJob(supabase, jobId, {
        status: "completed",
        buildingsProcessed: processed,
        buildingsSuccess: totalSuccess,
        buildingsFailed: totalFailed,
      });
    }

    return NextResponse.json({
      success: true,
      job_id: jobId,
      summary: {
        total_buildings: processed,
        success: totalSuccess,
        failed: totalFailed,
        skipped_for_time: skippedForTime,
        total_images_saved: totalImages,
        elapsed_ms: Date.now() - startedAt,
      },
      results,
    });
  } catch (error) {
    console.error("Batch image scrape error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET: Check image scraping status across buildings
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;
    if (!isCron) {
      const authResult = await checkAdminAuth();
      if (!authResult.isAdmin) {
        return NextResponse.json({ error: authResult.error }, { status: authResult.status });
      }
    }

    const url = new URL(req.url);
    const citySlug = url.searchParams.get("city");

    const supabase = createAdminClient();

    let query = supabase
      .from("buildings")
      .select(`
        id,
        name,
        website_url,
        cities:city_id (slug, name),
        building_scrape_status (
          images_scraped_at,
          images_scrape_success,
          images_scrape_error,
          images_found
        ),
        building_images (id)
      `)
      .eq("status", "active")
      .not("website_url", "is", null);

    if (citySlug) {
      const { data: city } = await supabase
        .from("cities")
        .select("id")
        .eq("slug", citySlug)
        .single();

      if (city) {
        query = query.eq("city_id", city.id);
      }
    }

    const { data: buildings, error } = await query.limit(300);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const processed = (buildings || []).map((b) => {
      const scrapeStatus = scrapeStatusOf(b);
      const city = Array.isArray(b.cities) ? b.cities[0] : b.cities;
      const imageCount = b.building_images?.length || 0;

      let imageState = "no_images";
      if (scrapeStatus?.images_scraped_at) {
        imageState = scrapeStatus.images_scrape_success ? "scraped" : "failed";
      } else if (imageCount > 0) {
        imageState = "has_fallbacks";
      }

      return {
        id: b.id,
        name: b.name,
        website_url: b.website_url,
        city: city?.name,
        image_state: imageState,
        images_in_db: imageCount,
        scraped_at: scrapeStatus?.images_scraped_at,
        scrape_error: scrapeStatus?.images_scrape_error,
      };
    });

    const summary = {
      total: processed.length,
      no_images: processed.filter((b) => b.image_state === "no_images").length,
      has_fallbacks: processed.filter((b) => b.image_state === "has_fallbacks").length,
      scraped: processed.filter((b) => b.image_state === "scraped").length,
      failed: processed.filter((b) => b.image_state === "failed").length,
    };

    return NextResponse.json({ summary, buildings: processed });
  } catch (error) {
    console.error("Image scrape status error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
