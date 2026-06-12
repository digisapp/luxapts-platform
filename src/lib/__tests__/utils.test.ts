import { describe, it, expect } from "vitest";
import { formatPrice, formatDate, slugify, escapeHtml, isValidUUID, safeParseInt } from "@/lib/utils";

describe("formatPrice", () => {
  it("formats whole dollars without cents", () => {
    expect(formatPrice(2500)).toBe("$2,500");
    expect(formatPrice(0)).toBe("$0");
  });
});

describe("formatDate", () => {
  it("formats date-only strings in UTC (no day shift west of UTC)", () => {
    expect(formatDate("2026-05-01")).toBe("May 1, 2026");
    expect(formatDate("2026-12-31")).toBe("Dec 31, 2026");
  });

  it("handles invalid input", () => {
    expect(formatDate("not-a-date")).toBe("Invalid date");
  });
});

describe("slugify", () => {
  it("lowercases, strips punctuation, collapses dashes", () => {
    expect(slugify("The Towers @ Brickell!!")).toBe("the-towers-brickell");
    expect(slugify("  Hello   World  ")).toBe("hello-world");
  });
});

describe("escapeHtml", () => {
  it("escapes all dangerous characters", () => {
    expect(escapeHtml(`<script>alert("x&y'")</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&amp;y&#x27;&quot;)&lt;/script&gt;"
    );
  });

  it("returns empty string for null/undefined", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });
});

describe("isValidUUID", () => {
  it("accepts valid UUIDs", () => {
    expect(isValidUUID("63ac7c15-f49d-4a7e-a649-6335a52c94f1")).toBe(true);
  });

  it("rejects path traversal and junk", () => {
    expect(isValidUUID("../leads")).toBe(false);
    expect(isValidUUID("")).toBe(false);
    expect(isValidUUID("63ac7c15-f49d-4a7e-a649")).toBe(false);
  });
});

describe("safeParseInt", () => {
  it("parses with bounds", () => {
    expect(safeParseInt("5", 1, 0, 10)).toBe(5);
    expect(safeParseInt("99", 1, 0, 10)).toBe(10);
    expect(safeParseInt("-3", 1, 0, 10)).toBe(0);
    expect(safeParseInt("junk", 7)).toBe(7);
    expect(safeParseInt(null, 7)).toBe(7);
  });
});
