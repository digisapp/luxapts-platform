import { describe, it, expect } from "vitest";
import { saveScrapedUnits, markUnitsUnavailable, retireUnseenUnits } from "../scraper/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScrapedUnit } from "../scraper/types";

// Minimal recording mock of the supabase query builder used by saveScrapedUnits:
// - units_with_latest_price select → the existing rows (paged via .range)
// - floorplans select/insert     → plan-name resolution
// - units insert                 → new ids (optionally a 23505 conflict)
// - units update / unit_price_snapshots insert → recorded
interface MockOptions {
  /** Pre-existing floorplans for the building. */
  floorplans?: { id: string; name: string }[];
  /** Unit numbers whose INSERT should fail with a unique-violation. */
  conflictOn?: string[];
  /** unit_number → id of the row a conflicting insert should resolve to. */
  conflictRows?: Record<string, string>;
  /** Make the batch snapshot insert fail so the per-row fallback runs. */
  failSnapshotBatch?: boolean;
}

function mockDb(existing: Array<Record<string, unknown>>, options: MockOptions = {}) {
  const log = {
    inserts: [] as Record<string, unknown>[],
    updates: [] as { id: string; patch: Record<string, unknown> }[],
    snapshots: [] as Record<string, unknown>[],
    snapshotBatches: 0,
    retired: [] as string[],
    floorplanInserts: [] as Record<string, unknown>[],
    /** The updated_at cutoff markUnitsUnavailable filtered on, if any. */
    unseenBefore: null as string | null,
  };

  let nextId = 100;
  let nextPlanId = 1;
  const floorplans = [...(options.floorplans ?? [])];
  const conflictOn = new Set(options.conflictOn ?? []);

  // Filter/order methods all return the builder; the terminal method resolves.
  const CHAINABLE = ["select", "eq", "is", "in", "not", "order", "limit", "gte", "lte", "gt"];
  function chain(terminals: Record<string, unknown>) {
    const b: Record<string, unknown> = {};
    for (const m of CHAINABLE) b[m] = () => b;
    Object.assign(b, terminals);
    return b;
  }

  /** A paged read: first .range() call returns everything, the next returns []. */
  function pagedRead(rows: unknown[]) {
    return chain({
      range: (from: number, to: number) =>
        Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
    });
  }

  const from = (table: string) => {
    if (table === "units_with_latest_price") {
      return pagedRead(existing);
    }

    if (table === "floorplans") {
      return {
        ...pagedRead(floorplans),
        insert: (row: Record<string, unknown>) => {
          log.floorplanInserts.push(row);
          const id = `plan-${nextPlanId++}`;
          floorplans.push({ id, name: String(row.name) });
          return { select: () => ({ single: () => Promise.resolve({ data: { id }, error: null }) }) };
        },
      };
    }

    if (table === "unit_price_snapshots") {
      return {
        insert: (rows: Record<string, unknown> | Record<string, unknown>[]) => {
          if (Array.isArray(rows)) {
            log.snapshotBatches++;
            if (options.failSnapshotBatch) {
              return Promise.resolve({ error: { message: "batch rejected", code: "23503" } });
            }
            log.snapshots.push(...rows);
          } else {
            log.snapshots.push(rows);
          }
          return Promise.resolve({ error: null });
        },
      };
    }

    if (table === "units") {
      return {
        insert: (row: Record<string, unknown>) => {
          const number = row.unit_number == null ? null : String(row.unit_number);
          if (number !== null && conflictOn.has(number)) {
            return {
              select: () => ({
                single: () =>
                  Promise.resolve({ data: null, error: { code: "23505", message: "duplicate key" } }),
              }),
            };
          }
          log.inserts.push(row);
          const id = `new-${nextId++}`;
          return { select: () => ({ single: () => Promise.resolve({ data: { id }, error: null }) }) };
        },
        update: (patch: Record<string, unknown>) => ({
          eq: (_col: string, id: string) => {
            log.updates.push({ id, patch });
            return Promise.resolve({ error: null });
          },
          in: (_col: string, ids: string[]) => {
            log.retired.push(...ids);
            return Promise.resolve({ error: null });
          },
        }),
        // markUnitsUnavailable pages with .range() (optionally behind an
        // updated_at cutoff); the 23505 recovery path reads a single row with
        // .maybeSingle().
        select: () => {
          let before: string | null = null;
          const b = chain({
            range: (fromRow: number, toRow: number) =>
              Promise.resolve({
                data: existing
                  .filter((u) => u.is_available !== false)
                  .filter((u) => before === null || String(u.updated_at) < before)
                  .map((u) => ({ id: u.id }))
                  .slice(fromRow, toRow + 1),
                error: null,
              }),
            maybeSingle: () => {
              const rows = options.conflictRows ?? {};
              const id = Object.values(rows)[0];
              return Promise.resolve({ data: id ? { id } : null, error: null });
            },
          });
          b.lt = (column: string, value: string) => {
            if (column === "updated_at") before = log.unseenBefore = value;
            return b;
          };
          return b;
        },
      };
    }
    throw new Error(`unexpected table ${table}`);
  };

  return { client: { from } as unknown as SupabaseClient, log };
}

