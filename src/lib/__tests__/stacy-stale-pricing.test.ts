/**
 * Stacy may only quote prices verified within INVENTORY_MAX_AGE_DAYS. Two
 * leaks of January figures: building_facts rent/special rows passed through
 * get_building_details, and the knowledge collection's ingest-time "Rent
 * Range:" / "Move-in Specials:" lines passed through search_knowledge.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const searchDocuments = vi.hoisted(() => vi.fn());
vi.mock("@/lib/xai/collections", () => ({ searchDocuments }));

import {
  currentFacts,
  executeTool,
  stripUnverifiedPricing,
  withoutUnverifiedPricing,
} from "@/lib/xai/tool-executor";
import { verifiedBuildingDetails } from "@/lib/voice/verified";

const NOW = new Date("2026-10-11T12:00:00Z");
const FRESH = "2026-10-01T00:00:00Z";
const JANUARY = "2026-01-10T00:00:00Z";
const BUILDING = "11111111-1111-4111-8111-111111111111";

const facts = [
  { key: "rent_min", value: 2496, updated_at: JANUARY },
  { key: "rent_max", value: 5958, updated_at: JANUARY },
  { key: "move_in_specials", value: "3 months free on 12-month lease", updated_at: JANUARY },
  { key: "available_units", value: 18, updated_at: JANUARY },
  { key: "total_units", value: 438, updated_at: JANUARY },
  { key: "unit_types", value: "Studio, 1BR, 2BR", updated_at: JANUARY },
  { key: "move_in_specials", value: "1 month free", updated_at: FRESH },
];

describe("currentFacts", () => {
  it("drops stale rent, availability and special facts but keeps the rest", () => {
    expect(currentFacts(facts, NOW)).toEqual([
      { key: "total_units", value: 438 },
      { key: "unit_types", value: "Studio, 1BR, 2BR" },
      { key: "move_in_specials", value: "1 month free" },
    ]);
  });
  it("treats a fact without a timestamp as unverified", () => {
    expect(currentFacts([{ key: "rent_min", value: 1 }], NOW)).toEqual([]);
    expect(currentFacts(null, NOW)).toEqual([]);
  });
});

describe("get_building_details", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ building: { id: BUILDING, name: "X", facts, units: [] } }), { status: 200 })
      )
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("reaches web chat and the phone without January rents or specials", async () => {
    const details = (await executeTool("get_building_details", { building_id: BUILDING }, "https://app.test")) as {
      building: { facts: { key: string }[] };
    };
    const keys = details.building.facts.map((f) => f.key);
    expect(keys).not.toContain("rent_min");
    expect(keys).not.toContain("available_units");
    expect(JSON.stringify(details)).not.toMatch(/3 months free/);

    // The phone/microsite path wraps the same compacted result.
    const spoken = JSON.stringify(verifiedBuildingDetails(details, [], NOW));
    expect(spoken).not.toMatch(/rent_min|rent_max|3 months free|2496/);
  });
});

describe("search_knowledge", () => {
  const doc = [
    "# Perrin Brickell",
    "## About",
    "A quiet tower with bay views. Studios from $1,850 with 2 months free. Pet friendly.",
    "## Pricing",
    "Rent Range: $2,100 - $5,400/month",
    "Move-in Specials: 3 months free on 12-month lease",
    "## Amenities",
    "- Rooftop pool",
  ].join("\n");

  it("strips ingest-time prices and promotions, keeping the description", () => {
    expect(stripUnverifiedPricing(doc)).toBe(
      ["# Perrin Brickell", "## About", "A quiet tower with bay views. Pet friendly.", "## Amenities", "- Rooftop pool"].join("\n")
    );
  });

  it("filters every string and drops rent metadata, whatever the response shape", () => {
    expect(
      withoutUnverifiedPricing({ matches: [{ chunk_content: "Rent Range: $1 - $2/month\nGym", fields: { min_rent: "1", city: "miami" } }] })
    ).toEqual({ matches: [{ chunk_content: "Gym", fields: { city: "miami" } }] });
  });

  it("is applied to the tool result", async () => {
    process.env.XAI_COLLECTION_ID = "col_test";
    searchDocuments.mockResolvedValue({
      results: [{ content: doc, metadata: { city: "miami", min_rent: "2100", max_rent: "5400" } }],
    });
    const out = await executeTool("search_knowledge", { query: "quiet tower", city_slug: "miami" }, "https://app.test");
    const text = JSON.stringify(out);
    expect(text).not.toMatch(/\$|months free|min_rent|max_rent/);
    expect(text).toMatch(/Rooftop pool/);
    delete process.env.XAI_COLLECTION_ID;
  });
});
