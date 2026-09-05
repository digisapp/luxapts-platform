import { describe, it, expect } from "vitest";
import { saveScrapedUnits, markUnitsUnavailable } from "../scraper/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScrapedUnit } from "../scraper/types";

// Minimal recording mock of the supabase query builder used by saveScrapedUnits:
// - units_with_latest_price select → the existing rows
// - units insert → new ids
// - units update / unit_price_snapshots insert → recorded
function mockDb(existing: Array<Record<string, unknown>>) {
  const log = { inserts: [] as Record<string, unknown>[], updates: [] as { id: string; patch: Record<string, unknown> }[], snapshots: [] as Record<string, unknown>[], retired: [] as string[] };
  let nextId = 100;
  const from = (table: string) => {
    if (table === "units_with_latest_price") {
      const b = { select: () => b, eq: () => b, order: () => Promise.resolve({ data: existing, error: null }) };
      return b;
    }
    if (table === "unit_price_snapshots") {
      return { insert: (rows: Record<string, unknown>[]) => { log.snapshots.push(...rows); return Promise.resolve({ error: null }); } };
    }
    if (table === "units") {
      return {
        insert: (row: Record<string, unknown>) => {
          log.inserts.push(row);
          const id = `new-${nextId++}`;
          return { select: () => ({ single: () => Promise.resolve({ data: { id }, error: null }) }) };
        },
        update: (patch: Record<string, unknown>) => ({
          eq: (_col: string, id: string) => { log.updates.push({ id, patch }); return Promise.resolve({ error: null }); },
          in: (_col: string, ids: string[]) => { log.retired.push(...ids); return Promise.resolve({ error: null }); },
        }),
        select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: existing.filter((u) => u.is_available !== false).map((u) => ({ id: u.id })), error: null }) }) }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  };
  return { client: { from } as unknown as SupabaseClient, log };
}

const fp = (beds: number, baths: number, sqft: number, rent: number): ScrapedUnit => ({ beds, baths, sqft, rent });

describe("saveScrapedUnits — floorplan-level listings (no unit number)", () => {
  it("matches an existing floorplan row instead of inserting a duplicate every night", async () => {
    const { client, log } = mockDb([
      { id: "u1", unit_number: null, beds: 1, baths: 1, sqft: 823, latest_rent: 2151, created_at: "2026-09-04" },
    ]);
    const res = await saveScrapedUnits(client, "b1", [fp(1, 1, 823, 2151)]);
    expect(res).toEqual({ unitsCreated: 0, unitsUpdated: 1, seenUnitIds: ["u1"] });
    expect(log.inserts).toHaveLength(0);
    expect(log.snapshots).toHaveLength(0); // unchanged rent → no snapshot
  });

  it("collapses pre-existing duplicates onto the newest row and snapshots a rent change", async () => {
    const { client, log } = mockDb([
      { id: "newest", unit_number: null, beds: 2, baths: 2, sqft: 1100, latest_rent: 3400, created_at: "2026-09-04" },
      { id: "older", unit_number: null, beds: 2, baths: 2, sqft: 1100, latest_rent: 3400, created_at: "2026-09-03" },
    ]);
    const res = await saveScrapedUnits(client, "b1", [fp(2, 2, 1100, 3500)]);
    expect(res.seenUnitIds).toEqual(["newest"]);
    expect(log.snapshots).toEqual([{ unit_id: "newest", rent: 3500, lease_term_months: null, source_id: undefined }]);
  });

  it("ignores a floorplan the extractor listed twice and inserts genuinely new ones once", async () => {
    const { client, log } = mockDb([]);
    const res = await saveScrapedUnits(client, "b1", [fp(0, 1, 500, 1900), fp(0, 1, 500, 1900), fp(1, 1, 700, 2400)]);
    expect(res.unitsCreated).toBe(2);
    expect(log.inserts).toHaveLength(2);
    expect(res.seenUnitIds).toHaveLength(2);
  });

  it("still keys numbered units by unit number", async () => {
    const { client, log } = mockDb([
      { id: "n12a", unit_number: "12A", beds: 1, baths: 1, sqft: 700, latest_rent: 2900, created_at: "2026-09-01" },
    ]);
    const res = await saveScrapedUnits(client, "b1", [{ unit_number: "12A", beds: 1, baths: 1, sqft: 705, rent: 2950 }]);
    expect(res.seenUnitIds).toEqual(["n12a"]);
    expect(log.updates[0]).toMatchObject({ id: "n12a", patch: { sqft: 705, is_available: true } });
  });
});

describe("markUnitsUnavailable", () => {
  it("retires every available unit the scrape did not see, in id chunks", async () => {
    const existing = Array.from({ length: 150 }, (_, i) => ({ id: `u${i}`, is_available: true }));
    const { client, log } = mockDb(existing);
    await markUnitsUnavailable(client, "b1", ["u0", "u1"]);
    expect(log.retired).toHaveLength(148);
    expect(log.retired).not.toContain("u0");
  });

  it("never retires anything when the scrape saw no units", async () => {
    const { client, log } = mockDb([{ id: "u0", is_available: true }]);
    await markUnitsUnavailable(client, "b1", []);
    expect(log.retired).toHaveLength(0);
  });
});
