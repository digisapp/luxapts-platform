import { describe, it, expect } from "vitest";
import { createLeadSchema, analyticsTrackSchema } from "@/lib/validations";

const BASE_LEAD = { source: "web_form" as const, city_slug: "miami" };

describe("createLeadSchema contactability", () => {
  it("rejects a lead with neither email nor phone (DB CHECK would 500)", () => {
    const result = createLeadSchema.safeParse({ ...BASE_LEAD, name: "Nobody" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Email or phone is required");
    }
  });

  it("accepts email-only and phone-only leads", () => {
    expect(
      createLeadSchema.safeParse({ ...BASE_LEAD, email: "a@b.com" }).success
    ).toBe(true);
    expect(
      createLeadSchema.safeParse({ ...BASE_LEAD, phone: "305-555-0100" }).success
    ).toBe(true);
  });

  it("keeps beds: 0 (studio) rather than dropping it", () => {
    const result = createLeadSchema.safeParse({
      ...BASE_LEAD,
      email: "a@b.com",
      beds: 0,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.beds).toBe(0);
      // `||` collapses 0 to null — the insert must use `??`.
      expect(result.data.beds ?? null).toBe(0);
    }
  });
});

describe("analyticsTrackSchema", () => {
  it("rejects a payload with no data object instead of throwing", () => {
    expect(
      analyticsTrackSchema.safeParse({ type: "page_view", session_id: "abcdef123" }).success
    ).toBe(false);
    expect(
      analyticsTrackSchema.safeParse({
        type: "page_view",
        session_id: "abcdef123",
        data: "not-an-object",
      }).success
    ).toBe(false);
    expect(analyticsTrackSchema.safeParse(null).success).toBe(false);
    expect(analyticsTrackSchema.safeParse({ type: "unknown_type" }).success).toBe(false);
  });

  it("accepts the payloads the useAnalytics hook actually sends", () => {
    expect(
      analyticsTrackSchema.safeParse({
        type: "page_view",
        session_id: "1757894400000-abc123",
        data: { path: "/buildings/x", referrer: undefined, city_slug: "miami" },
      }).success
    ).toBe(true);

    expect(
      analyticsTrackSchema.safeParse({
        type: "building_view",
        session_id: "1757894400000-abc123",
        data: { building_id: "11111111-1111-4111-8111-111111111111", source: "search" },
      }).success
    ).toBe(true);

    expect(
      analyticsTrackSchema.safeParse({
        type: "event",
        session_id: "1757894400000-abc123",
        data: { event_name: "search", event_category: "engagement", properties: { n: 3 } },
      }).success
    ).toBe(true);

    expect(
      analyticsTrackSchema.safeParse({
        type: "session",
        session_id: "1757894400000-abc123",
        data: { landing_page: "/", utm_source: "ig" },
      }).success
    ).toBe(true);
  });

  it("rejects a building_view whose building_id is not a UUID", () => {
    expect(
      analyticsTrackSchema.safeParse({
        type: "building_view",
        session_id: "1757894400000-abc123",
        data: { building_id: "'; drop table units; --" },
      }).success
    ).toBe(false);
  });
});
