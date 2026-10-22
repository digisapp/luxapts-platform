// Tell Bing (via IndexNow) which staycio.com pages changed.
//
// Default: building pages whose rents or listings changed in the last
// --since-minutes (a new price snapshot or a newly listed unit), plus their
// city pages. Run after each unit scrape by .github/workflows/scrape-units.yml.
//
// --all: every URL in the live sitemap. For the first submission, or after a
// site-wide change.
//
// Run with: npx tsx scripts/indexnow-submit.ts [--since-minutes 180] [--all] [--dry-run]

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") }); // no-op in CI (env comes from secrets)

import { createClient } from "@supabase/supabase-js";
import { submitToIndexNow } from "../src/lib/seo/indexnow";
import { absoluteUrl, buildingPath, cityPath } from "../src/lib/seo/urls";

const IN_CHUNK = 150;

function numArg(name: string, fallback: number): number {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : parseInt(process.argv[i + 1], 10);
}

async function sitemapUrls(): Promise<string[]> {
  const res = await fetch("https://staycio.com/sitemap.xml");
  if (!res.ok) throw new Error(`sitemap.xml returned ${res.status}`);
  const xml = await res.text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}

async function changedUrls(sinceMinutes: number): Promise<string[]> {
  for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!process.env[key]) throw new Error(`${key} is not set`);
  }
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const since = new Date(Date.now() - sinceMinutes * 60_000).toISOString();

  const unitIds = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("unit_price_snapshots")
      .select("unit_id")
      .gte("captured_at", since)
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    for (const r of data) unitIds.add(r.unit_id);
    if (data.length < 1000) break;
  }

  const buildingIds = new Set<string>();
  const ids = [...unitIds];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error } = await supabase.from("units").select("building_id").in("id", ids.slice(i, i + IN_CHUNK));
    if (error) throw error;
    for (const r of data) buildingIds.add(r.building_id);
  }
  // Newly listed units change a page even when no price snapshot was taken
  const { data: newUnits, error: newErr } = await supabase
    .from("units")
    .select("building_id")
    .gte("created_at", since)
    .limit(5000);
  if (newErr) throw newErr;
  for (const r of newUnits ?? []) buildingIds.add(r.building_id);

  const bIds = [...buildingIds];
  const urls = new Set<string>();
  const cityIds = new Set<string>();
  for (let i = 0; i < bIds.length; i += IN_CHUNK) {
    const { data, error } = await supabase
      .from("buildings")
      .select("id, slug, city_id")
      .eq("status", "active")
      .in("id", bIds.slice(i, i + IN_CHUNK));
    if (error) throw error;
    for (const b of data) {
      urls.add(absoluteUrl(buildingPath(b)));
      if (b.city_id) cityIds.add(b.city_id);
    }
  }
  if (cityIds.size) {
    const { data, error } = await supabase.from("cities").select("slug").in("id", [...cityIds]);
    if (error) throw error;
    for (const c of data ?? []) urls.add(absoluteUrl(cityPath(c.slug)));
  }
  return [...urls];
}

async function main() {
  const all = process.argv.includes("--all");
  const dryRun = process.argv.includes("--dry-run");
  const sinceMinutes = numArg("--since-minutes", 180);

  const urls = all ? await sitemapUrls() : await changedUrls(sinceMinutes);
  console.log(`${urls.length} URL(s) to submit${all ? " (full sitemap)" : ` (changed in the last ${sinceMinutes} min)`}`);
  for (const u of urls.slice(0, 20)) console.log(`  ${u}`);
  if (urls.length > 20) console.log(`  … and ${urls.length - 20} more`);

  if (dryRun || urls.length === 0) return;

  const result = await submitToIndexNow(urls);
  if (result.error) {
    // Reported, not fatal: a failed ping must not fail the scrape workflow.
    console.error(`IndexNow rejected the submission (HTTP ${result.status}): ${result.error}`);
    return;
  }
  console.log(`IndexNow accepted ${result.submitted} URL(s) (HTTP ${result.status})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
