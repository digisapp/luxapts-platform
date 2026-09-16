import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared unit writer for every city importer.
 *
 * `upsert(..., { onConflict: "building_id,unit_number" })` could never work
 * here: the only unique index on that pair is PARTIAL
 * (`WHERE unit_number IS NOT NULL`, migration 017), and PostgREST's ON
 * CONFLICT clause cannot target a partial index. Postgres answered every
 * import with 42P10 ("no unique or exclusion constraint matching the ON
 * CONFLICT specification"), and because the importers discarded the error and
 * only checked `data`, each run reported success while creating no units and
 * no price snapshots at all.
 *
 * Select-then-insert-or-update does the same job against the real schema.
 */

export interface ImportUnitInput {
  building_id: string;
  unit_number: string;
  floorplan_id?: string | null;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  is_available?: boolean;
  available_on?: string | null;
}

/** units.available_on is a DATE column; anything else is a 22007. */
function normalizeAvailableOn(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function toInt(value: number | null | undefined): number | null {
  return value == null || !Number.isFinite(value) ? null : Math.round(value);
}

export interface UpsertUnitResult {
  id: string | null;
  created: boolean;
  error?: string;
}

/** Create or update one unit, keyed on (building_id, unit_number). */
export async function upsertImportedUnit(
  supabase: SupabaseClient,
  input: ImportUnitInput,
): Promise<UpsertUnitResult> {
  const unitNumber = String(input.unit_number ?? "").trim();
  if (!unitNumber) return { id: null, created: false, error: "Missing unit_number" };

  const payload = {
    floorplan_id: input.floorplan_id ?? null,
    beds: toInt(input.beds),
    baths: input.baths ?? null,
    sqft: toInt(input.sqft),
    is_available: input.is_available ?? true,
    available_on: normalizeAvailableOn(input.available_on),
  };

  const { data: existing } = await supabase
    .from("units")
    .select("id")
    .eq("building_id", input.building_id)
    .eq("unit_number", unitNumber)
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase.from("units").update(payload).eq("id", existing.id);
    return { id: existing.id, created: false, error: error?.message };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("units")
    .insert({ building_id: input.building_id, unit_number: unitNumber, ...payload })
    .select("id")
    .single();

  if (inserted?.id) return { id: inserted.id, created: true };

  // Lost a race against a concurrent import — adopt the row that won.
  if (insertError?.code === "23505") {
    const { data: raced } = await supabase
      .from("units")
      .select("id")
      .eq("building_id", input.building_id)
      .eq("unit_number", unitNumber)
      .limit(1)
      .maybeSingle();

    if (raced?.id) {
      await supabase.from("units").update(payload).eq("id", raced.id);
      return { id: raced.id, created: false };
    }
  }

  return { id: null, created: false, error: insertError?.message ?? "Unit insert failed" };
}

/**
 * Create or update a unit and record its rent. Returns whether a price
 * snapshot was written (what the importers count as "units_created").
 */
export async function upsertImportedUnitWithPrice(
  supabase: SupabaseClient,
  input: ImportUnitInput & { rent?: number | null },
): Promise<{ id: string | null; priced: boolean; error?: string }> {
  const result = await upsertImportedUnit(supabase, input);
  if (!result.id) return { id: null, priced: false, error: result.error };

  const rent = toInt(input.rent);
  if (!rent) return { id: result.id, priced: false, error: result.error };

  const { error } = await supabase.from("unit_price_snapshots").insert({
    unit_id: result.id,
    rent,
    captured_at: new Date().toISOString(),
  });

  if (error) {
    console.error(`Price snapshot failed for unit ${result.id}:`, error.message);
    return { id: result.id, priced: false, error: error.message };
  }

  return { id: result.id, priced: true };
}
