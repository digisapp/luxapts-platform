import { describe, it, expect } from "vitest";
import {
  CANCEL_WINDOW_DAYS,
  LATE_CANCEL_HOURS,
  MAX_RECENT_CANCELS,
  cancelNoticeHours,
  cancelWindowStart,
  claimBlockedByCancels,
  showingStartsAt,
  storedNoticeHours,
} from "../shower/claim-rules";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe("showingStartsAt", () => {
  it("reads the naive date + time as Miami wall clock (EDT, UTC-4)", () => {
    expect(showingStartsAt("2026-10-12", "15:00:00")?.toISOString()).toBe("2026-10-12T19:00:00.000Z");
  });

  it("uses EST (UTC-5) in winter", () => {
    expect(showingStartsAt("2026-12-01", "09:30")?.toISOString()).toBe("2026-12-01T14:30:00.000Z");
  });

  it("is DST-correct on both switch days", () => {
    // 2026-03-08: clocks spring forward at 2am → afternoon is EDT.
    expect(showingStartsAt("2026-03-08", "15:00")?.toISOString()).toBe("2026-03-08T19:00:00.000Z");
    // 2026-11-01: clocks fall back at 2am → afternoon is EST.
    expect(showingStartsAt("2026-11-01", "15:00")?.toISOString()).toBe("2026-11-01T20:00:00.000Z");
  });

  it("handles midnight and the day boundary", () => {
    expect(showingStartsAt("2026-10-12", "00:00")?.toISOString()).toBe("2026-10-12T04:00:00.000Z");
    expect(showingStartsAt("2026-10-12", "23:00")?.toISOString()).toBe("2026-10-13T03:00:00.000Z");
  });

  it("rejects malformed input", () => {
    expect(showingStartsAt("10/12/2026", "15:00")).toBeNull();
    expect(showingStartsAt("2026-10-12", "3pm")).toBeNull();
  });
});

describe("cancelNoticeHours", () => {
  it("measures notice against the Miami-local showing time", () => {
    // 3pm Miami showing, cancelled at 10am Miami (14:00Z): 5h notice. Parsed
    // as UTC (the old bug) it came out at 1h and earned a late-cancel strike.
    const now = new Date("2026-10-12T14:00:00Z");
    const notice = cancelNoticeHours("2026-10-12", "15:00:00", now);
    expect(notice).toBeCloseTo(5, 5);
    expect(notice < LATE_CANCEL_HOURS).toBe(false);
  });

  it("still flags a genuinely late cancel", () => {
    const now = new Date("2026-10-12T18:00:00Z"); // 2pm Miami
    expect(cancelNoticeHours("2026-10-12", "15:00", now)).toBeCloseTo(1, 5);
  });

  it("goes negative once the showing has started", () => {
    const now = new Date("2026-10-12T20:00:00Z");
    expect(cancelNoticeHours("2026-10-12", "15:00", now)).toBeCloseTo(-1, 5);
  });

  it("falls back to plenty of notice when the time is missing", () => {
    expect(cancelNoticeHours(null, "15:00")).toBe(99);
    expect(cancelNoticeHours("2026-10-12", undefined)).toBe(99);
    expect(cancelNoticeHours("garbage", "15:00")).toBe(99);
  });
});

describe("storedNoticeHours", () => {
  it("clamps into numeric(4,1)", () => {
    expect(storedNoticeHours(-3)).toBe(0);
    expect(storedNoticeHours(5.04)).toBe(5);
    expect(storedNoticeHours(1500)).toBe(999.9);
    expect(storedNoticeHours(Number.NaN)).toBe(0);
  });
});

describe("cancelWindowStart", () => {
  it("is CANCEL_WINDOW_DAYS before now", () => {
    const now = new Date("2026-10-12T12:00:00Z");
    expect(cancelWindowStart(now)).toBe(new Date(now.getTime() - CANCEL_WINDOW_DAYS * DAY).toISOString());
  });
});

describe("claimBlockedByCancels", () => {
  const now = new Date("2026-10-12T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  it("allows a shower with no cancels", () => {
    expect(claimBlockedByCancels({ cancelledThisLeadBefore: false, recentCancelledAt: [], now })).toBeNull();
  });

  it("never lets a shower re-claim a lead they cancelled", () => {
    const block = claimBlockedByCancels({ cancelledThisLeadBefore: true, recentCancelledAt: [], now });
    expect(block?.status).toBe(409);
  });

  it("allows up to the cap minus one recent cancel", () => {
    const recent = Array.from({ length: MAX_RECENT_CANCELS - 1 }, (_, i) => ago((i + 1) * HOUR));
    expect(claimBlockedByCancels({ cancelledThisLeadBefore: false, recentCancelledAt: recent, now })).toBeNull();
  });

  it("pauses claiming at the cap and says when it lifts", () => {
    const recent = [ago(6 * DAY), ago(1 * HOUR)];
    expect(recent.length).toBe(MAX_RECENT_CANCELS);
    const block = claimBlockedByCancels({ cancelledThisLeadBefore: false, recentCancelledAt: recent, now });
    expect(block?.status).toBe(429);
    // The 6-day-old cancel ages out in 1 day.
    expect(block?.error).toMatch(/in 1 day\./);
  });

  it("waits for enough cancels to age out when over the cap", () => {
    const recent = [ago(6 * DAY), ago(5 * DAY), ago(2 * DAY)];
    const block = claimBlockedByCancels({ cancelledThisLeadBefore: false, recentCancelledAt: recent, now });
    // Needs the 6d and 5d ones gone → 2 days.
    expect(block?.error).toMatch(/in 2 days\./);
  });

  it("ignores cancels outside the window and null timestamps", () => {
    const recent = [ago(8 * DAY), null, ago(1 * HOUR)];
    expect(claimBlockedByCancels({ cancelledThisLeadBefore: false, recentCancelledAt: recent, now })).toBeNull();
  });
});
