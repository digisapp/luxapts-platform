// Sync active MLS lease listings (IDX feed) for Staycio's Miami ZIP codes
// into mls_listings, matched to buildings by address. A full pull each run:
// listings the feed no longer returns as Active are marked inactive, so the
// site never shows an off-market unit for more than one sync interval.
// Run by .github/workflows/mls-sync.yml; exits quietly until the feed's
// credentials are configured (see src/lib/mls/reso.ts).
//
// Run with: npx tsx scripts/mls-sync.ts [--dry-run]

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") }); // no-op in CI (env comes from secrets)

import { createClient } from "@supabase/supabase-js";
import { fetchLeaseListings, resoConfigFromEnv, toListingRow, type MlsListingRow } from "../src/lib/mls/reso";
import { buildAddressIndex, matchListing } from "../src/lib/mls/match";

// Downtown/Park West, Brickell, Overtown, Edgewater/Midtown/Wynwood/Design
// District, MiMo, Miami Beach (South Beach, Mid-Beach, North Beach, Fisher).
const MIAMI_ZIPS = ["33128", "33129", "33130", "33131", "33132", "33136", "33127", "33137", "33138", "33139", "33140", "33141", "33109"];

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const cfg = resoConfigFromEnv();
  if (!cfg) {
    console.log("MLS feed not configured (MLS_PROVIDER and credentials); nothing to sync.");
    return;
  }
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const runStart = new Date().toISOString();
  const { data: run } = dryRun
    ? { data: null }
    : await supabase.from("mls_sync_runs").insert({ started_at: runStart }).select("id").single();

  try {
    // Every Miami building (rental or condo) is a match candidate
    const { data: city } = await supabase.from("cities").select("id").eq("slug", "miami").single();
    const { data: buildings, error: bErr } = await supabase
      .from("buildings")
      .select("id, address_1, zip, status")
      .eq("city_id", city!.id)
      .eq("status", "active");
    if (bErr) throw bErr;
    const ids = (buildings ?? []).map((b) => b.id);
    const { data: extra } = await supabase
      .from("building_facts")
      .select("building_id, value")
      .eq("key", "addresses")
      .in("building_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    const extraBy = new Map((extra ?? []).map((f) => [f.building_id, Array.isArray(f.value) ? (f.value as string[]) : []]));
    const index = buildAddressIndex((buildings ?? []).map((b) => ({ ...b, addresses: extraBy.get(b.id) ?? [] })));

    let fetched = 0;
    let matched = 0;
    let upserted = 0;
    const now = new Date().toISOString();
    for await (const page of fetchLeaseListings(cfg, MIAMI_ZIPS)) {
      const rows: (MlsListingRow & { building_id: string | null; last_seen_at: string })[] = page.map((p) => {
        const row = toListingRow(p);
        const building_id = matchListing(row, index);
        if (building_id) matched++;
        return { ...row, building_id, last_seen_at: now };
      });
      fetched += rows.length;
      if (!dryRun && rows.length) {
        const { error } = await supabase.from("mls_listings").upsert(rows, { onConflict: "listing_key" });
        if (error) throw error;
        upserted += rows.length;
      }
    }

    // Off market: active rows this full pull didn't return. Skipped when the
    // feed returned nothing at all, which is an outage, not an empty market.
    let deactivated = 0;
    if (!dryRun && fetched > 0) {
      const { data: gone, error } = await supabase
        .from("mls_listings")
        .update({ is_active: false, standard_status: "Off market" })
        .eq("is_active", true)
        .lt("last_seen_at", runStart)
        .select("listing_key");
      if (error) throw error;
      deactivated = gone?.length ?? 0;
    }

    console.log(`MLS sync: ${fetched} active lease listings, ${matched} matched to a building, ${deactivated} went off market${dryRun ? " (dry run)" : ""}`);
    if (run) {
      await supabase
        .from("mls_sync_runs")
        .update({ finished_at: new Date().toISOString(), ok: true, fetched, upserted, matched, deactivated })
        .eq("id", run.id);
    }
  } catch (e) {
    if (run) {
      await supabase
        .from("mls_sync_runs")
        .update({ finished_at: new Date().toISOString(), ok: false, error: String((e as Error).message).slice(0, 500) })
        .eq("id", run.id);
    }
    throw e;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
