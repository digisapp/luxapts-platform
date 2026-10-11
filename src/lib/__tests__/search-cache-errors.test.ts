/**
 * Search cache error handling. unstable_cache stores whatever its callback
 * resolves to (for 5 minutes per search, an hour for the neighborhood
 * catalog) but never a rejection, so database failures have to throw rather
 * than come back as an empty result.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));

type Result = { data?: unknown; error?: { message: string } | null };
let respond: (table: string, calls: [string, unknown[]][]) => Result;

// Chainable stand-in for the supabase-js query builder: records each call
// and resolves (when awaited) to whatever `respond` returns for the table.
function builder(table: string) {
  const calls: [string, unknown[]][] = [];
  const b: object = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          const res = { data: null, error: null, ...respond(table, calls) };
          return (resolve: (v: unknown) => void) => resolve(res);
        }
        return (...args: unknown[]) => {
          calls.push([String(prop), args]);
          return b;
        };
      },
    }
  );
  return b;
}

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({ from: (table: string) => builder(table) }),
}));

const { cachedSearch } = await import("@/lib/search/cache");
const { getNeighborhoodCatalog } = await import("@/lib/search/neighborhood-resolver");

const MIAMI = { id: "c1", slug: "miami", name: "Miami", state: "FL" };

describe("cachedSearch", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("throws when the city lookup fails", async () => {
    respond = (table) => (table === "cities" ? { error: { message: "timeout" } } : {});
    await expect(cachedSearch({ city_slug: "miami" })).rejects.toThrow(/city lookup failed/);
  });

  it("answers an unknown city with an empty result", async () => {
    respond = () => ({ data: null });
    const res = await cachedSearch({ city_slug: "atlantis" });
    expect(res.results).toEqual([]);
    expect(res.state).toBeNull();
  });

  it("throws when the neighborhood lookup fails", async () => {
    respond = (table) =>
      table === "cities" ? { data: MIAMI } : table === "neighborhoods" ? { error: { message: "boom" } } : {};
    await expect(cachedSearch({ city_slug: "miami", neighborhood_slugs: ["brickell"] })).rejects.toThrow(
      /neighborhood lookup failed/
    );
  });

  it("answers neighborhoods that aren't in the city with an empty result", async () => {
    respond = (table) => (table === "cities" ? { data: MIAMI } : { data: [] });
    const res = await cachedSearch({ city_slug: "miami", neighborhood_slugs: ["williamsburg"] });
    expect(res.results).toEqual([]);
    expect(res.state).toBe("FL");
  });

  it("throws when the building read fails, instead of caching 'no buildings'", async () => {
    respond = (table) => (table === "cities" ? { data: MIAMI } : table === "buildings" ? { error: { message: "boom" } } : {});
    await expect(cachedSearch({ city_slug: "miami" })).rejects.toThrow(/building lookup failed/);
  });

  it("returns the city's state with a real no-match", async () => {
    respond = (table) => (table === "cities" ? { data: MIAMI } : { data: [] });
    const res = await cachedSearch({ city_slug: "miami" });
    expect(res).toMatchObject({ city: "miami", state: "FL", results: [], limit_reached: false });
  });
});

describe("getNeighborhoodCatalog", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("falls back to an empty catalog when the read fails", async () => {
    respond = () => ({ error: { message: "boom" } });
    await expect(getNeighborhoodCatalog()).resolves.toEqual([]);
  });

  it("maps catalog rows to their city slug", async () => {
    respond = () => ({ data: [{ slug: "brickell", name: "Brickell", cities: { slug: "miami" } }] });
    await expect(getNeighborhoodCatalog()).resolves.toEqual([
      { slug: "brickell", name: "Brickell", city_slug: "miami" },
    ]);
  });
});
