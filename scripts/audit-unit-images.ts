// Prune unit photos whose source is gone. Companion to audit-building-images.ts,
// which covers building_images only.
//
// Scraped unit photos are hotlinks to the building's own site. When the site
// deletes a photo, every unit page that shows it renders a broken image, and
// /_next/image waits on the origin before it can 404 — the page's loading
// indicator spun for 10-25s on CMPND unit pages (2026-09-25).
//
// Deliberately narrow: only a definite 404/410 or a soft 404 (a 200 that serves
// HTML instead of an image) counts as dead. 403s (often hotlink protection
// aimed at this machine, not at Vercel), rate limits, 5xx and timeouts are
// reported and left alone. Units sharing floorplan photos is normal, so there
// is no duplicate check here.
//
// Reports by default. With --fix it first writes every row it will delete to
// unit-images-pruned-<timestamp>.json (restore by re-inserting those rows),
// then deletes them and promotes a new primary photo where one was removed.
//
// Run with: npx tsx scripts/audit-unit-images.ts [--fix] [--limit N]

import { config } from "dotenv";
import { resolve } from "path";
import { writeFileSync } from "fs";
config({ path: resolve(__dirname, "../.env.local") });

import { createClient, SupabaseClient } from "@supabase/supabase-js";

const CONCURRENCY = 8;
const DEAD = (reason: string | undefined) =>
  reason === "http-404" || reason === "http-410" || reason === "not-an-image" || reason === "junk-url";

interface UnitImageRow {
  id: string;
  unit_id: string;
  url: string;
  alt_text: string | null;
  category: string | null;
  is_primary: boolean;
  sort_order: number;
  width: number | null;
  height: number | null;
  created_at: string;
}

async function fetchAll<T>(supabase: SupabaseClient, table: string, columns: string): Promise<T[]> {
  const out: T[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order("id", { ascending: true })
      .range(from, from + page - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < page) return out;
  }
}

async function main() {
  const fix = process.argv.includes("--fix");
  const limitArg = process.argv.indexOf("--limit");
  const limit = limitArg >= 0 ? parseInt(process.argv[limitArg + 1], 10) : Infinity;

  const { probeImage } = await import("../src/lib/images/quality");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const rows = await fetchAll<UnitImageRow>(
    supabase,
    "unit_images",
    "id, unit_id, url, alt_text, category, is_primary, sort_order, width, height, created_at",
  );
  const urls = [...new Set(rows.map((r) => r.url))].slice(0, limit);
  console.log(`Probing ${urls.length} distinct URLs behind ${rows.length} unit photos\n`);

  const verdict = new Map<string, string>();
  const leftAlone = new Map<string, number>();
  let cursor = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (cursor < urls.length) {
        const url = urls[cursor++];
        const probe = await probeImage(url);
        if (++done % 250 === 0) process.stderr.write(`  probed ${done}/${urls.length}\n`);
        if (probe.ok) continue;
        if (!probe.transient && DEAD(probe.reason)) verdict.set(url, probe.reason!);
        else {
          const key = (probe.reason ?? "unknown").replace(/: .*/, "");
          leftAlone.set(key, (leftAlone.get(key) ?? 0) + 1);
        }
      }
    }),
  );

  const dead = rows.filter((r) => verdict.has(r.url));
  const byReason = dead.reduce<Record<string, number>>((acc, r) => {
    const k = verdict.get(r.url)!;
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  const byHost = dead.reduce<Record<string, number>>((acc, r) => {
    const h = (() => { try { return new URL(r.url).host; } catch { return "(bad url)"; } })();
    acc[h] = (acc[h] ?? 0) + 1;
    return acc;
  }, {});

  console.log("=== Dead unit photos (will be deleted with --fix) ===");
  for (const [k, n] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}  ${k}`);
  console.log(`  ${String(dead.length).padStart(5)}  TOTAL rows (${verdict.size} distinct URLs) across ${new Set(dead.map((r) => r.unit_id)).size} units`);
  console.log("\n  by host:");
  for (const [h, n] of Object.entries(byHost).sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`  ${String(n).padStart(5)}  ${h}`);
  if (leftAlone.size) {
    console.log("\n=== Not usable right now but left alone (could be temporary or aimed at this machine) ===");
    for (const [k, n] of [...leftAlone].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}  ${k} (distinct URLs)`);
  }

  if (!fix) {
    console.log("\nDry run. Re-run with --fix to delete the dead rows (a JSON backup is written first).");
    return;
  }
  if (!dead.length) return;

  const backup = resolve(__dirname, `../unit-images-pruned-${Date.now()}.json`);
  writeFileSync(backup, JSON.stringify(dead, null, 2));
  console.log(`\nBacked up ${dead.length} rows to ${backup}`);

  const ids = dead.map((r) => r.id);
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await supabase.from("unit_images").delete().in("id", ids.slice(i, i + 200));
    if (error) throw new Error(`delete failed: ${error.message}`);
  }
  console.log(`Deleted ${ids.length} dead unit photos.`);

  // A unit whose primary photo was deleted but still has others needs a new
  // primary, or its cards fall back to the building photo.
  let repaired = 0;
  for (const unitId of new Set(dead.filter((r) => r.is_primary).map((r) => r.unit_id))) {
    const { data: remaining } = await supabase
      .from("unit_images")
      .select("id, is_primary")
      .eq("unit_id", unitId)
      .order("sort_order", { ascending: true });
    if (!remaining?.length || remaining.some((r) => r.is_primary)) continue;
    const { error } = await supabase.from("unit_images").update({ is_primary: true }).eq("id", remaining[0].id);
    if (!error) repaired++;
  }
  console.log(`Promoted a new primary photo for ${repaired} units.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
