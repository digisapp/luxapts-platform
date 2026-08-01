import { describe, it, expect } from "vitest";
import { sanitizeLeaseTerm } from "../scraper/db";

describe("sanitizeLeaseTerm", () => {
  it("passes through sane terms", () => {
    expect(sanitizeLeaseTerm(3)).toBe(3);
    expect(sanitizeLeaseTerm(12)).toBe(12);
    expect(sanitizeLeaseTerm(36)).toBe(36);
  });

  it("rounds fractional model output", () => {
    expect(sanitizeLeaseTerm(11.6)).toBe(12);
  });

  it("nulls missing or non-numeric values", () => {
    expect(sanitizeLeaseTerm(null)).toBeNull();
    expect(sanitizeLeaseTerm(undefined)).toBeNull();
    expect(sanitizeLeaseTerm(NaN)).toBeNull();
    expect(sanitizeLeaseTerm(Infinity)).toBeNull();
  });

  it("nulls hallucinated out-of-bounds terms", () => {
    expect(sanitizeLeaseTerm(0)).toBeNull();
    expect(sanitizeLeaseTerm(-6)).toBeNull();
    expect(sanitizeLeaseTerm(120)).toBeNull();
  });
});
