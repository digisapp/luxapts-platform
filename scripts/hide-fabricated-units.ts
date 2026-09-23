// Hide the fabricated units that render as real availability.
//
// Two generators invented inventory in January–February 2026, and those units
// have shown as "available" with invented rents ever since (audit 2026-09-22):
//
//   A. scripts/enhance-listings.ts — every building got the same six template
//      floorplans ("Studio", "A1 - One Bedroom", … "C1 - Three Bedroom") with
//      random sqft and rent.
//   B. /api/generate-units — a batch per building (12 in its final form,
//      7–10 in earlier runs), no floorplan, unit numbers from a formula
//      ("S218", "A529") across several S/A/B/C prefixes.
//
// Both rules also require that the scraper never priced the unit after the
// generators ran: a unit that has a real price capture is kept, whatever it
// looks like. This flips is_available to false rather than deleting, and
// writes the ids to a JSON file so --restore puts them back.
//
// Run with: npx tsx scripts/hide-fabricated-units.ts           (report only)
//           npx tsx scripts/hide-fabricated-units.ts --fix
//           npx tsx scripts/hide-fabricated-units.ts --restore <file.json>

import { config } from "dotenv";
import { resolve } from "path";
import { writeFileSync, readFileSync } from "fs";
config({ path: resolve(__dirname, "../.env.local") });

import { createClient, SupabaseClient } from "@supabase/supabase-js";

const TEMPLATE_FLOORPLANS = new Set([
  "Studio",
  "A1 - One Bedroom",
  "A2 - Large One Bedroom",
  "B1 - Two Bedroom",
  "B2 - Large Two Bedroom",
  "C1 - Three Bedroom",
]);
const GENERATED_UNIT_NUMBER = /^[SABC]\d{3}$/;
/** Smallest generator batch seen; real buildings don't number units S/A/B/C###. */
const MIN_GENERATED_BATCH = 7;
/** Both generators ran before this; anything priced after it was scraped. */
const GENERATORS_DONE = "2026-03-01T00:00:00Z";
const PAGE = 1000;
const CHUNK = 200;

interface UnitRow {
  id: string;
  building_id: string;
  floorplan_id: string | null;
  unit_number: string | null;
  is_available: boolean;
  created_at: string;
}

