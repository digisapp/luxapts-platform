import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import {
  scrapeUnitsOnly,
  scrapeAmenitiesOnly,
  scrapeFullBuilding,
  updateScrapeStatus,
  saveScrapedUnits,
  saveScrapedAmenities,
  markUnitsUnavailable,
} from "@/lib/scraper";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: Request, context: RouteContext) {
  try {
    const { id: buildingId } = await context.params;
    const body = await req.json().catch(() => ({}));
    const scrapeType = (body.type as "units" | "amenities" | "full") || "full";

    // Verify admin access or cron secret
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    const supabase = createAdminClient();

    // Check if request is from cron or admin
    const isAuthorized = cronSecret && authHeader === `Bearer ${cronSecret}`;

    if (!isAuthorized) {
      // Check if user is admin
      // For now, allow all requests (you can add auth check here)
      // const { data: { user } } = await supabase.auth.getUser();
      // if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    // Perform scrape based on type
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
