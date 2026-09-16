// Merge buildings that were imported twice.
//
// The 2026-01-11 import re-created buildings that already existed from
// 2026-01-10, so eleven properties appear twice in search with the same photo.
// The later record generally carries more inventory (and floorplans); the
// earlier one carries the ZIP and a description. This keeps the richer record,
// moves anything worth keeping onto it, and deactivates the other.
//
// Nothing is deleted: the loser is set to 'inactive', which is what search,
// the sitemap and the city pages filter on.
//
// Run with: npx tsx scripts/merge-duplicate-buildings.ts [--fix]
//           npx tsx scripts/merge-duplicate-buildings.ts --restore <ids.json>

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
  lat: number | null;
  lng: number | null;
  website_url: string | null;
  status: string;
  city_id: string | null;
  description: string | null;
  year_built: number | null;
  created_at: string | null;
}

const ORDINALS: Record<string, string> = {
  first: "1st", second: "2nd", third: "3rd", fourth: "4th", fifth: "5th",
  sixth: "6th", seventh: "7th", eighth: "8th", ninth: "9th", tenth: "10th",
};

/** "9 DeKalb Ave" and "9 DeKalb Avenue" are one address. */
function normalizeAddress(a: string | null): string {
  let s = String(a ?? "").toLowerCase().replace(/[.,]/g, "");
  s = s
    .replace(/\b(avenue|ave)\b/g, "ave")
    .replace(/\b(street|st)\b/g, "st")
    .replace(/\b(boulevard|blvd)\b/g, "blvd")
    .replace(/\b(place|pl)\b/g, "pl")
    .replace(/\b(drive|dr)\b/g, "dr")
    .replace(/\b(road|rd)\b/g, "rd");
  for (const [word, digit] of Object.entries(ORDINALS)) {
    s = s.replace(new RegExp(`\\b${word}\\b`, "g"), digit);
  }
  return s.replace(/\s+/g, " ").trim();
}

const normalizeName = (n: string) =>
  n.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

