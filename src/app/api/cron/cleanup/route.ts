import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/db-helpers";
import { floorplanKey } from "@/lib/scraper/db";

export const maxDuration = 300;

/**
 * Retire duplicate floorplan-level units. Until the scraper keyed
 * number-less listings by (beds, baths, sqft), every nightly scrape inserted
 * a fresh "available" unit per floorplan and nothing retired the previous
 * night's copy (1,765 phantoms across 9 buildings by 2026-09-05). Keeps the
 * newest row per building+floorplan and marks the rest unavailable —
 * reversible, nothing is deleted.
 */
async function retireDuplicateFloorplanUnits(supabase: SupabaseClient): Promise<number> {
  const rows = await fetchAllRows<{
    id: string;
    building_id: string;
    beds: number | null;
    baths: number | null;
    sqft: number | null;
  }>((from, to) =>
    supabase
      .from("units")
      .select("id, building_id, beds, baths, sqft")
      .eq("is_available", true)
      .is("unit_number", null)
      .order("building_id")
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to)
  );

  const seen = new Set<string>();
  const retire: string[] = [];
  for (const u of rows) {
    const key = `${u.building_id}|${floorplanKey(u)}`;
    if (seen.has(key)) retire.push(u.id);
    else seen.add(key);
  }

  for (let i = 0; i < retire.length; i += 100) {
    const { error } = await supabase
      .from("units")
      .update({ is_available: false })
      .in("id", retire.slice(i, i + 100));
    if (error) console.error("Duplicate-unit retirement failed:", error.message);
  }
  return retire.length;
}

/**
 * GET /api/cron/cleanup
 *
 * Called by Vercel Cron weekly. Runs the cleanup_old_data() RPC:
 * - unit_price_snapshots: deletes rows older than 180 days, always keeping
 *   each unit's latest snapshot so latest_unit_prices never loses a unit
 * - page_views / analytics_events / building_views: older than 180 days
 * - scrape_jobs: older than 90 days
 * Then retires duplicate floorplan-level units (see above).
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

  const retiredDuplicateUnits = await retireDuplicateFloorplanUnits(supabase);

  return NextResponse.json({
    message: "Cleanup complete",
    deleted: data,
    retired_duplicate_units: retiredDuplicateUnits,
  });
}
