// @vitest-environment node
import { describe, it, expect } from "vitest";
import { withVerifiedPricing } from "@/lib/verified-pricing";

const NOW = new Date("2026-09-23T12:00:00Z");
const fresh = { rent: 2369, captured_at: "2026-09-16T00:00:00Z" };
const stale = { rent: 2100, captured_at: "2026-04-25T00:00:00Z" };

function res(...pricings: (typeof fresh | null)[]) {
  return { city: "miami", results: pricings.map((pricing, i) => ({ id: i, pricing })) };
}

describe("withVerifiedPricing", () => {
  it("hides stale rents but keeps the unit listed", () => {
    const out = withVerifiedPricing(res(fresh, stale, null), {}, NOW);
    expect(out.results.map((r) => r.pricing)).toEqual([fresh, null, null]);
    expect(out.city).toBe("miami");
  });

  it("drops unverified units when the search is about price", () => {
    for (const params of [{ budget_max: 2200 }, { budget_min: 1000 }, { sort: "price_low" }, { sort: "price_high" }]) {
      const out = withVerifiedPricing(res(fresh, stale, null), params, NOW);
      expect(out.results.map((r) => r.id)).toEqual([0]);
    }
  });

  it("keeps unverified units for non-price sorts", () => {
    const out = withVerifiedPricing(res(stale), { sort: "best_match" }, NOW);
    expect(out.results).toHaveLength(1);
    expect(out.results[0].pricing).toBeNull();
  });
});
