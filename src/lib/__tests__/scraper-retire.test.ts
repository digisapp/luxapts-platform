import { describe, it, expect } from "vitest";
import {
  shouldRetireUnseenUnits,
  floorplanKey,
  normalizeUnitNumber,
  normalizeAvailableOn,
} from "../scraper/db";

describe("shouldRetireUnseenUnits", () => {
  it("retires when a real units page produced numbered listings", () => {
    expect(
      shouldRetireUnseenUnits({ scrapedNumbered: 12, existingNumberedAvailable: 14 })
    ).toBe(true);
  });

  it("never retires when the units page was found but could not be fetched", () => {
    // Bot wall / timeout: extraction fell back to the marketing page, whose
    // floor-plan "from" prices used to retire every real numbered unit.
    expect(
      shouldRetireUnseenUnits({
        unitsPageFetchFailed: true,
        scrapedNumbered: 4,
        existingNumberedAvailable: 40,
      })
    ).toBe(false);
  });

  it("never retires a numbered inventory from a floorplan-level result", () => {
    expect(
      shouldRetireUnseenUnits({ scrapedNumbered: 0, existingNumberedAvailable: 40 })
    ).toBe(false);
  });

  it("still retires floorplan phantoms when the building has no numbered units", () => {
    expect(
      shouldRetireUnseenUnits({ scrapedNumbered: 0, existingNumberedAvailable: 0 })
    ).toBe(true);
  });
});

describe("floorplanKey", () => {
  it("prefers the persisted floorplan id", () => {
    expect(floorplanKey({ floorplan_id: "plan-1", beds: 1, baths: 1, sqft: null })).toBe("p:plan-1");
    // Same geometry, different plan → different identity
    expect(floorplanKey({ floorplan_id: "plan-2", beds: 1, baths: 1, sqft: null })).not.toBe(
      floorplanKey({ floorplan_id: "plan-1", beds: 1, baths: 1, sqft: null })
    );
  });

  it("falls back to geometry when no plan is known", () => {
    expect(floorplanKey({ beds: 1, baths: 1, sqft: 823 })).toBe("1|1|823");
    expect(floorplanKey({ beds: 1, baths: 1, sqft: 823.4 })).toBe("1|1|823");
  });

  it("keeps distinct rents apart when sqft is missing", () => {
    const a = floorplanKey({ beds: 1, baths: 1, sqft: null, rent: 2151 });
    const b = floorplanKey({ beds: 1, baths: 1, sqft: null, rent: 3400 });
    expect(a).not.toBe(b);
  });

  it("is stable for the same unpriced plan", () => {
    expect(floorplanKey({ beds: 0, baths: 1, sqft: null })).toBe(
      floorplanKey({ beds: 0, baths: 1, sqft: null })
    );
  });
});

describe("normalizeUnitNumber", () => {
  it("coerces, trims, and rejects blanks", () => {
    expect(normalizeUnitNumber(1204)).toBe("1204");
    expect(normalizeUnitNumber(" 1204 ")).toBe("1204");
    expect(normalizeUnitNumber("")).toBeNull();
    expect(normalizeUnitNumber("   ")).toBeNull();
    expect(normalizeUnitNumber(null)).toBeNull();
    expect(normalizeUnitNumber(undefined)).toBeNull();
  });
});

describe("normalizeAvailableOn", () => {
  it("passes ISO dates and drops everything else", () => {
    expect(normalizeAvailableOn("2026-10-01")).toBe("2026-10-01");
    expect(normalizeAvailableOn(" 2026-10-01 ")).toBe("2026-10-01");
    expect(normalizeAvailableOn("Now")).toBeNull();
    expect(normalizeAvailableOn("10/01/2026")).toBeNull();
    expect(normalizeAvailableOn(null)).toBeNull();
  });
});
