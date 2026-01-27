import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import {
  scrapeAmenitiesOnly,
  updateScrapeStatus,
  saveScrapedAmenities,
  createScrapeJob,
  updateScrapeJob,
} from "@/lib/scraper";

// This endpoint scrapes amenities for buildings that haven't been scraped yet
// Amenities rarely change, so this only needs to run once per building
// or occasionally to catch updates

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
    const forceRescrape = url.searchParams.get("force") === "true";

    const limit = limitParam ? parseInt(limitParam) : 10; // Lower limit since amenities scraping is heavier

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

    // Create scrape job for tracking
    const jobId = await createScrapeJob(supabase, "amenities", { cityId });

    if (jobId) {
      await updateScrapeJob(supabase, jobId, { status: "running" });
    }

    // Get buildings that need amenities scraping
    let buildingsQuery = supabase
      .from("buildings")
      .select(`
        id,
        name,
        website_url,
        city_id,
        building_scrape_status (
          website_url,
          scrape_enabled,
          amenities_scraped_at
        )
      `)
      .eq("status", "active")
      .not("website_url", "is", null);

    if (cityId) {
      buildingsQuery = buildingsQuery.eq("city_id", cityId);
    }

    const { data: allBuildings } = await buildingsQuery.limit(limit * 3);

    // Filter to buildings that haven't had amenities scraped (or force rescrape)
    const buildings = (allBuildings || []).filter((b) => {
      const status = b.building_scrape_status?.[0];
      if (!status) return true;
      if (status.scrape_enabled === false) return false;
      if (forceRescrape) return true;
      return !status.amenities_scraped_at;
    }).slice(0, limit);

    if (buildings.length === 0) {
      if (jobId) {
        await updateScrapeJob(supabase, jobId, {
          status: "completed",
          buildingsProcessed: 0,
        });
      }

      return NextResponse.json({
        message: "No buildings need amenity scraping",
        buildings_checked: 0,
      });
    }

    // Process buildings with rate limiting
    const results = {
      processed: 0,
      success: 0,
      failed: 0,
      total_amenities_found: 0,
      errors: [] as { building_id: string; building_name: string; error: string }[],
    };

    for (const building of buildings) {
      const websiteUrl = building.website_url || building.building_scrape_status?.[0]?.website_url;

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
          await new Promise((resolve) => setTimeout(resolve, 5000)); // 5 second delay for amenities
        }

        const scrapeResult = await scrapeAmenitiesOnly(websiteUrl);

        if (scrapeResult.success && scrapeResult.data) {
          // Save amenities
          if (scrapeResult.data.amenities.length > 0) {
            await saveScrapedAmenities(supabase, building.id, scrapeResult.data.amenities);
          }

          // Update policies if found
          if (scrapeResult.data.pet_policy || scrapeResult.data.parking_policy) {
            await supabase
              .from("buildings")
              .update({
                pet_policy: scrapeResult.data.pet_policy || undefined,
                parking_policy: scrapeResult.data.parking_policy || undefined,
              })
              .eq("id", building.id);
          }

          await updateScrapeStatus(supabase, building.id, {
            type: "amenities",
            success: true,
            websiteUrl,
          });

          results.success++;
          results.total_amenities_found += scrapeResult.data.amenities.length;
        } else {
          await updateScrapeStatus(supabase, building.id, {
            type: "amenities",
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
          type: "amenities",
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
      if (jobId) {
        await updateScrapeJob(supabase, jobId, {
          buildingsProcessed: results.processed,
          buildingsSuccess: results.success,
          buildingsFailed: results.failed,
          amenitiesFound: results.total_amenities_found,
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
        amenitiesFound: results.total_amenities_found,
        errors: results.errors,
      });
    }

    return NextResponse.json({
      message: "Amenity scraping completed",
      job_id: jobId,
      results: {
        buildings_processed: results.processed,
        buildings_success: results.success,
        buildings_failed: results.failed,
        total_amenities_found: results.total_amenities_found,
      },
      errors: results.errors.slice(0, 10),
    });
  } catch (error) {
    console.error("Cron scrape amenities error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
