import { describe, it, expect } from "vitest";
import {
  PAGE_SIZE,
  buildConversationsHref,
  conversionRate,
  formatToolArgs,
  isMissingSchemaError,
  parseReviewFilter,
  parseSurface,
  relativeTime,
  sanitizeSearchTerm,
  totalPages,
} from "@/components/admin/conversations/helpers";

describe("sanitizeSearchTerm", () => {
  it("keeps an ordinary search intact", () => {
    expect(sanitizeSearchTerm("2 bed in brickell")).toBe("2 bed in brickell");
  });

  it("strips LIKE wildcards and PostgREST filter separators", () => {
    // Every one of these can rewrite an .ilike()/.or() expression.
    expect(sanitizeSearchTerm(`a%b_c\\d,e(f)g"h`)).toBe("abcdefgh");
  });

  it("neutralises an attempt to inject an extra filter clause", () => {
    const sanitized = sanitizeSearchTerm(`x%,lead_id.not.is.null,first_question.ilike.%`);
    expect(sanitized).not.toContain(",");
    expect(sanitized).not.toContain("%");
  });

  it("trims and caps length, and tolerates non-strings", () => {
    expect(sanitizeSearchTerm("   padded   ")).toBe("padded");
    expect(sanitizeSearchTerm("a".repeat(500)).length).toBe(100);
    expect(sanitizeSearchTerm(null)).toBe("");
    expect(sanitizeSearchTerm(undefined)).toBe("");
  });
});

describe("parseSurface / parseReviewFilter", () => {
  it("accepts only the whitelisted values", () => {
    expect(parseSurface("chat")).toBe("chat");
    expect(parseSurface("voice")).toBe("voice");
    expect(parseSurface("sms")).toBeNull();
    expect(parseSurface(null)).toBeNull();

    expect(parseReviewFilter("needs_review")).toBe("needs_review");
    expect(parseReviewFilter("converted")).toBe("converted");
    expect(parseReviewFilter("everything")).toBeNull();
    expect(parseReviewFilter(undefined)).toBeNull();
  });
});

describe("isMissingSchemaError", () => {
  it("recognises the codes that mean migration 025 has not been applied", () => {
    expect(isMissingSchemaError({ code: "42703" })).toBe(true); // undefined column
    expect(isMissingSchemaError({ code: "42P01" })).toBe(true); // undefined table
    expect(isMissingSchemaError({ code: "PGRST204" })).toBe(true);
    expect(isMissingSchemaError({ code: "PGRST205" })).toBe(true);
  });

  it("does not mistake other failures for a missing migration", () => {
    expect(isMissingSchemaError({ code: "22P02" })).toBe(false);
    expect(isMissingSchemaError({ message: "boom" })).toBe(false);
    expect(isMissingSchemaError(null)).toBe(false);
    expect(isMissingSchemaError(undefined)).toBe(false);
    expect(isMissingSchemaError("42703")).toBe(false);
  });
});

describe("relativeTime", () => {
  const now = Date.parse("2026-09-15T12:00:00.000Z");

  it("describes recent timestamps", () => {
    expect(relativeTime("2026-09-15T11:59:30.000Z", now)).toBe("just now");
    expect(relativeTime("2026-09-15T11:45:00.000Z", now)).toBe("15m ago");
    expect(relativeTime("2026-09-15T09:00:00.000Z", now)).toBe("3h ago");
    expect(relativeTime("2026-09-13T12:00:00.000Z", now)).toBe("2d ago");
  });

  it("clamps future timestamps instead of printing a negative age", () => {
    expect(relativeTime("2026-09-15T12:05:00.000Z", now)).toBe("just now");
  });

  it("returns an empty string for missing or unparseable input", () => {
    expect(relativeTime(null, now)).toBe("");
    expect(relativeTime("", now)).toBe("");
    expect(relativeTime("not-a-date", now)).toBe("");
  });
});

describe("buildConversationsHref", () => {
  it("returns the bare path when nothing is filtered", () => {
    expect(buildConversationsHref({})).toBe("/admin/conversations");
    expect(buildConversationsHref({ page: 1 })).toBe("/admin/conversations");
  });

  it("carries surface, filter, search and page", () => {
    expect(
      buildConversationsHref({ surface: "voice", filter: "needs_review", q: "brickell", page: 3 }),
    ).toBe("/admin/conversations?surface=voice&filter=needs_review&q=brickell&page=3");
  });

  it("drops an empty search and url-encodes the rest", () => {
    expect(buildConversationsHref({ q: "   " })).toBe("/admin/conversations");
    expect(buildConversationsHref({ q: "2 bed" })).toBe("/admin/conversations?q=2+bed");
  });
});

describe("totalPages / conversionRate", () => {
  it("never reports fewer than one page", () => {
    expect(totalPages(0)).toBe(1);
    expect(totalPages(-5)).toBe(1);
    expect(totalPages(Number.NaN)).toBe(1);
    expect(totalPages(PAGE_SIZE)).toBe(1);
    expect(totalPages(PAGE_SIZE + 1)).toBe(2);
  });

  it("rounds the conversion rate and survives a zero denominator", () => {
    expect(conversionRate(0, 0)).toBe(0);
    expect(conversionRate(1, 3)).toBe(33);
    expect(conversionRate(7, 10)).toBe(70);
  });
});

describe("formatToolArgs", () => {
  it("pretty-prints jsonb arguments", () => {
    expect(formatToolArgs({ city: "miami", beds: 2 })).toBe(
      '{\n  "city": "miami",\n  "beds": 2\n}',
    );
  });

  it("returns an empty string when there is nothing to show", () => {
    expect(formatToolArgs(null)).toBe("");
    expect(formatToolArgs(undefined)).toBe("");
  });

  it("truncates very large payloads", () => {
    const big = { note: "x".repeat(10_000) };
    const out = formatToolArgs(big);
    expect(out.length).toBeLessThan(4_100);
    expect(out.endsWith("…[truncated]")).toBe(true);
  });

  it("never throws on circular jsonb", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(formatToolArgs(circular)).toBe("[arguments could not be displayed]");
  });
});
