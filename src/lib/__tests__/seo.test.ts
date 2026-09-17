import { describe, it, expect } from "vitest";
import { buildingPath, buildingUrl, isUuid, neighborhoodPath } from "@/lib/seo/urls";
import { buildSummary, buildUnitMix } from "@/lib/seo/building-summary";
import { BED_FACETS, findFacet, facetPath } from "@/lib/seo/facets";

const UUID = "027fe1bb-7801-4c2b-9d9a-9a0440a38128";

describe("buildingPath", () => {
  it("prefers the slug", () => {
    expect(buildingPath({ id: UUID, slug: "maple-terrace" })).toBe("/buildings/maple-terrace");
    expect(buildingUrl({ id: UUID, slug: "maple-terrace" })).toBe(
      "https://staycio.com/buildings/maple-terrace"
    );
  });

  it("falls back to the id so a row without a slug still resolves", () => {
    expect(buildingPath({ id: UUID })).toBe(`/buildings/${UUID}`);
    expect(buildingPath({ id: UUID, slug: null })).toBe(`/buildings/${UUID}`);
    // An empty-string slug is not a usable URL segment either.
    expect(buildingPath({ id: UUID, slug: "" })).toBe(`/buildings/${UUID}`);
  });
});

describe("isUuid", () => {
  it("distinguishes a UUID route param from a slug", () => {
    expect(isUuid(UUID)).toBe(true);
    expect(isUuid(UUID.toUpperCase())).toBe(true);
    expect(isUuid("maple-terrace")).toBe(false);
    // A numeric building name slugifies to digits — must not look like a UUID.
    expect(isUuid("8119-miami")).toBe(false);
  });
});

describe("neighborhoodPath", () => {
  it("qualifies a shared slug with ?city= so the three 'midtown' pages differ", () => {
    expect(neighborhoodPath("midtown", "miami", true)).toBe("/neighborhoods/midtown?city=miami");
    expect(neighborhoodPath("midtown", "new-york", true)).toBe(
      "/neighborhoods/midtown?city=new-york"
    );
  });

  it("leaves an unambiguous slug bare", () => {
    expect(neighborhoodPath("brickell", "miami", false)).toBe("/neighborhoods/brickell");
  });
});

describe("bedroom facets", () => {
  it("assigns each unit to exactly one facet", () => {
    for (const beds of [0, 1, 2, 3, 4, 7]) {
      const matched = BED_FACETS.filter((f) => f.matches(beds));
      expect(matched).toHaveLength(1);
    }
  });

  it("matches no facet for unknown bed counts", () => {
    expect(BED_FACETS.filter((f) => f.matches(null))).toHaveLength(0);
  });

  it("buckets 4+ bedrooms into the 3-bedroom facet rather than dropping them", () => {
    expect(findFacet("3-bedroom-apartments")?.matches(5)).toBe(true);
  });

  it("builds city-scoped paths", () => {
    expect(facetPath("miami", "2-bedroom-apartments")).toBe(
      "/cities/miami/2-bedroom-apartments"
    );
  });
});

describe("buildUnitMix", () => {
  it("groups by bedroom count with price and size ranges", () => {
    const mix = buildUnitMix([
      { beds: 0, baths: 1, sqft: 520, price: 1470 },
      { beds: 0, baths: 1, sqft: 533, price: 1561 },
      { beds: 2, baths: 2, sqft: 1100, price: 3789 },
    ]);

    expect(mix.map((m) => m.key)).toEqual(["studio", "2-bedroom"]);
    expect(mix[0]).toMatchObject({
      count: 2,
      minPrice: 1470,
      maxPrice: 1561,
      minSqft: 520,
      maxSqft: 533,
    });
    expect(mix[1]).toMatchObject({ count: 1, minPrice: 3789, maxPrice: 3789 });
  });

  it("ignores unpriced units for the price range but still counts them", () => {
    const mix = buildUnitMix([
      { beds: 1, baths: 1, sqft: null, price: null },
      { beds: 1, baths: 1, sqft: 700, price: 2400 },
    ]);
    expect(mix[0].count).toBe(2);
    expect(mix[0].minPrice).toBe(2400);
    expect(mix[0].minSqft).toBe(700);
  });

  it("skips units with no bed count rather than inventing a bucket", () => {
    expect(buildUnitMix([{ beds: null, baths: 1, sqft: 600, price: 2000 }])).toEqual([]);
  });
});

describe("buildSummary", () => {
  const base = {
    name: "Maple Terrace",
    address: "3003 Maple Ave",
    cityName: "Dallas",
    state: "TX",
    neighborhoodName: "Uptown",
    yearBuilt: 2023,
    stories: 24,
    units: [
      { beds: 0, baths: 1, sqft: 533, price: 1470 },
      { beds: 2, baths: 2, sqft: 1100, price: 3789 },
    ],
  };

  it("produces prose for a building with no stored description", () => {
    const s = buildSummary(base);
    const text = s.overview.join(" ");
    expect(s.overview.length).toBeGreaterThan(1);
    expect(text).toContain("Maple Terrace");
    expect(text).toContain("3003 Maple Ave");
    expect(text).toContain("Dallas, TX");
    expect(text).toContain("2023");
    expect(text).toContain("$1,470");
  });

  it("leads with the stored description when there is one", () => {
    const s = buildSummary({ ...base, description: "Designed by Annabelle Selldorf" });
    expect(s.overview[0]).toBe("Designed by Annabelle Selldorf.");
  });

  it("never claims availability it does not have", () => {
    const s = buildSummary({ ...base, units: [] });
    const text = s.overview.join(" ");
    expect(text).toContain("no units listed as available");
    expect(s.unitMix).toEqual([]);
    // No price FAQ without prices — an FAQPage answer must be a real fact.
    expect(s.faqs.some((f) => f.question.includes("How much"))).toBe(false);
  });

  it("only emits a pet FAQ when a pet policy exists", () => {
    expect(buildSummary(base).faqs.some((f) => f.question.includes("pet friendly"))).toBe(false);
    const withPets = buildSummary({ ...base, petPolicy: "2 pets max, $500 deposit" });
    const faq = withPets.faqs.find((f) => f.question.includes("pet friendly"));
    expect(faq?.answer).toBe("2 pets max, $500 deposit");
  });

  it("mentions amenities only once there are enough to be worth a sentence", () => {
    const two = buildSummary({ ...base, amenities: ["Pool", "Gym"] });
    expect(two.overview.join(" ")).not.toContain("Residents have access");
    const three = buildSummary({ ...base, amenities: ["Pool", "Gym", "Rooftop"] });
    expect(three.overview.join(" ")).toContain("pool, gym, and rooftop");
  });

  it("gives two buildings with different inventory different copy", () => {
    const a = buildSummary(base).overview.join(" ");
    const b = buildSummary({
      ...base,
      name: "Linea",
      address: "100 Main St",
      units: [{ beds: 1, baths: 1, sqft: 700, price: 2200 }],
    }).overview.join(" ");
    expect(a).not.toBe(b);
  });
});
