import { describe, it, expect } from "vitest";
import { timeZoneForState, todayKey } from "@/app/buildings/availability";
import { moveInLabel, neighborhoodsForCityChange, resultCountLabel } from "./search-helpers";

describe("neighborhoodsForCityChange", () => {
  it("carries the parsed neighborhoods into a city the parse moved to", () => {
    expect(neighborhoodsForCityChange("brooklyn", ["williamsburg"], "miami")).toEqual(["williamsburg"]);
  });

  it("parks nothing when the parse stays in the current city", () => {
    // Left set, ["brickell"] was applied to the next city picked (Austin)
    expect(neighborhoodsForCityChange("miami", ["brickell"], "miami")).toBeNull();
    expect(neighborhoodsForCityChange(undefined, ["brickell"], "miami")).toBeNull();
  });

  it("parks nothing for a city change without neighborhoods", () => {
    expect(neighborhoodsForCityChange("austin", undefined, "miami")).toBeNull();
    expect(neighborhoodsForCityChange("austin", [], "miami")).toBeNull();
  });
});

describe("moveInLabel", () => {
  // 2026-10-14 21:00 in Miami
  const evening = new Date("2026-10-15T01:00:00Z");

  it("prints the listed day, not the day before, in US zones", () => {
    const today = todayKey(timeZoneForState("FL"), evening);
    expect(moveInLabel("2026-10-15", today)).toBe("Available Oct 15");
  });

  it("only says available now once the day has started where the building is", () => {
    expect(moveInLabel("2026-10-15", todayKey(timeZoneForState("FL"), evening))).not.toBe("Available now");
    expect(moveInLabel("2026-10-15", todayKey(timeZoneForState("FL"), new Date("2026-10-15T05:00:00Z")))).toBe(
      "Available now"
    );
  });

  it("shows nothing without a date", () => {
    expect(moveInLabel(null, "2026-10-15")).toBeNull();
  });
});

describe("resultCountLabel", () => {
  it("marks a full page as a lower bound", () => {
    expect(resultCountLabel(200, true)).toBe("200+");
    expect(resultCountLabel(173, true)).toBe("173+");
  });

  it("prints the exact count otherwise", () => {
    expect(resultCountLabel(42, false)).toBe("42");
    expect(resultCountLabel(0, false)).toBe("0");
  });
});
