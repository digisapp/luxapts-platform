import { describe, it, expect } from "vitest";
import { getBuildingsToScrape, scrapeStatusOf } from "../scraper/db";
import type { SupabaseClient } from "@supabase/supabase-js";

// building_scrape_status.building_id is the PRIMARY KEY, so PostgREST returns
// the embed as an object (or null) — never an array. These fixtures mirror the
// live response shape that starved the nightly scrape for a month.
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

function building(id: string, status: Record<string, unknown> | null) {
  return {
    id,
    name: `Building ${id}`,
    website_url: `https://${id}.example.com`,
    city_id: "city",
    building_scrape_status: status,
  };
}

function mockSupabase(rows: unknown[]): SupabaseClient {
  const builder = {
    select: () => builder,
    eq: () => builder,
    not: () => builder,
    order: () => builder,
    range: (from: number, to: number) => ({
      then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
        resolve({ data: rows.slice(from, to + 1), error: null }),
    }),
  };
  return { from: () => builder } as unknown as SupabaseClient;
}

describe("scrapeStatusOf", () => {
  it("accepts the object, array and null shapes", () => {
    expect(scrapeStatusOf({ building_scrape_status: { units_found: 3 } })).toEqual({ units_found: 3 });
    expect(scrapeStatusOf({ building_scrape_status: [{ units_found: 3 }] })).toEqual({ units_found: 3 });
    expect(scrapeStatusOf({ building_scrape_status: null })).toBeNull();
    expect(scrapeStatusOf(undefined)).toBeNull();
  });
});

describe("getBuildingsToScrape", () => {
  it("puts never-scraped buildings first, then stalest, and skips fresh ones", async () => {
    const supabase = mockSupabase([
      building("fresh", { scrape_enabled: true, units_scraped_at: ago(1), amenities_scraped_at: null, website_url: null }),
      building("stale-10d", { scrape_enabled: true, units_scraped_at: ago(10), amenities_scraped_at: null, website_url: null }),
      building("stale-40d", { scrape_enabled: true, units_scraped_at: ago(40), amenities_scraped_at: null, website_url: null }),
      building("never-row", { scrape_enabled: true, units_scraped_at: null, amenities_scraped_at: null, website_url: null }),
      building("never-norow", null),
    ]);

    const picked = await getBuildingsToScrape(supabase, { onlyUnits: true, limit: 10, daysStale: 7 });
    expect(picked.map((b) => b.id)).toEqual(["never-row", "never-norow", "stale-40d", "stale-10d"]);
  });

  it("honours scrape_enabled=false and the limit", async () => {
    const supabase = mockSupabase([
      building("disabled", { scrape_enabled: false, units_scraped_at: null, amenities_scraped_at: null, website_url: null }),
      building("a", null),
      building("b", null),
      building("c", null),
    ]);
    const picked = await getBuildingsToScrape(supabase, { onlyUnits: true, limit: 2, daysStale: 7 });
    expect(picked.map((b) => b.id)).toEqual(["a", "b"]);
  });

  it("exposes the scrape-target URL override through scrapeStatusOf", async () => {
    const supabase = mockSupabase([
      building("x", { scrape_enabled: true, units_scraped_at: null, amenities_scraped_at: null, website_url: "https://portal.example.com/availability" }),
    ]);
    const [picked] = await getBuildingsToScrape(supabase, { onlyUnits: true, limit: 1 });
    expect(scrapeStatusOf(picked)?.website_url).toBe("https://portal.example.com/availability");
  });
});