function host(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

async function countFor(supabase: SupabaseClient, table: string, id: string, extra?: [string, unknown]) {
  let q = supabase.from(table).select("*", { count: "exact", head: true }).eq("building_id", id);
  if (extra) q = q.eq(extra[0], extra[1]);
  const { count } = await q;
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

  const { data, error } = await supabase
    .from("buildings")
    .select("id, name, address_1, zip, lat, lng, website_url, status, city_id, description, year_built, created_at")
    .eq("status", "active");
  if (error) throw new Error(error.message);
  const buildings = data as BuildingRow[];

  // Grouped by name alone, then confirmed by a matching address or a shared
  // website — the two imports disagreed about which city these are in (the
  // 2026-01-10 run filed Brooklyn buildings under New York), so keying on
  // city_id would miss every pair. Two unrelated buildings sharing both a name
  // and a website does not happen. Distinct towers of one complex
  // (One/Two/Three Waterline Square) have different names and never group.
  const groups = new Map<string, BuildingRow[]>();
  for (const b of buildings) {
    const key = normalizeName(b.name);
    groups.set(key, [...(groups.get(key) ?? []), b]);
  }

  /**
   * Where two records share a name but neither the address nor the host match,
   * follow the redirects: a property that rebranded keeps the old domain
   * pointing at the new one (thedupontgreenpoint.com -> thedupontbk.com), which
   * is proof the two rows are the same building.
   */
  async function resolvedHost(url: string | null): Promise<string | null> {
    if (!url) return null;
    try {
      const res = await fetch(url, {
        method: "HEAD",
        redirect: "follow",
        headers: { "user-agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(15_000),
      });
      return host(res.url) ?? host(url);
    } catch {
      return host(url);
    }
  }

  const dupes: BuildingRow[][] = [];
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const sameAddress = new Set(g.map((b) => normalizeAddress(b.address_1))).size === 1;
    const sameHost = new Set(g.map((b) => host(b.website_url))).size === 1 && host(g[0].website_url) !== null;
    if (sameAddress || sameHost) {
      dupes.push(g);
      continue;
    }
    const resolved = await Promise.all(g.map((b) => resolvedHost(b.website_url)));
    if (resolved.every((h) => h !== null) && new Set(resolved).size === 1) {
      console.log(`  (matched "${g[0].name}" by redirect -> ${resolved[0]})`);
      dupes.push(g);
    }
  }

  console.log(`${dupes.length} duplicate groups\n`);

  const deactivated: string[] = [];

  for (const group of dupes) {
    const scored = await Promise.all(
      group.map(async (b) => ({
        b,
        available: await countFor(supabase, "units", b.id, ["is_available", true]),
        units: await countFor(supabase, "units", b.id),
        images: await countFor(supabase, "building_images", b.id),
        engagement:
          (await countFor(supabase, "user_favorites", b.id)) +
          (await countFor(supabase, "lead_targets", b.id)) +
          (await countFor(supabase, "showing_leads", b.id)),
      })),
    );

    // Anything a real user has touched wins outright; otherwise the record
    // with the most live inventory is the one worth keeping.
    scored.sort((x, y) =>
      y.engagement - x.engagement ||
      y.available - x.available ||
      y.units - x.units ||
      (y.b.description ? 1 : 0) - (x.b.description ? 1 : 0),
    );

    const [keep, ...drop] = scored;
    console.log(`### ${keep.b.name}`);
    console.log(`  KEEP   ${keep.b.id.slice(0, 8)} "${keep.b.address_1}" ${keep.available} avail, ${keep.units} units, ${keep.images} photos`);
    for (const d of drop) {
      console.log(`  DROP   ${d.b.id.slice(0, 8)} "${d.b.address_1}" ${d.available} avail, ${d.units} units, ${d.images} photos`);
    }

    // Fields the survivor is missing that the other record has.
    const patch: Record<string, unknown> = {};
    for (const field of ["zip", "description", "year_built", "lat", "lng", "website_url"] as const) {
      if (keep.b[field] == null) {
        const donor = drop.find((d) => d.b[field] != null);
        if (donor) patch[field] = donor.b[field];
      }
    }
    if (Object.keys(patch).length) {
      console.log(`  backfill onto survivor: ${Object.keys(patch).join(", ")}`);
    }

    // Photos the survivor does not already have.
    const { data: keepImgs } = await supabase.from("building_images").select("url").eq("building_id", keep.b.id);
    const have = new Set((keepImgs ?? []).map((r) => r.url));
    const moveIds: string[] = [];
    for (const d of drop) {
      const { data: imgs } = await supabase.from("building_images").select("id, url").eq("building_id", d.b.id);
      for (const img of imgs ?? []) {
        if (have.has(img.url)) continue;
        have.add(img.url);
        moveIds.push(img.id);
      }
    }
    if (moveIds.length) console.log(`  move ${moveIds.length} photos to the survivor`);

    if (fix) {
      if (Object.keys(patch).length) {
        const { error: pErr } = await supabase.from("buildings").update(patch).eq("id", keep.b.id);
        if (pErr) console.error(`  backfill failed: ${pErr.message}`);
      }
      if (moveIds.length) {
        // is_primary is per-building; the survivor already has its own.
        const { error: mErr } = await supabase
          .from("building_images")
          .update({ building_id: keep.b.id, is_primary: false })
          .in("id", moveIds);
        if (mErr) console.error(`  photo move failed: ${mErr.message}`);
      }
      for (const d of drop) {
        const { error: dErr } = await supabase
          .from("buildings")
          .update({ status: "inactive" })
          .eq("id", d.b.id);
        if (dErr) console.error(`  deactivate failed: ${dErr.message}`);
        else deactivated.push(d.b.id);
      }
    }
    console.log();
  }

  if (!fix) {
    console.log("Dry run. Re-run with --fix to apply.");
    return;
  }

  const backup = resolve(__dirname, `../merged-duplicate-buildings-${Date.now()}.json`);
  writeFileSync(backup, JSON.stringify(deactivated, null, 2));
  console.log(`Deactivated ${deactivated.length} duplicate records.`);
  console.log(`Reversible with: npx tsx scripts/merge-duplicate-buildings.ts --restore ${backup}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
