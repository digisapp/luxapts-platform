import { describe, it, expect } from "vitest";
import { sanitizeMoveInDate } from "@/lib/search/move-in-date";

const TODAY = "2026-09-16";

describe("sanitizeMoveInDate", () => {
  it("accepts a normal near-future move-in date", () => {
    expect(sanitizeMoveInDate("2026-11-01", TODAY)).toBe("2026-11-01");
  });

  it("accepts today itself (an 'ASAP' query)", () => {
    expect(sanitizeMoveInDate(TODAY, TODAY)).toBe(TODAY);
  });

  it("allows a slightly stale date inside the grace window", () => {
    expect(sanitizeMoveInDate("2026-08-20", TODAY)).toBe("2026-08-20");
  });

  it("rejects a hallucinated past year, which would drop most inventory", () => {
    // The classic failure: "moving in November" resolved against last year.
    expect(sanitizeMoveInDate("2025-11-01", TODAY)).toBeNull();
  });

  it("rejects a date beyond the two-year window, which would disable the filter", () => {
    expect(sanitizeMoveInDate("2030-01-01", TODAY)).toBeNull();
  });

  it("rejects a day that never existed rather than rolling it forward", () => {
    // `new Date("2026-02-31")` silently becomes March 3.
    expect(sanitizeMoveInDate("2026-02-31", TODAY)).toBeNull();
  });

  it("accepts a real leap day", () => {
    expect(sanitizeMoveInDate("2028-02-29", "2028-01-01")).toBe("2028-02-29");
  });

  it("rejects anything that is not a strict YYYY-MM-DD string", () => {
    for (const bad of ["Nov 1 2026", "2026-11-1", "2026/11/01", "", "tomorrow", null, undefined, 20261101, {}]) {
      expect(sanitizeMoveInDate(bad, TODAY)).toBeNull();
    }
  });

  it("rejects everything when today is unparseable rather than filtering on a NaN comparison", () => {
    expect(sanitizeMoveInDate("2026-11-01", "not-a-date")).toBeNull();
  });
});
