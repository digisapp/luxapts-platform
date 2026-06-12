import { NextResponse } from "next/server";
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
  markUnitsUnavailable,
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
      .select("id, name, website_url")
      .eq("id", buildingId)
      .single();

    if (buildingError || !building) {
      return NextResponse.json({ error: "Building not found" }, { status: 404 });
    }

    if (!building.website_url) {
      return NextResponse.json({ error: "Building has no website URL" }, { status: 400 });
    }

    // Handle image scraping separately since it has a different result shape
    if (scrapeType === "images") {
      const imageResult = await scrapeImagesOnly(building.website_url);

      if (!imageResult.success || !imageResult.data) {
        await updateScrapeStatus(supabase, buildingId, {
          type: "images",
          success: false,
          error: imageResult.error,
          websiteUrl: building.website_url,
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
        imageResult.data.building_images
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
        websiteUrl: building.website_url,
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

    // Perform scrape based on type (units/amenities/full)
    let result;
    if (scrapeType === "units") {
      result = await scrapeUnitsOnly(building.website_url);
    } else if (scrapeType === "amenities") {
      result = await scrapeAmenitiesOnly(building.website_url);
    } else {
      result = await scrapeFullBuilding(building.website_url);
    }

    if (!result.success || !result.data) {
      await updateScrapeStatus(supabase, buildingId, {
        type: scrapeType,
        success: false,
        error: result.error,
        websiteUrl: building.website_url,
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
        unitsResult = await saveScrapedUnits(supabase, buildingId, result.data.units);

        // Mark units not in scrape as unavailable
        const scrapedUnitNumbers = result.data.units
          .map((u) => u.unit_number)
          .filter((n): n is string => !!n);

        if (scrapedUnitNumbers.length > 0) {
          await markUnitsUnavailable(supabase, buildingId, scrapedUnitNumbers);
        }
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

    // Update scrape status
    await updateScrapeStatus(supabase, buildingId, {
      type: scrapeType,
      success: true,
      unitsFound: result.data.units.length,
      websiteUrl: building.website_url,
    });

    return NextResponse.json({
      success: true,
      building: { id: buildingId, name: building.name },
      results: {
        units_found: result.data.units.length,
        units_created: unitsResult.unitsCreated,
        units_updated: unitsResult.unitsUpdated,
        amenities_found: result.data.amenities.length,
        amenities_linked: amenitiesLinked,
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
