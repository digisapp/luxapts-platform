import { describe, it, expect } from "vitest";
import {
  shouldRetireUnseenUnits,
  unseenRetirementScope,
  floorplanKey,
  normalizeUnitNumber,
  normalizeAvailableOn,
  sanitizeScrapedUnit,
  needsPriceSnapshot,
  resolveScrapeUrl,
} from "../scraper/db";

describe("shouldRetireUnseenUnits", () => {
  it("retires when a real units page produced numbered listings", () => {
    expect(
      shouldRetireUnseenUnits({
        scrapedNumbered: 12,
        existingNumberedAvailable: 14,
        seenCount: 12,
        existingAvailable: 14,
      })
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
        seenCount: 40,
        existingAvailable: 40,
      })
    ).toBe(false);
  });

  it("never retires a numbered inventory from a floorplan-level result", () => {
    expect(
      shouldRetireUnseenUnits({
        scrapedNumbered: 0,
        existingNumberedAvailable: 40,
        seenCount: 40,
        existingAvailable: 40,
      })
    ).toBe(false);
  });

  it("still retires floorplan phantoms when the building has no numbered units", () => {
    expect(
      shouldRetireUnseenUnits({
        scrapedNumbered: 0,
        existingNumberedAvailable: 0,
        seenCount: 4,
        existingAvailable: 4,
      })
    ).toBe(true);
  });
});

describe("unseenRetirementScope — partial scrapes", () => {
  const scope = (seenCount: number, existingAvailable: number) =>
    unseenRetirementScope({
      scrapedNumbered: seenCount,
      existingNumberedAvailable: existingAvailable,
      seenCount,
      existingAvailable,
    });

  it("only retires long-unseen units when a scrape saw a fraction of the inventory", () => {
    // Loria Ansley: 59 numbered units on 10/06, a half-rendered list of 5 off
    // the same URL on 10/09 — and 54 live units were retired.
    expect(scope(5, 59)).toBe("stale");
    // 29 Wyn: 22 → 5
    expect(scope(5, 22)).toBe("stale");
    expect(shouldRetireUnseenUnits({
      scrapedNumbered: 5, existingNumberedAvailable: 59, seenCount: 5, existingAvailable: 59,
    })).toBe(false);
  });

  it("retires normally when the scrape saw at least half", () => {
    expect(scope(11, 22)).toBe("all");
    expect(scope(40, 59)).toBe("all");
  });

  it("lets small buildings retire normally", () => {
    // A handful of listings really can lease out in a few days.
    expect(scope(1, 5)).toBe("all");
    expect(scope(2, 6)).toBe("stale");
  });

  it("counts floorplan-level rows in the existing inventory", () => {
    expect(
      unseenRetirementScope({
        scrapedNumbered: 0,
        existingNumberedAvailable: 0,
        seenCount: 3,
        existingAvailable: 12,
      })
    ).toBe("stale");
  });

  it("keeps the stronger guards ahead of the partial check", () => {
    expect(
      unseenRetirementScope({
        unitsPageFetchFailed: true,
        scrapedNumbered: 5,
        existingNumberedAvailable: 59,
        seenCount: 5,
        existingAvailable: 59,
      })
    ).toBe("none");
    // A floorplan-level result only retires numbered units no scrape has
    // seen for two weeks, never the recently-seen ones.
    expect(
      unseenRetirementScope({
        scrapedNumbered: 0,
        existingNumberedAvailable: 59,
        seenCount: 5,
        existingAvailable: 59,
      })
    ).toBe("stale");
  });
});

