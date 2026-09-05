import { describe, it, expect, vi } from "vitest";

// The module also exports a cached catalog loader that touches Next's cache
// and the Supabase server client; neither is needed for the pure resolver.
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => ({}) }));

import { resolveNeighborhoods, type NeighborhoodRow } from "../search/neighborhood-resolver";

const catalog: NeighborhoodRow[] = [
  { slug: "williamsburg", name: "Williamsburg", city_slug: "brooklyn" },
  { slug: "dumbo", name: "DUMBO", city_slug: "brooklyn" },
  { slug: "chelsea", name: "Chelsea, Manhattan", city_slug: "new-york" },
  { slug: "brickell", name: "Brickell", city_slug: "miami" },
  { slug: "downtown-miami", name: "Downtown Miami", city_slug: "miami" },
  { slug: "midtown", name: "Midtown", city_slug: "miami" },
  { slug: "midtown-miami", name: "Midtown Miami", city_slug: "miami" },
  { slug: "midtown-atl", name: "Midtown", city_slug: "atlanta" },
  { slug: "downtown-la", name: "Downtown LA", city_slug: "los-angeles" },
  { slug: "downtown-austin", name: "Downtown", city_slug: "austin" },
];

describe("resolveNeighborhoods", () => {
  it("matches a neighborhood inside the target city", () => {
    expect(resolveNeighborhoods(["Brickell"], "miami", catalog)).toEqual({ slugs: ["brickell"], city_slug: undefined });
  });

  it("matches NYC names that carry the borough suffix", () => {
    expect(resolveNeighborhoods(["chelsea"], "new-york", catalog).slugs).toEqual(["chelsea"]);
  });

  it("follows the neighborhood into its real city when the model picked the wrong one", () => {
    const r = resolveNeighborhoods(["Williamsburg"], "new-york", catalog);
    expect(r.slugs).toEqual(["williamsburg"]);
    expect(r.city_slug).toBe("brooklyn");
  });

  it("expands a generic term to every match in the target city", () => {
    const r = resolveNeighborhoods(["Midtown"], "miami", catalog);
    expect(r.slugs.sort()).toEqual(["midtown", "midtown-miami"]);
    expect(r.city_slug).toBeUndefined();
  });

  it("drops a term that is ambiguous across cities when no city is known", () => {
    expect(resolveNeighborhoods(["Downtown"], undefined, catalog)).toEqual({ slugs: [], city_slug: undefined });
  });

  it("ignores names that are not in the catalog", () => {
    expect(resolveNeighborhoods(["Narnia", ""], "miami", catalog).slugs).toEqual([]);
  });
});

describe("resolveNeighborhoods phrase handling", () => {
  it("strips leading words the model echoed from the query", () => {
    expect(resolveNeighborhoods(["walk-to-downtown"], "los-angeles", catalog).slugs).toEqual(["downtown-la"]);
    expect(resolveNeighborhoods(["near Brickell"], "miami", catalog).slugs).toEqual(["brickell"]);
  });
});
