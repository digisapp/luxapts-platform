import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

// Admin endpoint for viewing and managing scraping status

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const citySlug = url.searchParams.get("city");
    const status = url.searchParams.get("status"); // 'pending', 'success', 'failed'
    const limitParam = url.searchParams.get("limit");

    const limit = limitParam ? parseInt(limitParam) : 50;

    const supabase = createAdminClient();

    // Get scraping status with building info
    let query = supabase
      .from("buildings")
      .select(`
        id,
        name,
        website_url,
        status,
        cities:city_id (name, slug),
        neighborhoods:neighborhood_id (name, slug),
        building_scrape_status (
          scrape_enabled,
          amenities_scraped_at,
          amenities_scrape_success,
          amenities_scrape_error,
          units_scraped_at,
          units_scrape_success,
          units_scrape_error,
          units_found,
          updated_at
        )
      `)
      .eq("status", "active");

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

    const { data: buildings, error } = await query.limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Process and filter buildings
    const processed = (buildings || []).map((b) => {
      const scrapeStatus = b.building_scrape_status?.[0];
      const city = Array.isArray(b.cities) ? b.cities[0] : b.cities;
      const neighborhood = Array.isArray(b.neighborhoods) ? b.neighborhoods[0] : b.neighborhoods;

      let scrapeState = "never_scraped";
      if (scrapeStatus?.units_scraped_at) {
        if (scrapeStatus.units_scrape_success) {
          // Check if stale (older than 7 days)
          const daysSince = Math.floor(
            (Date.now() - new Date(scrapeStatus.units_scraped_at).getTime()) / (1000 * 60 * 60 * 24)
          );
          scrapeState = daysSince > 7 ? "stale" : "success";
        } else {
          scrapeState = "failed";
        }
      }

      return {
        id: b.id,
        name: b.name,
        website_url: b.website_url,
        city: city?.name,
        city_slug: city?.slug,
        neighborhood: neighborhood?.name,
        scrape_enabled: scrapeStatus?.scrape_enabled ?? true,
        scrape_state: scrapeState,
        amenities: {
          scraped_at: scrapeStatus?.amenities_scraped_at,
          success: scrapeStatus?.amenities_scrape_success,
          error: scrapeStatus?.amenities_scrape_error,
        },
        units: {
          scraped_at: scrapeStatus?.units_scraped_at,
          success: scrapeStatus?.units_scrape_success,
          error: scrapeStatus?.units_scrape_error,
          count: scrapeStatus?.units_found || 0,
        },
      };
    });

    // Filter by status if specified
    let filtered = processed;
    if (status === "pending") {
      filtered = processed.filter((b) => b.scrape_state === "never_scraped" || b.scrape_state === "stale");
    } else if (status === "success") {
      filtered = processed.filter((b) => b.scrape_state === "success");
    } else if (status === "failed") {
      filtered = processed.filter((b) => b.scrape_state === "failed");
    }

    // Get summary stats
    const summary = {
      total: processed.length,
      never_scraped: processed.filter((b) => b.scrape_state === "never_scraped").length,
      success: processed.filter((b) => b.scrape_state === "success").length,
      stale: processed.filter((b) => b.scrape_state === "stale").length,
      failed: processed.filter((b) => b.scrape_state === "failed").length,
      total_units: processed.reduce((sum, b) => sum + b.units.count, 0),
    };

    // Get recent scrape jobs
    const { data: recentJobs } = await supabase
      .from("scrape_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10);

    return NextResponse.json({
      summary,
      buildings: filtered,
      recent_jobs: recentJobs || [],
    });
  } catch (error) {
    console.error("Admin scrape GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST to trigger scraping for specific buildings or cities
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, building_ids, city_slug } = body;

    const supabase = createAdminClient();

    if (action === "enable" || action === "disable") {
      // Enable/disable scraping for buildings
      if (!building_ids?.length) {
        return NextResponse.json({ error: "building_ids required" }, { status: 400 });
      }

      const { error } = await supabase
        .from("building_scrape_status")
        .upsert(
          building_ids.map((id: string) => ({
            building_id: id,
            scrape_enabled: action === "enable",
          })),
          { onConflict: "building_id" }
        );

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: `Scraping ${action}d for ${building_ids.length} buildings`,
      });
    }

    if (action === "trigger") {
      // Trigger scraping - this just returns the endpoint to call
      // In a real implementation, you might queue this as a background job

      const scrapeType = body.type || "units"; // 'units', 'amenities', or 'full'

      if (building_ids?.length === 1) {
        // Single building - direct scrape
        return NextResponse.json({
          success: true,
          message: "Trigger scrape for single building",
          endpoint: `/api/scrape/building/${building_ids[0]}`,
          method: "POST",
          body: { type: scrapeType },
        });
      } else if (city_slug) {
        // City-wide scrape via cron endpoint
        const cronEndpoint = scrapeType === "amenities"
          ? `/api/cron/scrape-amenities?city=${city_slug}`
          : `/api/cron/scrape-units?city=${city_slug}`;

        return NextResponse.json({
          success: true,
          message: `Trigger ${scrapeType} scrape for city ${city_slug}`,
          endpoint: cronEndpoint,
          method: "GET",
        });
      }

      return NextResponse.json({ error: "Specify building_ids or city_slug" }, { status: 400 });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Admin scrape POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
