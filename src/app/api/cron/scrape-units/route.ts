import { NextResponse } from "next/server";

// Serial multi-building scrape with AI extraction — needs the full window (default serverless timeout kills it mid-run, stranding jobs in "running")
export const maxDuration = 300;
import { createAdminClient } from "@/lib/supabase/server";
import { runUnitScrapeBatch } from "@/lib/scraper/run-units";

// Leave time after the last building for the final job update
const FINALIZE_HEADROOM_MS = 30_000;

// Manual/on-demand unit scrape. The scheduled scrape runs in GitHub Actions
// (.github/workflows/scrape-units.yml): Vercel has no headless browser, so
// JS-rendered leasing sites came back empty here, and an empty run still
// stamped them "scraped" — pushing them out of the renderer's queue.

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

    const results = await runUnitScrapeBatch(supabase, {
      cityId,
      limit: limitParam ? parseInt(limitParam) : 20,
      daysStale: daysStaleParam ? parseInt(daysStaleParam) : 7,
      timeBudgetMs: maxDuration * 1000 - FINALIZE_HEADROOM_MS,
    });

    if (results.buildings_checked === 0) {
      return NextResponse.json({ message: "No buildings need scraping", buildings_checked: 0 });
    }

    return NextResponse.json({
      message: "Unit scraping completed",
      job_id: results.job_id,
      results: {
        buildings_processed: results.processed,
        buildings_success: results.success,
        buildings_failed: results.failed,
        buildings_skipped_for_time: results.skipped_for_time,
        total_units_found: results.total_units_found,
        elapsed_ms: results.elapsed_ms,
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
