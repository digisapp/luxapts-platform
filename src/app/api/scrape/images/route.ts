import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import {
  scrapeImagesOnly,
  updateScrapeStatus,
  saveScrapedBuildingImages,
  saveScrapedUnitImages,
  createScrapeJob,
  updateScrapeJob,
} from "@/lib/scraper";

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
      // For now allow (add admin auth check as needed)
    }

    const supabase = createAdminClient();

    // Build query for buildings with websites
    let query = supabase
      .from("buildings")
      .select(`
        id,
        name,
        website_url,
        city_id,
        cities:city_id (slug, name),
        building_scrape_status (
          images_scraped_at,
          images_scrape_success
        )
      `)
      .eq("status", "active")
      .not("website_url", "is", null);

    // Filter by city
    if (city_slug) {
      const { data: city } = await supabase
        .from("cities")
        .select("id")
        .eq("slug", city_slug)
        .single();

      if (!city) {
        return NextResponse.json({ error: `City not found: ${city_slug}` }, { status: 404 });
      }

      query = query.eq("city_id", city.id);
    }

    // Filter by specific building IDs
    if (building_ids?.length) {
      query = query.in("id", building_ids);
    }

    const { data: buildings, error: queryError } = await query.limit(limit * 2);

    if (queryError) {
      return NextResponse.json({ error: queryError.message }, { status: 500 });
    }

    if (!buildings?.length) {
      return NextResponse.json({ error: "No buildings found" }, { status: 404 });
    }

    // Filter out already-scraped buildings if requested
    let toScrape = buildings;
    if (skip_already_scraped) {
      toScrape = buildings.filter((b) => {
        const status = b.building_scrape_status?.[0];
        return !status?.images_scraped_at || !status?.images_scrape_success;
      });
    }

    toScrape = toScrape.slice(0, limit);

    if (toScrape.length === 0) {
      return NextResponse.json({
        success: true,
        message: "All buildings already have scraped images",
        total_buildings: buildings.length,
        buildings_scraped: 0,
      });
    }

    // Create a scrape job for tracking
    const jobId = await createScrapeJob(supabase, "images", {
      cityId: city_slug ? buildings[0]?.city_id : undefined,
    });

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

    for (const building of toScrape) {
      try {
        console.log(`[Image Scrape] Processing: ${building.name} (${building.website_url})`);

        const imageResult = await scrapeImagesOnly(building.website_url!);

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
          imageResult.data.building_images
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
        console.log(`[Image Scrape] ${building.name}: ${imagesSaved} images saved`);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Unknown error";
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
        buildingsProcessed: toScrape.length,
        buildingsSuccess: totalSuccess,
        buildingsFailed: totalFailed,
      });
    }

    return NextResponse.json({
      success: true,
      job_id: jobId,
      summary: {
        total_buildings: toScrape.length,
        success: totalSuccess,
        failed: totalFailed,
        total_images_saved: totalImages,
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
      const scrapeStatus = b.building_scrape_status?.[0];
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
