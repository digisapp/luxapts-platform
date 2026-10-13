import { describe, expect, it } from "vitest";
import { partnerMeta, worksIn } from "./recruiting";
import { applyContactFilters, filtersFromParams, filtersToParams } from "./filters";

describe("recruiting", () => {
  it("summarizes the market an agent works from their inquiry", () => {
    expect(worksIn({ neighborhood: "Financial District", price: 5200, beds: 2 })).toBe("Financial District · $5,200 · 2 bd");
    expect(worksIn({ neighborhood: null, price: 1_315_000, beds: 0 })).toBe("$1.3M sale · studio");
    expect(worksIn({ neighborhood: null, price: null, beds: null })).toBeNull();
  });

  it("falls back to Not contacted for a missing or unknown status", () => {
    expect(partnerMeta(null).label).toBe("Not contacted");
    expect(partnerMeta("joined").label).toBe("Joined Staycio");
  });

  it("filters brokers by firm and status, and round-trips them in the URL", () => {
    const calls: unknown[][] = [];
    const proxy: Record<string, unknown> = new Proxy({}, { get: (_t, m: string) => (...a: unknown[]) => (calls.push([m, ...a]), proxy) });
    applyContactFilters(proxy, { kind: "broker", company: "Compass", partner: "talking" }, "2026-10-12", new Date("2026-10-12T15:00:00Z"));
    expect(calls).toContainEqual(["eq", "kind", "broker"]);
    expect(calls).toContainEqual(["eq", "company", "Compass"]);
    expect(calls).toContainEqual(["eq", "partner_status", "talking"]);
    const f = { kind: "broker" as const, company: "Compass", partner: "meeting" as const };
    expect(filtersFromParams(filtersToParams(f))).toEqual(f);
    expect(filtersFromParams(new URLSearchParams("partner=hired"))).toEqual({});
  });
});
