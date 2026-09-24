// Scheduled unit scrape with a real browser (Playwright). Run by
// .github/workflows/scrape-units.yml; also works locally.
//
// Vercel has no headless browser, so JS-rendered leasing sites (Entrata,
// RentCafe, SightMap…) came back empty from the Vercel cron and their prices
// aged past the 45-day verified window. This runs the same batch logic with
// rendering available.
//
// Run with: npx tsx scripts/scrape-units-batch.ts [--limit N] [--minutes M] [--days-stale D]

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") }); // no-op in CI (env comes from secrets)

import { createClient } from "@supabase/supabase-js";

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : parseInt(process.argv[i + 1], 10);
}

async function main() {
  const { runUnitScrapeBatch } = await import("../src/lib/scraper/run-units");

  for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "XAI_API_KEY"]) {
    if (!process.env[key]) throw new Error(`${key} is not set`);
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const results = await runUnitScrapeBatch(supabase, {
    limit: arg("--limit", 60),
    daysStale: arg("--days-stale", 3),
    timeBudgetMs: arg("--minutes", 50) * 60_000,
    // Rendering plus the settle loop is slower than a plain fetch
    perBuildingTimeoutMs: 180_000,
    log: (line) => console.log(line),
  });

  console.log(
    `\nProcessed ${results.processed}/${results.buildings_checked}: ${results.success} ok, ` +
      `${results.failed} failed, ${results.total_units_found} units, ` +
      `${results.skipped_for_time} left for next run (${Math.round(results.elapsed_ms / 60000)} min)`
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
