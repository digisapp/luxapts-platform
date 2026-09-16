// What would paying for headless rendering actually buy us?
//
// Runs every sampled building twice: once as a plain HTTP fetch, once through
// the scraper's real path (which renders when the plain fetch looks like an
// empty shell). The delta between the two arms is the entire value of a
// rendering service — everything else is an extractor or bot-wall problem that
// a browser does not solve.
//
//   RENDER_RECOVERS  no units in plain HTML, units after rendering.
//                    ^ this bucket, and only this bucket, justifies the spend.
//   BOTH_HAVE_UNITS  units were already in the plain HTML. We are failing to
//                    extract inventory that was sitting there all along.
//   FETCH_FAIL       nothing came back either way — bot wall or dead URL.
//   NO_UNITS_EITHER  real page, real copy, no prices in either arm.
//
// Run with: npx tsx scripts/diagnose-scrape-gap.ts [sampleSize]

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });

import { createClient } from "@supabase/supabase-js";

const CONCURRENCY = 4;
const FETCH_TIMEOUT_MS = 15000;
// Same headers the scraper's own fetcher sends, so the control arm differs
// from the real path in exactly one variable: rendering.
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

type Bucket = "RENDER_RECOVERS" | "BOTH_HAVE_UNITS" | "FETCH_FAIL" | "NO_UNITS_EITHER";

async function plainFetch(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  }
}

async function main() {
  const { fetchBuildingHTML, findUnitsPage } = await import("../src/lib/scraper/fetcher");
  const { looksLikeUnitContent, unitSignalCount } = await import("../src/lib/scraper/renderer");

  const hasInventory = (html: string) => looksLikeUnitContent(html) && unitSignalCount(html) >= 3;

  const sampleSize = parseInt(process.argv[2] || "30", 10);
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: buildings } = await sb
    .from("buildings")
    .select("id, name, website_url")
    .eq("status", "active")
    .not("website_url", "is", null)
    .order("name");
  // Paged: a plain select caps at 1000 rows, which silently reported most of
  // the catalogue as having no units and invented a zero-yield population.
  const { fetchAllRows } = await import("../src/lib/db-helpers");
  const units = await fetchAllRows<{ building_id: string }>((from, to) =>
    sb.from("units").select("building_id").eq("is_available", true).order("building_id").range(from, to)
  );

  const withUnits = new Set(units.map((u) => u.building_id));
  const all = buildings ?? [];
  const zeroYield = all.filter((b) => !withUnits.has(b.id));

  console.log(`active + scrapeable : ${all.length}`);
  console.log(`ZERO units on record: ${zeroYield.length}\n`);

  // Evenly spaced through the alphabetical list rather than the first N, so one
  // management company's naming convention cannot dominate the sample.
  const step = Math.max(1, Math.floor(zeroYield.length / sampleSize));
  const sample = zeroYield.filter((_, i) => i % step === 0).slice(0, sampleSize);
  console.log(`sampling ${sample.length} of them, two arms each\n`);

  const results: { name: string; bucket: Bucket; plain: number; rendered: number }[] = [];
  let cursor = 0;

  async function worker() {
    while (cursor < sample.length) {
      const b = sample[cursor++];
      const url = b.website_url!;
      let plainBest = "";
      let renderedBest = "";

      try {
        // Arm A: plain fetch, homepage then the floorplans page it links to.
        plainBest = await plainFetch(url);
        if (plainBest && !hasInventory(plainBest)) {
          const unitsUrl = await findUnitsPage(url, plainBest).catch(() => null);
          if (unitsUrl) {
            const sub = await plainFetch(unitsUrl);
            if (unitSignalCount(sub) > unitSignalCount(plainBest)) plainBest = sub;
          }
        }

        // Arm B: the scraper's real path, which renders when it needs to.
        const main = await fetchBuildingHTML(url);
        renderedBest = main?.html ?? "";
        if (renderedBest && !hasInventory(renderedBest)) {
          const unitsUrl = await findUnitsPage(main!.finalUrl, renderedBest).catch(() => null);
          if (unitsUrl) {
            const sub = await fetchBuildingHTML(unitsUrl);
            if (sub?.html && unitSignalCount(sub.html) > unitSignalCount(renderedBest)) {
              renderedBest = sub.html;
            }
          }
        }
      } catch {
        // Fall through with whatever the arms managed to collect.
      }

      const plainHas = hasInventory(plainBest);
      const renderedHas = hasInventory(renderedBest);
      const bucket: Bucket = plainHas
        ? "BOTH_HAVE_UNITS"
        : renderedHas
          ? "RENDER_RECOVERS"
          : !plainBest && !renderedBest
            ? "FETCH_FAIL"
            : "NO_UNITS_EITHER";

      results.push({
        name: b.name,
        bucket,
        plain: unitSignalCount(plainBest),
        rendered: unitSignalCount(renderedBest),
      });
      process.stdout.write(".");
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log("\n");

  const order: Bucket[] = ["RENDER_RECOVERS", "BOTH_HAVE_UNITS", "FETCH_FAIL", "NO_UNITS_EITHER"];
  for (const bucket of order) {
    const rows = results.filter((r) => r.bucket === bucket);
    if (!rows.length) continue;
    console.log(`--- ${bucket} (${rows.length}) ---`);
    for (const r of rows) {
      console.log(`  ${r.name.slice(0, 40).padEnd(42)} plain=${String(r.plain).padStart(4)}  rendered=${String(r.rendered).padStart(4)}`);
    }
    console.log();
  }

  console.log("=== summary ===");
  for (const bucket of order) {
    const n = results.filter((r) => r.bucket === bucket).length;
    console.log(`${bucket.padEnd(17)} ${String(n).padStart(3)}  ${((n / results.length) * 100).toFixed(0).padStart(3)}%`);
  }

  const recovers = results.filter((r) => r.bucket === "RENDER_RECOVERS").length;
  const already = results.filter((r) => r.bucket === "BOTH_HAVE_UNITS").length;
  console.log(
    `\nRendering recovers ~${Math.round((recovers / results.length) * zeroYield.length)} of ${zeroYield.length} zero-yield buildings.`
  );
  console.log(
    `Extraction alone would recover ~${Math.round((already / results.length) * zeroYield.length)} — no rendering needed.`
  );
}

main();
