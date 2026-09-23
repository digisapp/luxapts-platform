import { describe, it, expect } from "vitest";
import { focusOnPricing } from "@/lib/scraper/ai-extractor";

describe("focusOnPricing", () => {
  it("leaves pages under budget alone", () => {
    expect(focusOnPricing("short page $2,500", 1000)).toBe("short page $2,500");
  });

  it("keeps prices that sit past the budget (the Greystar case)", () => {
    const filler = "x".repeat(500_000);
    const listings = "Unit 1204 · 1 bed · $2,554/mo  Unit 1505 · 2 bed · $3,487/mo";
    const page = "<h1>Miro</h1>" + filler + listings + filler;
    const out = focusOnPricing(page, 100_000);
    expect(out.length).toBeLessThanOrEqual(100_000 + 200);
    expect(out).toContain("<h1>Miro</h1>");
    expect(out).toContain("$2,554");
    expect(out).toContain("$3,487");
  });

  it("finds JSON-embedded rents too", () => {
    const page = "a".repeat(200_000) + '{"unit":"A1","rent": 2100}' + "b".repeat(200_000);
    expect(focusOnPricing(page, 50_000)).toContain('"rent": 2100');
  });

  it("falls back to the head when nothing looks like a price", () => {
    const page = "z".repeat(300_000);
    expect(focusOnPricing(page, 1000).startsWith("z".repeat(1000))).toBe(true);
  });
});
