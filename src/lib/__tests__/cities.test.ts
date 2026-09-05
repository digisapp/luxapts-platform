import { describe, it, expect } from "vitest";
import { normalizeCitySlug, isKnownCitySlug, CITY_SLUGS } from "../constants/cities";

describe("normalizeCitySlug", () => {
  it("maps the shorthand the LLM tools were previously instructed to use", () => {
    expect(normalizeCitySlug("nyc")).toBe("new-york");
    expect(normalizeCitySlug("NYC")).toBe("new-york");
    expect(normalizeCitySlug("la")).toBe("los-angeles");
    expect(normalizeCitySlug("SF")).toBe("san-francisco");
    expect(normalizeCitySlug("Manhattan")).toBe("new-york");
  });

  it("normalizes free-text city names into slugs", () => {
    expect(normalizeCitySlug("New York")).toBe("new-york");
    expect(normalizeCitySlug("  Los Angeles ")).toBe("los-angeles");
    expect(normalizeCitySlug("san_francisco")).toBe("san-francisco");
    expect(normalizeCitySlug("New York City")).toBe("new-york");
  });

  it("passes canonical slugs through unchanged", () => {
    for (const slug of CITY_SLUGS) {
      expect(normalizeCitySlug(slug)).toBe(slug);
      expect(isKnownCitySlug(slug)).toBe(true);
    }
  });

  it("returns an empty string for non-strings and rejects unknown slugs", () => {
    expect(normalizeCitySlug(undefined)).toBe("");
    expect(normalizeCitySlug(42)).toBe("");
    expect(normalizeCitySlug("paris")).toBe("paris");
    expect(isKnownCitySlug("paris")).toBe(false);
  });
});