describe("sanitizeScrapedUnit", () => {
  it("nulls an out-of-bounds sqft instead of dropping the unit", () => {
    // Unit 101 with sqft:0 was dropped, then retired as unseen while still listed.
    expect(sanitizeScrapedUnit({ unit_number: "101", beds: 1, baths: 1, sqft: 0, rent: 2400 })).toEqual({
      unit_number: "101", beds: 1, baths: 1, sqft: null, rent: 2400,
    });
  });

  it("nulls a nonsense rent so no snapshot is written, and keeps the unit", () => {
    // Seven Dey Street units came back with rent:-1.
    const unit = sanitizeScrapedUnit({ unit_number: "7C", beds: 2, baths: 2, sqft: 900, rent: -1 });
    expect(unit).not.toBeNull();
    expect(unit!.rent).toBeNull();
    expect(unit!.beds).toBe(2);
  });

  it("nulls out-of-bounds beds and baths on a numbered unit", () => {
    const unit = sanitizeScrapedUnit({ unit_number: "12A", beds: 40, baths: -2, rent: 3100 });
    expect(unit).toMatchObject({ unit_number: "12A", beds: null, baths: null, rent: 3100 });
  });

  it("leaves absent fields absent", () => {
    // units.baths is written as-is; null would blank a stored value.
    const unit = sanitizeScrapedUnit({ unit_number: "5", beds: 1, rent: 2000 } as never);
    expect(unit!.baths).toBeUndefined();
  });

  it("keeps a studio floorplan (beds 0)", () => {
    expect(sanitizeScrapedUnit({ beds: 0, baths: 1, rent: 1900 })).not.toBeNull();
  });

  it("drops a unit whose identity is unusable", () => {
    expect(sanitizeScrapedUnit({ unit_number: "x".repeat(21), beds: 1, baths: 1, rent: 2000 })).toBeNull();
    // No number and no usable bedroom count: nothing to key a floorplan on.
    expect(sanitizeScrapedUnit({ beds: 99, baths: 1, rent: 2000 })).toBeNull();
    expect(sanitizeScrapedUnit({ beds: null as never, baths: 1, rent: 2000 })).toBeNull();
  });

  it("treats a blank unit number as no number", () => {
    expect(sanitizeScrapedUnit({ unit_number: "  ", beds: null as never, baths: 1, rent: 2000 })).toBeNull();
  });
});

describe("needsPriceSnapshot", () => {
  const now = new Date("2026-10-11T12:00:00Z");
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

  it("snapshots a changed rent", () => {
    expect(needsPriceSnapshot(3100, { latest_rent: 3000, price_captured_at: daysAgo(1) }, now)).toBe(true);
  });

  it("skips an unchanged rent captured within the week", () => {
    expect(needsPriceSnapshot(3000, { latest_rent: 3000, price_captured_at: daysAgo(2) }, now)).toBe(false);
  });

  it("re-snapshots an unchanged rent once the capture is a week old", () => {
    // Otherwise a unit re-seen every two days at one price ages out of the
    // 45-day verified window and becomes "Contact for pricing".
    expect(needsPriceSnapshot(3000, { latest_rent: 3000, price_captured_at: daysAgo(8) }, now)).toBe(true);
    expect(needsPriceSnapshot(3000, { latest_rent: 3000, price_captured_at: null }, now)).toBe(true);
  });

  it("never snapshots a missing rent", () => {
    expect(needsPriceSnapshot(null, { latest_rent: 3000, price_captured_at: daysAgo(60) }, now)).toBe(false);
  });
});

describe("resolveScrapeUrl", () => {
  const encore = (override: string | null, website: string | null = "https://www.glenwoodnyc.com/properties/upper-west-side/the-encore/") => ({
    name: "The Encore",
    website_url: website,
    building_scrape_status: { website_url: override },
  });

  it("ignores a frozen portfolio-homepage override", () => {
    expect(resolveScrapeUrl(encore("https://www.glenwoodnyc.com/"))).toBe(
      "https://www.glenwoodnyc.com/properties/upper-west-side/the-encore/"
    );
    expect(
      resolveScrapeUrl({
        name: "45 Wall Street",
        website_url: "https://tfc.com/apartments/45-wall-street",
        building_scrape_status: [{ website_url: "https://tfc.com/" }],
      })
    ).toBe("https://tfc.com/apartments/45-wall-street");
  });

  it("keeps an override that is this building's own page", () => {
    expect(resolveScrapeUrl(encore("https://www.securecafe.com/onlineleasing/the-encore/floorplans"))).toBe(
      "https://www.securecafe.com/onlineleasing/the-encore/floorplans"
    );
  });

  it("falls back to the building link when there is no override", () => {
    expect(resolveScrapeUrl(encore(null))).toBe("https://www.glenwoodnyc.com/properties/upper-west-side/the-encore/");
    expect(resolveScrapeUrl({ name: "The Encore", website_url: "https://x.com/encore", building_scrape_status: null })).toBe(
      "https://x.com/encore"
    );
  });

  it("returns null rather than a portfolio homepage when the building has no link", () => {
    expect(resolveScrapeUrl(encore("https://www.glenwoodnyc.com/", null))).toBeNull();
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
