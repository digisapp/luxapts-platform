// @vitest-environment node
import { describe, it, expect } from "vitest";
import { groupByBuilding, bedRangeLabel, type GroupableResult } from "@/lib/search/group-by-building";

function unit(
  buildingId: string,
  rent: number | null,
  extra: Partial<GroupableResult["unit"]> & { images?: unknown[]; floorplan?: string; captured?: string } = {}
): GroupableResult {
  return {
    building: { id: buildingId },
    unit: { beds: extra.beds ?? 1, sqft: extra.sqft ?? null, available_on: extra.available_on ?? null },
    pricing: rent === null ? null : { rent, captured_at: extra.captured ?? "2026-09-20T00:00:00Z" },
    images: extra.images,
    floorplan: extra.floorplan ? { layout_image_url: extra.floorplan } : null,
  };
}

describe("groupByBuilding", () => {
  it("collapses a building's units into one entry, in API rank order", () => {
    const groups = groupByBuilding([
      unit("a", 1900),
      unit("a", 1967),
      unit("b", 2100),
      unit("a", 2500),
    ]);
    expect(groups.map((g) => g.building.id)).toEqual(["a", "b"]);
    expect(groups[0].units).toHaveLength(3);
    expect(groups[0].minRent).toBe(1900);
    expect(groups[0].maxRent).toBe(2500);
  });

  it("quotes the cheapest priced unit, even when an unpriced one ranks first", () => {
    const [g] = groupByBuilding([unit("a", null), unit("a", 3000), unit("a", 2400)]);
    expect(g.lead.pricing?.rent).toBe(2400);
    expect(g.minRent).toBe(2400);
  });

  it("leads with fresh prices when a building has any, ignoring cheaper stale ones", () => {
    const isFresh = (at: string) => at >= "2026-09-01";
    const [g] = groupByBuilding(
      [
        unit("a", 2100, { captured: "2026-04-25T00:00:00Z" }),
        unit("a", 2369, { captured: "2026-09-16T00:00:00Z" }),
        unit("a", 2709, { captured: "2026-09-16T00:00:00Z" }),
      ],
      isFresh
    );
    expect(g.lead.pricing?.rent).toBe(2369);
    expect([g.minRent, g.maxRent]).toEqual([2369, 2709]);
    expect(g.units).toHaveLength(3);
  });

  it("falls back to stale prices when nothing is fresh", () => {
    const [g] = groupByBuilding([unit("a", 17916, { captured: "2026-03-01T00:00:00Z" })], () => false);
    expect(g.minRent).toBe(17916);
  });

  it("has no rent range when no unit is priced", () => {
    const [g] = groupByBuilding([unit("a", null), unit("a", null)]);
    expect(g.minRent).toBeNull();
    expect(g.maxRent).toBeNull();
    expect(g.lead).toBe(g.units[0]);
  });

  it("summarises beds, sqft, move-in and floor plans across units", () => {
    const [g] = groupByBuilding([
      unit("a", 2000, { beds: 2, sqft: 900, available_on: "2026-11-01" }),
      unit("a", 1800, { beds: 0, sqft: 0, available_on: "2026-10-15", floorplan: "fp.png" }),
      unit("a", 1900, { beds: 1, sqft: 650 }),
    ]);
    expect([g.bedsMin, g.bedsMax]).toEqual([0, 2]);
    expect([g.sqftMin, g.sqftMax]).toEqual([650, 900]);
    expect(g.earliestAvailable).toBe("2026-10-15");
    expect(g.hasFloorplan).toBe(true);
  });

  it("uses the first unit with photos for the card image", () => {
    const [g] = groupByBuilding([unit("a", 2000), unit("a", 2100, { images: ["x"] })]);
    expect(g.imageUnit).toBe(g.units[1]);
  });
});

describe("bedRangeLabel", () => {
  it("labels single values and ranges", () => {
    expect(bedRangeLabel(0, 0)).toBe("Studio");
    expect(bedRangeLabel(2, 2)).toBe("2 bed");
    expect(bedRangeLabel(0, 2)).toBe("Studio–2 bed");
    expect(bedRangeLabel(1, 3)).toBe("1–3 bed");
    expect(bedRangeLabel(null, null)).toBeNull();
  });
});
