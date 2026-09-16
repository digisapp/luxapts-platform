// Deactivate the synthetic buildings a seed/demo import left in production.
//
// The 2026-01-11 import created 128 combinatorial placeholders — "Lakeview
// Tower" at "884 Lakeview Street" with an out-of-state ZIP — that render as
// real listings, two whole cities' worth. They carry no website, no photo, no
// price and no user engagement.
//
// This flips `status` to 'inactive' rather than deleting: search, city pages
// and the sitemap all filter on status, so the listings disappear immediately
// while the rows stay recoverable.
//
// Run with: npx tsx scripts/deactivate-seed-buildings.ts [--fix]
//           npx tsx scripts/deactivate-seed-buildings.ts --restore <ids.json>

import { config } from "dotenv";
import { resolve } from "path";
import { writeFileSync, readFileSync } from "fs";
config({ path: resolve(__dirname, "../.env.local") });

import { createClient, SupabaseClient } from "@supabase/supabase-js";

interface BuildingRow {
  id: string;
  name: string;
  address_1: string | null;
  zip: string | null;
  website_url: string | null;
  status: string;
  city_id: string | null;
  created_at: string | null;
}

/**
 * A seeded placeholder address names a neighborhood where a street should be
 * ("941 East Street", "157 The Street"). Real addresses carry an ordinal
 * ("West 59th Street") or a genuine street name, and real buildings have a
 * website. Both conditions must hold.
 */
function looksSynthetic(b: BuildingRow): boolean {
  if (b.website_url) return false;
  const addr = String(b.address_1 ?? "");
  if (/\d(st|nd|rd|th)\b/i.test(addr)) return false;
  return /^\d+\s+[A-Za-z ]+\s+(Street|Avenue|Road|Boulevard|Blvd)$/.test(addr);
}

async function countFor(supabase: SupabaseClient, table: string, id: string): Promise<number> {
  const { count } = await supabase.from(table).select("*", { count: "exact", head: true }).eq("building_id", id);
  return count ?? 0;
}

async function main() {
  const fix = process.argv.includes("--fix");
  const restoreIdx = process.argv.indexOf("--restore");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  if (restoreIdx >= 0) {
    const ids: string[] = JSON.parse(readFileSync(process.argv[restoreIdx + 1], "utf8"));
    const { error } = await supabase.from("buildings").update({ status: "active" }).in("id", ids);
    if (error) throw new Error(error.message);
    console.log(`Restored ${ids.length} buildings to active.`);
    return;
  }

  const { data: buildings, error } = await supabase
    .from("buildings")
    .select("id, name, address_1, zip, website_url, status, city_id, created_at");
  if (error) throw new Error(error.message);

  const { data: cities } = await supabase.from("cities").select("id, slug");
  const citySlug = new Map((cities ?? []).map((c) => [c.id, c.slug]));

  const candidates = (buildings as BuildingRow[]).filter(looksSynthetic).filter((b) => b.status === "active");

  // Safety net: refuse to touch anything a real user has interacted with, or
  // that carries real data. If the pattern ever matches a genuine building,
  // this is what catches it.
  const safe: BuildingRow[] = [];
  const skipped: { b: BuildingRow; why: string }[] = [];
  for (const b of candidates) {
    const [images, leads, favs, views, showings] = await Promise.all([
      countFor(supabase, "building_images", b.id),
      countFor(supabase, "lead_targets", b.id),
      countFor(supabase, "user_favorites", b.id),
      countFor(supabase, "building_views", b.id),
      countFor(supabase, "showing_leads", b.id),
    ]);
    const engagement = leads + favs + views + showings;
    if (engagement > 0) skipped.push({ b, why: `has user engagement (${engagement})` });
    else if (images > 0) skipped.push({ b, why: `has ${images} photos` });
    else safe.push(b);
  }

  const byCity = safe.reduce<Record<string, number>>((acc, b) => {
    const slug = citySlug.get(b.city_id ?? "") ?? "unknown";
    acc[slug] = (acc[slug] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`${candidates.length} active buildings match the seeded-placeholder signature\n`);
  for (const [slug, n] of Object.entries(byCity).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${slug}`);
  }
  if (skipped.length) {
    console.log(`\nSkipped ${skipped.length} (not safe to touch):`);
    for (const s of skipped) console.log(`  ${s.b.name} — ${s.why}`);
  }

  let units = 0;
  for (const b of safe) units += await countFor(supabase, "units", b.id);
  console.log(`\nThese carry ${units} units currently shown as available.`);

  if (!fix) {
    console.log("\nDry run. Re-run with --fix to set them inactive.");
    return;
  }

  const ids = safe.map((b) => b.id);
  const backup = resolve(__dirname, `../deactivated-seed-buildings-${Date.now()}.json`);
  writeFileSync(backup, JSON.stringify(ids, null, 2));

  for (let i = 0; i < ids.length; i += 100) {
    const { error: upErr } = await supabase
      .from("buildings")
      .update({ status: "inactive" })
      .in("id", ids.slice(i, i + 100));
    if (upErr) throw new Error(upErr.message);
  }

  console.log(`\nSet ${ids.length} buildings to inactive.`);
  console.log(`Reversible with: npx tsx scripts/deactivate-seed-buildings.ts --restore ${backup}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
