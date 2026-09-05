import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const maxDuration = 300;

/**
 * GET /api/cron/cleanup
 *
 * Called by Vercel Cron weekly. Runs the cleanup_old_data() RPC:
 * - unit_price_snapshots: deletes rows older than 180 days, always keeping
 *   each unit's latest snapshot so latest_unit_prices never loses a unit
 * - page_views / analytics_events / building_views: older than 180 days
 * - scrape_jobs: older than 90 days
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("cleanup_old_data");

  if (error) {
    console.error("Cleanup RPC error:", error);
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }

  return NextResponse.json({ message: "Cleanup complete", deleted: data });
}
