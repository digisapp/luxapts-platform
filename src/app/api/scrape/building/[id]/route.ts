import { NextResponse } from "next/server";

// Multi-page fetch + AI extraction for one building (default serverless timeout kills it mid-run, stranding jobs in "running")
export const maxDuration = 300;
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import {
  scrapeUnitsOnly,
  scrapeAmenitiesOnly,
  scrapeFullBuilding,
  scrapeImagesOnly,
  updateScrapeStatus,
  saveScrapedUnits,
  saveScrapedAmenities,
  saveScrapedBuildingImages,
  saveScrapedUnitImages,
  retireUnseenUnits,
  resolveScrapeUrl,
} from "@/lib/scraper";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: Request, context: RouteContext) {
  try {
    const { id: buildingId } = await context.params;
    const body = await req.json().catch(() => ({}));
    const scrapeType = (body.type as "units" | "amenities" | "images" | "full") || "full";

    // Verify admin access or cron secret
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    const supabase = createAdminClient();

    // Check if request is from cron or admin
    const isAuthorized = cronSecret && authHeader === `Bearer ${cronSecret}`;

    if (!isAuthorized) {
      const authResult = await checkAdminAuth();
      if (!authResult.isAdmin) {
        return NextResponse.json({ error: authResult.error }, { status: authResult.status });
      }
    }

    // Get building info
    const { data: building, error: buildingError } = await supabase
      .from("buildings")
      .select("id, name, website_url, building_scrape_status (website_url)")
      .eq("id", buildingId)
      .single();

    if (buildingError || !building) {
      return NextResponse.json({ error: "Building not found" }, { status: 404 });
    }

    // Scraper-internal override first — same selection as the batch job
    const scrapeUrl = resolveScrapeUrl(building);

    if (!scrapeUrl) {
      return NextResponse.json({ error: "Building has no website URL" }, { status: 400 });
    }

    // Handle image scraping separately since it has a different result shape
    if (scrapeType === "images") {
      const imageResult = await scrapeImagesOnly(scrapeUrl);

      if (!imageResult.success || !imageResult.data) {
        await updateScrapeStatus(supabase, buildingId, {
          type: "images",
          success: false,
          error: imageResult.error,
        });

        return NextResponse.json({
          success: false,
          error: imageResult.error,
          building: { id: buildingId, name: building.name },
        });
      }

      const buildingImagesSaved = await saveScrapedBuildingImages(
        supabase,
        buildingId,
        imageResult.data.building_images,
        { source: { websiteUrl: scrapeUrl, buildingName: building.name } }
      );

      const unitImagesSaved = await saveScrapedUnitImages(
        supabase,
        buildingId,
        imageResult.data.unit_images
      );

      const totalImages = buildingImagesSaved + unitImagesSaved;

      await updateScrapeStatus(supabase, buildingId, {
        type: "images",
        success: true,
        imagesFound: totalImages,
      });

      return NextResponse.json({
        success: true,
        building: { id: buildingId, name: building.name },
        results: {
          building_images_found: imageResult.data.building_images.length,
          building_images_saved: buildingImagesSaved,
          unit_images_found: imageResult.data.unit_images.length,
          unit_images_saved: unitImagesSaved,
          total_saved: totalImages,
          gallery_page: imageResult.data.gallery_page_url,
        },
        metadata: {
          source_url: building.website_url,
          scraped_at: new Date().toISOString(),
          html_length: imageResult.raw_html_length,
        },
      });
    }

    // Perform scrape based on type (units/amenities/full).
    // Every branch uses the resolved scrapeUrl — the scraper-internal override
    // exists precisely because building.website_url is often unscrapable.
    let result;
    if (scrapeType === "units") {
      result = await scrapeUnitsOnly(scrapeUrl);
    } else if (scrapeType === "amenities") {
      result = await scrapeAmenitiesOnly(scrapeUrl);
    } else {
      result = await scrapeFullBuilding(scrapeUrl);
    }

    if (!result.success || !result.data) {
      await updateScrapeStatus(supabase, buildingId, {
        type: scrapeType,
        success: false,
        error: result.error,
      });

      return NextResponse.json({
        success: false,
        error: result.error,
        building: { id: buildingId, name: building.name },
      });
    }

    // Save scraped data
    let unitsResult = { unitsCreated: 0, unitsUpdated: 0 };
    let amenitiesLinked = 0;

    if (scrapeType === "units" || scrapeType === "full") {
      if (result.data.units.length > 0) {
        const saved = await saveScrapedUnits(supabase, buildingId, result.data.units);
        unitsResult = { unitsCreated: saved.unitsCreated, unitsUpdated: saved.unitsUpdated };

        // Same retirement guard as the cron: floorplan-level, bot-walled or
        // half-rendered results are not evidence that units are gone.
        await retireUnseenUnits(
          supabase,
          { id: buildingId, name: building.name },
          {
            units: result.data.units,
            unitsPageFetchFailed: result.units_page_fetch_failed,
            source: result.source,
          },
          saved,
        );
      }
    }

    if (scrapeType === "amenities" || scrapeType === "full") {
      if (result.data.amenities.length > 0) {
        amenitiesLinked = await saveScrapedAmenities(supabase, buildingId, result.data.amenities);
      }

      // Update pet/parking policies if found
      if (result.data.pet_policy || result.data.parking_policy) {
        await supabase
          .from("buildings")
          .update({
            pet_policy: result.data.pet_policy || undefined,
            parking_policy: result.data.parking_policy || undefined,
          })
          .eq("id", buildingId);
      }
    }

    // Update scrape status. A full scrape whose amenity extraction failed
    // records amenities as failed — stamping success deferred the building
    // out of the amenities cron for 180 days.
    const amenitiesError = scrapeType === "full" ? result.data.amenities_error : undefined;
    if (amenitiesError) {
      await updateScrapeStatus(supabase, buildingId, {
        type: "units",
        success: true,
        unitsFound: result.data.units.length,
      });
      await updateScrapeStatus(supabase, buildingId, {
        type: "amenities",
        success: false,
        error: `Amenity extraction failed: ${amenitiesError}`,
      });
    } else {
      await updateScrapeStatus(supabase, buildingId, {
        type: scrapeType,
        success: true,
        unitsFound: result.data.units.length,
      });
    }

    return NextResponse.json({
      success: true,
      building: { id: buildingId, name: building.name },
      results: {
        units_found: result.data.units.length,
        units_created: unitsResult.unitsCreated,
        units_updated: unitsResult.unitsUpdated,
        amenities_found: result.data.amenities.length,
        amenities_linked: amenitiesLinked,
        ...(amenitiesError ? { amenities_error: amenitiesError } : {}),
        pet_policy: result.data.pet_policy,
        parking_policy: result.data.parking_policy,
        move_in_specials: result.data.move_in_specials,
      },
      metadata: {
        source_url: result.data.source_url,
        scraped_at: result.data.scraped_at,
        html_length: result.raw_html_length,
      },
    });
  } catch (error) {
    console.error("Scrape building error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET endpoint to check scrape status
export async function GET(req: Request, context: RouteContext) {
  try {
    const { id: buildingId } = await context.params;

    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;
    if (!isCron) {
      const authResult = await checkAdminAuth();
      if (!authResult.isAdmin) {
        return NextResponse.json({ error: authResult.error }, { status: authResult.status });
      }
    }

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("building_scrape_status")
      .select("*")
      .eq("building_id", buildingId)
      .single();

    if (error) {
      return NextResponse.json({ error: "Status not found" }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Get scrape status error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