const fp = (beds: number, baths: number, sqft: number, rent: number): ScrapedUnit => ({ beds, baths, sqft, rent });
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
const recent = daysAgo(1);

describe("saveScrapedUnits — floorplan-level listings (no unit number)", () => {
  it("matches an existing floorplan row instead of inserting a duplicate every night", async () => {
    const { client, log } = mockDb([
      { id: "u1", unit_number: null, beds: 1, baths: 1, sqft: 823, latest_rent: 2151, price_captured_at: recent, created_at: "2026-09-04" },
    ]);
    const res = await saveScrapedUnits(client, "b1", [fp(1, 1, 823, 2151)]);
    expect(res).toEqual({
      unitsCreated: 0,
      unitsUpdated: 1,
      seenUnitIds: ["u1"],
      existingNumberedAvailable: 0,
      existingAvailable: 1,
    });
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

  it("keeps two same-geometry plans apart when the site gives them names", async () => {
    const { client, log } = mockDb([]);
    const res = await saveScrapedUnits(client, "b1", [
      { beds: 1, baths: 1, rent: 2000, floorplan_name: "A1" },
      { beds: 1, baths: 1, rent: 2500, floorplan_name: "A2" },
    ]);
    // Without floorplan identity both collapsed onto "1|1|" and one was retired nightly
    expect(res.unitsCreated).toBe(2);
    expect(log.floorplanInserts.map((f) => f.name)).toEqual(["A1", "A2"]);
    expect(log.inserts.map((i) => i.floorplan_id)).toEqual(["plan-1", "plan-2"]);
  });

  it("re-resolves a named plan to the same floorplan row on the next scrape", async () => {
    const { client, log } = mockDb(
      [{ id: "u1", unit_number: null, floorplan_id: "plan-existing", beds: 1, baths: 1, sqft: null, latest_rent: 2000, created_at: "2026-09-04" }],
      { floorplans: [{ id: "plan-existing", name: "A1" }] },
    );
    const res = await saveScrapedUnits(client, "b1", [{ beds: 1, baths: 1, rent: 2100, floorplan_name: "a1" }]);
    expect(res.seenUnitIds).toEqual(["u1"]);
    expect(log.floorplanInserts).toHaveLength(0); // case-insensitive match
    expect(log.inserts).toHaveLength(0);
  });

  it("adopts an unstamped row by geometry and stamps its floorplan_id", async () => {
    const { client, log } = mockDb([
      { id: "legacy", unit_number: null, floorplan_id: null, beds: 2, baths: 2, sqft: 1000, latest_rent: 3000, created_at: "2026-09-04" },
    ]);
    const res = await saveScrapedUnits(client, "b1", [
      { beds: 2, baths: 2, sqft: 1000, rent: 3000, floorplan_name: "B2" },
    ]);
    expect(res.seenUnitIds).toEqual(["legacy"]);
    expect(log.inserts).toHaveLength(0);
    expect(log.updates[0].patch).toMatchObject({ floorplan_id: "plan-1" });
  });

  it("keeps distinct rents apart when a plan has neither name nor sqft", async () => {
    const { client } = mockDb([]);
    const res = await saveScrapedUnits(client, "b1", [
      { beds: 1, baths: 1, rent: 2000 },
      { beds: 1, baths: 1, rent: 2800 },
    ]);
    expect(res.unitsCreated).toBe(2);
  });
});

describe("saveScrapedUnits — unit_number normalization", () => {
  it("matches a numeric unit number against the stored text row", async () => {
    const { client, log } = mockDb([
      { id: "n1204", unit_number: "1204", beds: 2, baths: 2, sqft: 1100, latest_rent: 3500, is_available: true, created_at: "2026-09-01" },
    ]);
    // The model emits 1204 as a NUMBER; an exact string compare missed it,
    // the insert 23505'd, and markUnitsUnavailable retired the live row.
    const res = await saveScrapedUnits(client, "b1", [
      { unit_number: 1204 as unknown as string, beds: 2, baths: 2, sqft: 1100, rent: 3500 },
    ]);
    expect(res.seenUnitIds).toEqual(["n1204"]);
    expect(log.inserts).toHaveLength(0);
    expect(res.existingNumberedAvailable).toBe(1);
  });

  it("trims whitespace and ignores casing", async () => {
    const { client, log } = mockDb([
      { id: "n12a", unit_number: "12A", beds: 1, baths: 1, sqft: 700, latest_rent: 2900, is_available: true, created_at: "2026-09-01" },
    ]);
    const res = await saveScrapedUnits(client, "b1", [{ unit_number: " 12a ", beds: 1, baths: 1, sqft: 700, rent: 2900 }]);
    expect(res.seenUnitIds).toEqual(["n12a"]);
    expect(log.inserts).toHaveLength(0);
  });

  it("writes the trimmed unit number, not the raw value", async () => {
    const { client, log } = mockDb([]);
    await saveScrapedUnits(client, "b1", [{ unit_number: " 905 ", beds: 1, baths: 1, sqft: 700, rent: 2400 }]);
    expect(log.inserts[0].unit_number).toBe("905");
  });

  it("adopts the existing row when the insert hits a unique violation", async () => {
    const { client, log } = mockDb([], { conflictOn: ["707"], conflictRows: { "707": "live-707" } });
    const res = await saveScrapedUnits(client, "b1", [{ unit_number: "707", beds: 1, baths: 1, sqft: 650, rent: 2200 }]);
    // The conflicting row must end up in seenUnitIds or retirement kills it
    expect(res.seenUnitIds).toEqual(["live-707"]);
    expect(res.unitsUpdated).toBe(1);
    expect(log.snapshots).toEqual([
      { unit_id: "live-707", rent: 2200, lease_term_months: null, source_id: undefined },
    ]);
  });
});

describe("saveScrapedUnits — column hygiene", () => {
  it("drops a non-date available_on and rounds integer columns", async () => {
    const { client, log } = mockDb([]);
    await saveScrapedUnits(client, "b1", [
      { unit_number: "1", beds: 1, baths: 1.5, sqft: 823.4, rent: 2151.6, available_on: "Now" },
    ]);
    expect(log.inserts[0]).toMatchObject({ sqft: 823, available_on: null, baths: 1.5 });
    expect(log.snapshots[0]).toMatchObject({ rent: 2152 });
  });

  it("keeps an ISO available_on", async () => {
    const { client, log } = mockDb([]);
    await saveScrapedUnits(client, "b1", [
      { unit_number: "2", beds: 1, baths: 1, sqft: 700, rent: 2400, available_on: "2026-10-01" },
    ]);
    expect(log.inserts[0]).toMatchObject({ available_on: "2026-10-01" });
  });

  it("falls back to per-row snapshot inserts when the batch is rejected", async () => {
    const { client, log } = mockDb([], { failSnapshotBatch: true });
    await saveScrapedUnits(client, "b1", [
      { unit_number: "1", beds: 1, baths: 1, sqft: 700, rent: 2400 },
      { unit_number: "2", beds: 2, baths: 2, sqft: 900, rent: 3400 },
    ]);
    expect(log.snapshotBatches).toBe(1);
    // One bad row must not cost the whole building its prices
    expect(log.snapshots).toHaveLength(2);
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

describe("saveScrapedUnits — verified-price freshness", () => {
  it("re-snapshots an unchanged rent once the latest capture is a week old", async () => {
    const { client, log } = mockDb([
      { id: "n1", unit_number: "1", beds: 1, baths: 1, sqft: 700, latest_rent: 2400, price_captured_at: daysAgo(10), created_at: "2026-08-01" },
      { id: "n2", unit_number: "2", beds: 1, baths: 1, sqft: 700, latest_rent: 2500, price_captured_at: daysAgo(2), created_at: "2026-08-01" },
    ]);
    await saveScrapedUnits(client, "b1", [
      { unit_number: "1", beds: 1, baths: 1, sqft: 700, rent: 2400 },
      { unit_number: "2", beds: 1, baths: 1, sqft: 700, rent: 2500 },
    ]);
    // Unit 1 would otherwise age out of the 45-day verified window while
    // being re-seen every two days; unit 2's capture is still fresh.
    expect(log.snapshots).toEqual([{ unit_id: "n1", rent: 2400, lease_term_months: null, source_id: undefined }]);
  });
});

describe("saveScrapedUnits — per-field sanitizing", () => {
  it("keeps a listed unit whose sqft is nonsense, so it is not retired as unseen", async () => {
    const { client, log } = mockDb([
      { id: "n101", unit_number: "101", beds: 1, baths: 1, sqft: 650, latest_rent: 2400, price_captured_at: recent, is_available: true, created_at: "2026-09-01" },
    ]);
    const res = await saveScrapedUnits(client, "b1", [{ unit_number: "101", beds: 1, baths: 1, sqft: 0, rent: 2450 }]);
    expect(res.seenUnitIds).toEqual(["n101"]);
    expect(log.updates[0].patch).toMatchObject({ sqft: null, is_available: true });
    expect(log.snapshots).toEqual([{ unit_id: "n101", rent: 2450, lease_term_months: null, source_id: undefined }]);
  });

  it("keeps a unit with an impossible rent but writes no snapshot for it", async () => {
    const { client, log } = mockDb([]);
    const res = await saveScrapedUnits(client, "b1", [{ unit_number: "7C", beds: 2, baths: 2, sqft: 900, rent: -1 }]);
    expect(res.unitsCreated).toBe(1);
    expect(res.seenUnitIds).toHaveLength(1);
    expect(log.snapshots).toHaveLength(0);
  });

  it("drops only units with no usable identity", async () => {
    const { client, log } = mockDb([]);
    const res = await saveScrapedUnits(client, "b1", [
      { unit_number: "PH-A-WITH-A-VERY-LONG-NAME", beds: 3, baths: 3, sqft: 2000, rent: 9000 },
      { beds: 42, baths: 1, sqft: 600, rent: 2000 },
      { unit_number: "3B", beds: 1, baths: 1, sqft: 600, rent: 2100 },
    ]);
    expect(res.unitsCreated).toBe(1);
    expect(log.inserts.map((i) => i.unit_number)).toEqual(["3B"]);
  });
});

describe("retireUnseenUnits", () => {
  const building = { id: "b1", name: "Loria Ansley" };
  const live = (n: number, updatedDaysAgo: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `u${i}`,
      unit_number: String(100 + i),
      is_available: true,
      updated_at: daysAgo(updatedDaysAgo),
    }));

  it("keeps a recently-seen inventory when a partial render saw a fraction of it", async () => {
    const existing = live(59, 3);
    const { client, log } = mockDb(existing);
    const scope = await retireUnseenUnits(
      client,
      building,
      { units: Array.from({ length: 5 }, (_, i) => ({ unit_number: String(100 + i), beds: 1, baths: 1, rent: 3000 })) },
      { unitsCreated: 0, unitsUpdated: 5, seenUnitIds: ["u0", "u1", "u2", "u3", "u4"], existingNumberedAvailable: 59, existingAvailable: 59 },
    );
    expect(scope).toBe("stale");
    expect(log.unseenBefore).not.toBeNull();
    expect(log.retired).toHaveLength(0);
  });

  it("still retires what no scrape has seen for weeks, so a real drop cannot stick forever", async () => {
    const existing = [...live(5, 1), ...live(20, 30).map((u, i) => ({ ...u, id: `old${i}`, unit_number: `9${i}` }))];
    const { client, log } = mockDb(existing);
    const scope = await retireUnseenUnits(
      client,
      building,
      { units: Array.from({ length: 5 }, (_, i) => ({ unit_number: String(100 + i), beds: 1, baths: 1, rent: 3000 })) },
      { unitsCreated: 0, unitsUpdated: 5, seenUnitIds: ["u0", "u1", "u2", "u3", "u4"], existingNumberedAvailable: 25, existingAvailable: 25 },
    );
    expect(scope).toBe("stale");
    expect(log.retired).toHaveLength(20);
    expect(log.retired.every((id) => id.startsWith("old"))).toBe(true);
  });

  it("retires every unseen unit after a full scrape", async () => {
    const { client, log } = mockDb(live(10, 1));
    const seen = Array.from({ length: 8 }, (_, i) => `u${i}`);
    const scope = await retireUnseenUnits(
      client,
      building,
      { units: seen.map((_, i) => ({ unit_number: String(100 + i), beds: 1, baths: 1, rent: 3000 })) },
      { unitsCreated: 0, unitsUpdated: 8, seenUnitIds: seen, existingNumberedAvailable: 10, existingAvailable: 10 },
    );
    expect(scope).toBe("all");
    expect(log.unseenBefore).toBeNull();
    expect(log.retired).toEqual(["u8", "u9"]);
  });

  it("retires nothing when the units page could not be fetched", async () => {
    const { client, log } = mockDb(live(10, 30));
    const scope = await retireUnseenUnits(
      client,
      building,
      { units: [{ beds: 1, baths: 1, rent: 3000 }], unitsPageFetchFailed: true },
      { unitsCreated: 1, unitsUpdated: 0, seenUnitIds: ["new-1"], existingNumberedAvailable: 10, existingAvailable: 10 },
    );
    expect(scope).toBe("none");
    expect(log.retired).toHaveLength(0);
  });
});

describe("saveScrapedUnits — floorplan-level page over a numbered inventory", () => {
  const numbered = (capturedDaysAgo: number) =>
    Array.from({ length: 3 }, (_, i) => ({
      id: `n${i}`,
      unit_number: String(100 + i),
      beds: 1,
      baths: 1,
      sqft: 700,
      is_available: true,
      latest_rent: 2400,
      price_captured_at: daysAgo(capturedDaysAgo),
      created_at: "2026-09-01",
    }));

  it("writes nothing while the numbered units were seen recently, so nothing is counted twice", async () => {
    const { client, log } = mockDb(numbered(3));
    const res = await saveScrapedUnits(client, "b1", [fp(1, 1, 700, 2400), fp(2, 2, 1100, 3400)]);
    expect(res).toEqual({
      unitsCreated: 0,
      unitsUpdated: 0,
      seenUnitIds: [],
      existingNumberedAvailable: 3,
      existingAvailable: 3,
    });
    expect(log.inserts).toHaveLength(0);
    expect(log.updates).toHaveLength(0);
    expect(log.floorplanInserts).toHaveLength(0);
    expect(log.snapshots).toHaveLength(0);
  });

  it("saves the floorplans once no scrape has seen a numbered unit for two weeks", async () => {
    const { client, log } = mockDb(numbered(20));
    const res = await saveScrapedUnits(client, "b1", [fp(1, 1, 700, 2400), fp(2, 2, 1100, 3400)]);
    expect(res.unitsCreated).toBe(2);
    expect(log.inserts).toHaveLength(2);
  });

  it("retires only the numbered units nobody has seen for two weeks", async () => {
    const existing = [
      { id: "fresh", unit_number: "101", is_available: true, updated_at: daysAgo(2) },
      { id: "gone", unit_number: "102", is_available: true, updated_at: daysAgo(30) },
      { id: "plan", unit_number: null, is_available: true, updated_at: daysAgo(0) },
    ];
    const { client, log } = mockDb(existing);
    const scope = await retireUnseenUnits(
      client,
      { id: "b1", name: "Switched to floorplans" },
      { units: [fp(1, 1, 700, 2400)] },
      { unitsCreated: 0, unitsUpdated: 1, seenUnitIds: ["plan"], existingNumberedAvailable: 2, existingAvailable: 3 },
    );
    expect(scope).toBe("stale");
    expect(log.retired).toEqual(["gone"]);
  });
});

describe("saveScrapedUnits — units retired by a bad scrape", () => {
  it("re-match by unit number on the next good scrape instead of re-inserting", async () => {
    const { client, log } = mockDb([
      { id: "r201", unit_number: "201", beds: 2, baths: 2, sqft: 1000, latest_rent: 4200, price_captured_at: daysAgo(4), is_available: false, created_at: "2026-10-06" },
      { id: "a202", unit_number: "202", beds: 2, baths: 2, sqft: 1000, latest_rent: 4300, price_captured_at: daysAgo(4), is_available: true, created_at: "2026-10-06" },
    ]);
    const res = await saveScrapedUnits(client, "b1", [
      { unit_number: "201", beds: 2, baths: 2, sqft: 1000, rent: 4200 },
      { unit_number: "202", beds: 2, baths: 2, sqft: 1000, rent: 4300 },
    ]);
    expect(log.inserts).toHaveLength(0);
    expect(res.seenUnitIds).toEqual(["r201", "a202"]);
    expect(log.updates.find((u) => u.id === "r201")?.patch).toMatchObject({ is_available: true });
    // Only rows live before this scrape count toward the partial-scrape check
    expect(res.existingAvailable).toBe(1);
  });
});
