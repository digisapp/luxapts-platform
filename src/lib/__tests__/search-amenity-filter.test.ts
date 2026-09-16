import { describe, it, expect } from "vitest";
import {
  amenityNamesMatch,
  canonicalAmenityKey,
  normalizeAmenityTerm,
} from "../search/amenity-filter";

describe("normalizeAmenityTerm", () => {
  it("treats hyphens, slashes and underscores as word separators", () => {
    expect(normalizeAmenityTerm("washer-dryer")).toBe("washer dryer");
    expect(normalizeAmenityTerm("Washer/Dryer")).toBe("washer dryer");
    expect(normalizeAmenityTerm("package_room")).toBe("package room");
  });

  it("collapses and trims whitespace", () => {
    expect(normalizeAmenityTerm("  Bike   Room ")).toBe("bike room");
  });
});

describe("canonicalAmenityKey", () => {
  it("maps parser slugs onto AMENITY_KEYWORDS display keys", () => {
    expect(canonicalAmenityKey("washer-dryer")).toBe("Washer Dryer");
    expect(canonicalAmenityKey("package-room")).toBe("Package Room");
    expect(canonicalAmenityKey("walk_in_closet")).toBe("Walk-in Closet");
    expect(canonicalAmenityKey("POOL")).toBe("Pool");
  });

  it("returns unknown terms unchanged", () => {
    expect(canonicalAmenityKey("elevator")).toBe("elevator");
  });
});

describe("amenityNamesMatch", () => {
  it("matches the parser's hyphenated slugs against slash-separated DB names", () => {
    expect(amenityNamesMatch(["Washer/Dryer"], "washer-dryer")).toBe(true);
    expect(amenityNamesMatch(["In-Unit Washer & Dryer"], "washer-dryer")).toBe(true);
  });

  it("matches slugs that are keywords rather than keys", () => {
    expect(amenityNamesMatch(["Bike Room"], "bike-room")).toBe(true);
    expect(amenityNamesMatch(["Package Room"], "package-room")).toBe(true);
    expect(amenityNamesMatch(["Package Room"], "package_room")).toBe(true);
  });

  it("falls back to a literal word match for terms outside the catalog", () => {
    expect(amenityNamesMatch(["Elevator"], "elevator")).toBe(true);
    expect(amenityNamesMatch(["Storage Lockers"], "storage")).toBe(true);
  });

  it("still matches the UI's display keys and their keyword synonyms", () => {
    expect(amenityNamesMatch(["Fitness Center"], "Gym")).toBe(true);
    expect(amenityNamesMatch(["Co-Working Lounge"], "Coworking")).toBe(true);
    expect(amenityNamesMatch(["Floor-to-Ceiling Windows"], "Floor To Ceiling Windows")).toBe(true);
  });

  it("does not match on substrings or unrelated amenities", () => {
    expect(amenityNamesMatch(["Gym"], "pool")).toBe(false);
    expect(amenityNamesMatch(["Carpool Lane"], "pool")).toBe(false);
    expect(amenityNamesMatch([], "pool")).toBe(false);
    expect(amenityNamesMatch(["Pool"], "")).toBe(false);
  });
});
