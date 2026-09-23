// Re-scrape buildings that have never yielded units, using the headless
// renderer for JS-heavy leasing sites (runs locally via Playwright).
//
// Run with: npx tsx scripts/rescrape-empty.ts [limit]
//           npx tsx scripts/rescrape-empty.ts --names <file>   (one building name per line)
// Example:  npx tsx scripts/rescrape-empty.ts 15

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });

import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

async function main() {
  // Import after env is loaded so lib modules see the keys
  const {
    scrapeUnitsOnly,
    saveScrapedUnits,
    markUnitsUnavailable,
    updateScrapeStatus,
    shouldRetireUnseenUnits,
    normalizeUnitNumber,
  } = await import("../src/lib/scraper");

  const namesIdx = process.argv.indexOf("--names");
  const onlyNames =
    namesIdx !== -1
      ? new Set(
          readFileSync(process.argv[namesIdx + 1], "utf8")
            .split("\n")
            .map((n) => n.trim())
            .filter(Boolean)
        )
      : null;
  const limit = onlyNames ? 1000 : parseInt(process.argv[2] || "15", 10);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Buildings whose unit scrapes never succeeded or found nothing
  const { data: rows, error } = await supabase
    .from("building_scrape_status")
    .select("building_id, website_url, units_found, units_scrape_success, buildings:building_id (id, name, status)")
    .not("website_url", "is", null)
    .or("units_found.eq.0,units_found.is.null")
    .limit(limit);

  if (error) {
    console.error("Query failed:", error);
    process.exit(1);
  }

  const targets = (rows || []).filter((r) => {
    const b = Array.isArray(r.buildings) ? r.buildings[0] : r.buildings;
    return b && b.status === "active" && (!onlyNames || onlyNames.has(b.name));
  });

  console.log(`Re-scraping ${targets.length} zero-unit buildings (limit ${limit})\n`);

  let success = 0;
  let failed = 0;
  let totalUnits = 0;

  for (const row of targets) {
    const b = Array.isArray(row.buildings) ? row.buildings[0] : row.buildings;
    if (!b) continue;
    const label = `${b.name}`.padEnd(36);

    try {
      const result = await scrapeUnitsOnly(row.website_url!);

      if (result.success && result.data && result.data.units.length > 0) {
        const saved = await saveScrapedUnits(supabase, b.id, result.data.units);

        // markUnitsUnavailable takes unit UUIDs. Passing the scraped unit
        // NUMBERS meant nothing matched, so every unit this script had just
        // saved was immediately retired. Same guard as the cron: a
        // floorplan-level or bot-walled result is not evidence of an empty
        // building.
        const scrapedNumbered = result.data.units.filter(
          (u) => normalizeUnitNumber(u.unit_number) !== null
        ).length;

        if (
          shouldRetireUnseenUnits({
            unitsPageFetchFailed: result.units_page_fetch_failed,
            scrapedNumbered,
            existingNumberedAvailable: saved.existingNumberedAvailable,
          })
        ) {
          await markUnitsUnavailable(supabase, b.id, saved.seenUnitIds);
        }
        await updateScrapeStatus(supabase, b.id, {
          type: "units",
          success: true,
          unitsFound: result.data.units.length,
          websiteUrl: row.website_url!,
        });
        success++;
        totalUnits += result.data.units.length;
        console.log(`  OK    ${label} ${result.data.units.length} units`);
      } else {
        await updateScrapeStatus(supabase, b.id, {
          type: "units",
          success: false,
          error: result.error || "No units extracted",
          websiteUrl: row.website_url!,
        });
        failed++;
        console.log(`  MISS  ${label} ${result.error || "no units extracted"}`);
      }
    } catch (err) {
      failed++;
      console.log(`  FAIL  ${label} ${err instanceof Error ? err.message : err}`);
    }

    // Be respectful between domains
    await new Promise((r) => setTimeout(r, 3000));
  }

  console.log(`\nDone: ${success} buildings gained units (${totalUnits} total), ${failed} still empty.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