async function all<T>(
  supabase: SupabaseClient,
  table: string,
  select: string,
  orderBy = "id"
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .order(orderBy)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

async function setAvailability(supabase: SupabaseClient, ids: string[], value: boolean) {
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { error } = await supabase
      .from("units")
      .update({ is_available: value })
      .in("id", ids.slice(i, i + CHUNK));
    if (error) throw new Error(`update failed at ${i}: ${error.message}`);
  }
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const restoreIdx = process.argv.indexOf("--restore");
  if (restoreIdx !== -1) {
    const file = process.argv[restoreIdx + 1];
    const saved = JSON.parse(readFileSync(file, "utf8")) as { units: { id: string }[] };
    const ids = saved.units.map((u) => u.id);
    await setAvailability(supabase, ids, true);
    console.log(`Restored ${ids.length} units to available from ${file}`);
    return;
  }

  const [units, floorplans, latest, buildings] = await Promise.all([
    all<UnitRow>(supabase, "units", "id, building_id, floorplan_id, unit_number, is_available, created_at"),
    all<{ id: string; name: string | null }>(supabase, "floorplans", "id, name"),
    all<{ unit_id: string; captured_at: string }>(
      supabase,
      "latest_unit_prices",
      "unit_id, captured_at",
      "unit_id"
    ),
    all<{ id: string; name: string; status: string; cities: { name: string } | null }>(
      supabase,
      "buildings",
      "id, name, status, cities(name)"
    ),
  ]);

  const floorplanName = new Map(floorplans.map((f) => [f.id, f.name ?? ""]));
  const lastPriced = new Map(latest.map((p) => [p.unit_id, p.captured_at]));
  const building = new Map(buildings.map((b) => [b.id, b]));

  const neverRepriced = (u: UnitRow) => {
    const at = lastPriced.get(u.id);
    return !at || at < GENERATORS_DONE;
  };
  const generatorEra = (u: UnitRow) => u.created_at < GENERATORS_DONE;

  // Rule B looks at the building's whole batch of formula-numbered units,
  // available or not: a generator batch is several units spread over more
  // than one prefix.
  const batch = new Map<string, { count: number; prefixes: Set<string> }>();
  for (const u of units) {
    if (!u.floorplan_id && GENERATED_UNIT_NUMBER.test(u.unit_number ?? "")) {
      const b = batch.get(u.building_id) ?? { count: 0, prefixes: new Set<string>() };
      b.count++;
      b.prefixes.add(u.unit_number![0]);
      batch.set(u.building_id, b);
    }
  }
  const isGeneratorBatch = (buildingId: string) => {
    const b = batch.get(buildingId);
    return Boolean(b && b.count >= MIN_GENERATED_BATCH && b.prefixes.size >= 2);
  };

  const hidden: { id: string; rule: "template_floorplan" | "generated_batch"; building_id: string }[] = [];
  for (const u of units) {
    if (!u.is_available || !generatorEra(u) || !neverRepriced(u)) continue;
    if (u.floorplan_id && TEMPLATE_FLOORPLANS.has(floorplanName.get(u.floorplan_id) ?? "")) {
      hidden.push({ id: u.id, rule: "template_floorplan", building_id: u.building_id });
    } else if (
      !u.floorplan_id &&
      GENERATED_UNIT_NUMBER.test(u.unit_number ?? "") &&
      isGeneratorBatch(u.building_id)
    ) {
      hidden.push({ id: u.id, rule: "generated_batch", building_id: u.building_id });
    }
  }

  // Report.
  const availableBefore = units.filter((u) => u.is_available);
  const hiddenIds = new Set(hidden.map((h) => h.id));
  const byRule = hidden.reduce<Record<string, number>>((m, h) => ((m[h.rule] = (m[h.rule] ?? 0) + 1), m), {});
  console.log(`Available units: ${availableBefore.length}`);
  console.log(`Fabricated, to hide: ${hidden.length}`, byRule);

  const perCity = new Map<string, { before: number; after: number }>();
  const activeBuildingsEmptied: string[] = [];
  const availableByBuilding = new Map<string, { before: number; after: number }>();
  for (const u of availableBefore) {
    const b = building.get(u.building_id);
    if (!b || b.status !== "active") continue;
    const city = b.cities?.name ?? "?";
    const c = perCity.get(city) ?? { before: 0, after: 0 };
    const bb = availableByBuilding.get(b.id) ?? { before: 0, after: 0 };
    c.before++;
    bb.before++;
    if (!hiddenIds.has(u.id)) {
      c.after++;
      bb.after++;
    }
    perCity.set(city, c);
    availableByBuilding.set(b.id, bb);
  }
  for (const [id, n] of availableByBuilding) {
    if (n.before > 0 && n.after === 0) activeBuildingsEmptied.push(building.get(id)!.name);
  }
  console.log("\nActive-building availability by city (before -> after):");
  for (const [city, n] of [...perCity].sort((a, b) => b[1].before - a[1].before)) {
    console.log(`  ${city.padEnd(14)} ${String(n.before).padStart(5)} -> ${n.after}`);
  }
  console.log(`\nActive buildings left with no available units: ${activeBuildingsEmptied.length}`);

  if (!process.argv.includes("--fix")) {
    console.log("\nReport only. Re-run with --fix to hide them.");
    return;
  }

  const file = resolve(__dirname, `../hidden-fabricated-units-${Date.now()}.json`);
  writeFileSync(
    file,
    JSON.stringify({ hidden_at: new Date().toISOString(), rules: byRule, units: hidden }, null, 2)
  );
  console.log(`\nSaved ${hidden.length} ids to ${file}`);
  await setAvailability(
    supabase,
    hidden.map((h) => h.id),
    false
  );
  console.log(`Hid ${hidden.length} units. Undo: npx tsx scripts/hide-fabricated-units.ts --restore ${file}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
