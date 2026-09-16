// Audit every stored listing photo and prune the ones that make a listing look
// wrong: site furniture (favicons, logos, share cards), dead hotlinks, assets
// too small to be photography, and photos claimed by more than one building.
//
// Covers both image sources: the building_images table, and the
// `image_exterior` fact, which the building page unshifts to the front of the
// gallery (making it the hero) and /api/browse serves to Stacy.
//
// Reports by default; pass --fix to delete the bad rows.
//
// Run with: npx tsx scripts/audit-building-images.ts [--fix] [--limit N]

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });

import { createClient, SupabaseClient } from "@supabase/supabase-js";

const CONCURRENCY = 12;

interface ImageRow {
  id: string;
  building_id: string;
  url: string;
  is_primary: boolean | null;
  sort_order: number | null;
}

interface BuildingRow {
  id: string;
  name: string;
  website_url: string | null;
  status: string;
}

type Verdict = { row: ImageRow; building: BuildingRow; reason: string };

async function fetchAll<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
): Promise<T[]> {
  const out: T[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order("id")
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

  const { probeImage, isPropertySpecificUrl, buildingFamilyKey } = await import("../src/lib/images/quality");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const buildings = await fetchAll<BuildingRow>(supabase, "buildings", "id, name, website_url, status");
  const byId = new Map(buildings.map((b) => [b.id, b]));
  const images = (await fetchAll<ImageRow>(
    supabase,
    "building_images",
    "id, building_id, url, is_primary, sort_order",
  )).slice(0, limit);

  console.log(`Auditing ${images.length} photos across ${new Set(images.map((i) => i.building_id)).size} buildings\n`);

  const bad: Verdict[] = [];

  // 1. Photos sourced from a management-company page rather than the property
  for (const row of images) {
    const b = byId.get(row.building_id);
    if (!b?.website_url) continue;
    if (!isPropertySpecificUrl(b.website_url, b.name)) {
      bad.push({ row, building: b, reason: "portfolio-site" });
    }
  }

  // 2. The same photo claimed by more than one building — keep the first, drop
  //    the rest, so no two listings render the same picture.
  const claims = new Map<string, ImageRow[]>();
  for (const row of images) {
    const list = claims.get(row.url) ?? [];
    list.push(row);
    claims.set(row.url, list);
  }
  const duplicateRecords = new Set<string>();
  for (const [, rows] of claims) {
    const buildingsForUrl = [...new Set(rows.map((r) => r.building_id))];
    if (buildingsForUrl.length < 2) continue;

    // The towers of one complex legitimately share a photo library, and so do
    // the two rows of a building that got entered twice. Only genuinely
    // different properties showing the same picture is a defect.
    const families = new Set(
      buildingsForUrl.map((id) => buildingFamilyKey(byId.get(id)?.name ?? id)),
    );
    if (families.size < 2) {
      if (buildingsForUrl.length > 1) buildingsForUrl.forEach((id) => duplicateRecords.add(id));
      continue;
    }

    for (const row of rows) {
      if (row.building_id === buildingsForUrl[0]) continue;
      const b = byId.get(row.building_id);
      if (b) bad.push({ row, building: b, reason: "shared-with-another-building" });
    }
  }

  // 3. Dead hotlinks, non-images and assets too small to be photography.
  const alreadyBad = new Set(bad.map((v) => v.row.id));
  const toProbe = images.filter((r) => !alreadyBad.has(r.id));
  let cursor = 0;
  let done = 0;
  let inconclusive = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (cursor < toProbe.length) {
        const row = toProbe[cursor++];
        const probe = await probeImage(row.url);
        if (++done % 200 === 0) process.stderr.write(`  probed ${done}/${toProbe.length}\n`);
        // A rate limit or a 5xx says nothing about the photo — leave it be.
        if (probe.ok || probe.transient) {
          if (probe.transient) inconclusive++;
          continue;
        }
        const b = byId.get(row.building_id);
        if (b) bad.push({ row, building: b, reason: probe.reason ?? "unusable" });
      }
    }),
  );

  const byReason = bad.reduce<Record<string, number>>((acc, v) => {
    const key = v.reason.replace(/\d+/g, "N");
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  console.log("\n=== Unusable photos ===");
  for (const [reason, n] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${reason}`);
  }
  console.log(`  ${String(bad.length).padStart(4)}  TOTAL (of ${images.length})`);
  if (inconclusive) console.log(`\n  ${inconclusive} photos could not be checked (rate limit / 5xx) and were left alone.`);

  // Buildings that lose their last photo — they fall back to a stock image, so
  // whoever fixes the data should see them by name.
  const badIds = new Set(bad.map((v) => v.row.id));
  const survivorsByBuilding = new Map<string, number>();
  for (const row of images) {
    if (badIds.has(row.id)) continue;
    survivorsByBuilding.set(row.building_id, (survivorsByBuilding.get(row.building_id) ?? 0) + 1);
  }
  const emptied = [...new Set(bad.map((v) => v.row.building_id))]
    .filter((id) => !survivorsByBuilding.has(id))
    .map((id) => byId.get(id))
    .filter((b): b is BuildingRow => Boolean(b) && b!.status === "active");

  console.log(`\n=== ${emptied.length} active buildings left with no photo at all ===`);
  for (const b of emptied) console.log(`  ${b.name.padEnd(34)} ${b.website_url ?? "(no website)"}`);

  // Not an image defect, but it surfaces here and it is why some buildings
  // appear twice in search with identical photos.
  const dupeNames = new Map<string, string[]>();
  for (const id of duplicateRecords) {
    const b = byId.get(id);
    if (!b || b.status !== "active") continue;
    const key = buildingFamilyKey(b.name);
    dupeNames.set(key, [...(dupeNames.get(key) ?? []), b.id]);
  }
  const realDupes = [...dupeNames].filter(([, ids]) => ids.length > 1);
  if (realDupes.length) {
    console.log(`\n=== ${realDupes.length} buildings entered more than once (photos left alone; merge the records) ===`);
    for (const [key, ids] of realDupes) {
      console.log(`  ${key}: ${ids.map((id) => byId.get(id)?.name).join(" / ")}`);
    }
  }

  // --- Second source: the `image_exterior` fact ---
  const { data: facts } = await supabase
    .from("building_facts")
    .select("building_id, key, value")
    .eq("key", "image_exterior");

  const badFacts: { building_id: string; value: string; reason: string }[] = [];
  await Promise.all(
    (facts ?? []).map(async (f) => {
      const url = String(f.value ?? "");
      if (!url) return;
      // Stock photography is no longer used for listings; a placeholder is honest.
      if (url.includes("unsplash.com")) {
        badFacts.push({ building_id: f.building_id, value: url, reason: "stock-photo" });
        return;
      }
      const probe = await probeImage(url);
      if (probe.ok || probe.transient) return;
      badFacts.push({ building_id: f.building_id, value: url, reason: probe.reason ?? "unusable" });
    }),
  );

  console.log(`\n=== image_exterior facts: ${badFacts.length} of ${facts?.length ?? 0} unusable ===`);
  const factReasons = badFacts.reduce<Record<string, number>>((acc, f) => {
    const key = f.reason.replace(/\d+/g, "N");
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  for (const [reason, n] of Object.entries(factReasons).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${reason}`);
  }

  if (!fix) {
    console.log("\nDry run. Re-run with --fix to delete these rows.");
    return;
  }

  const ids = [...badIds];
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await supabase.from("building_images").delete().in("id", ids.slice(i, i + 200));
    if (error) throw new Error(`delete failed: ${error.message}`);
  }
  console.log(`\nDeleted ${ids.length} photos.`);

  // Any building whose primary photo was deleted needs a new one, or the
  // listing falls back to a stock image while still holding real photos.
  let repaired = 0;
  for (const [buildingId] of survivorsByBuilding) {
    const { data: remaining } = await supabase
      .from("building_images")
      .select("id, is_primary, sort_order")
      .eq("building_id", buildingId)
      .order("sort_order", { ascending: true });
    if (!remaining?.length || remaining.some((r) => r.is_primary)) continue;
    await supabase.from("building_images").update({ is_primary: true }).eq("id", remaining[0].id);
    repaired++;
  }
  console.log(`Promoted a new primary photo for ${repaired} buildings.`);

  for (const f of badFacts) {
    const { error } = await supabase
      .from("building_facts")
      .delete()
      .eq("building_id", f.building_id)
      .eq("key", "image_exterior");
    if (error) console.error(`fact delete failed for ${f.building_id}: ${error.message}`);
  }
  console.log(`Deleted ${badFacts.length} unusable image_exterior facts.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
