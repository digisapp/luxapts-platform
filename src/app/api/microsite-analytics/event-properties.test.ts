import { describe, expect, it } from "vitest";
import { sanitizeEventProperties } from "./event-properties";

describe("sanitizeEventProperties", () => {
  it("keeps what the microsite script sends", () => {
    expect(sanitizeEventProperties("scroll_depth", { depth: 50 })).toEqual({ depth: 50 });
    expect(sanitizeEventProperties("time_on_page", { ms: 12_345 })).toEqual({ ms: 12_345 });
    expect(sanitizeEventProperties("cta_click", { label: "Tour", href: "#form" })).toEqual({
      label: "Tour",
      href: "#form",
    });
    expect(sanitizeEventProperties("form_start", undefined)).toEqual({});
  });

  it("drops a depth the stats function could not cast", () => {
    for (const depth of ["x", "50", 50.5, -1, 101, null, true, 1e30]) {
      expect(sanitizeEventProperties("scroll_depth", { depth, other: 1 })).toEqual({ other: 1 });
    }
  });

  it("drops an ms the stats function could not cast", () => {
    for (const ms of ["x", "15000", 1.5, -10, 1e30, Number.NaN, {}]) {
      expect(sanitizeEventProperties("time_on_page", { ms })).toEqual({});
    }
  });

  it("does not mutate the input", () => {
    const input = { depth: "x" };
    sanitizeEventProperties("scroll_depth", input);
    expect(input).toEqual({ depth: "x" });
  });
});
