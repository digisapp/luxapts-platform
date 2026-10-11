import { describe, expect, it } from "vitest";
import { SEND_WINDOW } from "@/lib/email/send-window";
import {
  ADMIN_TIME_ZONE,
  countByMiamiDay,
  dayKeysEndingAt,
  formatDayKey,
  formatMiamiDate,
  formatMiamiDateTime,
  miamiDateKey,
  startOfMiamiDay,
} from "./time";

describe("admin Miami time", () => {
  it("shares its zone with send-window, whose localParts/fromLocal it reuses", () => {
    expect(SEND_WINDOW.timeZone).toBe(ADMIN_TIME_ZONE);
  });

  it("dates an evening lead on its Miami day, not the UTC one", () => {
    expect(miamiDateKey("2026-10-10T18:00:00Z")).toBe("2026-10-10"); // 2 PM EDT
    expect(miamiDateKey("2026-10-11T02:30:00Z")).toBe("2026-10-10"); // 10:30 PM EDT
    expect(miamiDateKey("2026-12-01T04:59:00Z")).toBe("2026-11-30"); // 11:59 PM EST
  });

  it("starts the day at Miami midnight, either side of DST", () => {
    expect(startOfMiamiDay(new Date("2026-10-11T03:00:00Z")).toISOString()).toBe(
      "2026-10-10T04:00:00.000Z"
    );
    expect(startOfMiamiDay(new Date("2026-12-01T12:00:00Z")).toISOString()).toBe(
      "2026-12-01T05:00:00.000Z"
    );
    // 2026-11-01 is the fall-back day: midnight was still EDT.
    expect(startOfMiamiDay(new Date("2026-11-01T20:00:00Z")).toISOString()).toBe(
      "2026-11-01T04:00:00.000Z"
    );
  });

  it("walks date keys across month ends", () => {
    expect(dayKeysEndingAt("2026-03-02", 3)).toEqual(["2026-02-28", "2026-03-01", "2026-03-02"]);
    expect(dayKeysEndingAt("2026-10-10", 0)).toEqual([]);
  });

  it("buckets leads by Miami day over the window, today included", () => {
    const now = new Date("2026-10-11T15:00:00Z"); // 11 AM Oct 11 in Miami
    const series = countByMiamiDay(
      [
        "2026-10-09T03:00:00Z", // 11 PM Oct 8: outside a 3-day window
        "2026-10-10T18:00:00Z", // 2 PM Oct 10
        "2026-10-11T02:30:00Z", // 10:30 PM Oct 10 (Oct 11 in UTC)
        "2026-10-11T14:00:00Z", // 10 AM Oct 11
      ],
      3,
      now
    );
    expect(series).toEqual([
      { date: "2026-10-09", count: 0 },
      { date: "2026-10-10", count: 2 },
      { date: "2026-10-11", count: 1 },
    ]);
  });

  it("labels a date key as that calendar day in any browser zone", () => {
    expect(formatDayKey("2026-10-10")).toBe("Oct 10");
    expect(formatDayKey("2026-10-10", { weekday: "short", month: "short", day: "numeric" })).toBe(
      "Sat, Oct 10"
    );
  });

  it("formats server-rendered dates and times in Miami time", () => {
    expect(formatMiamiDate("2026-10-11T02:30:00Z")).toBe("Oct 10, 2026");
    expect(formatMiamiDateTime("2026-10-10T18:05:00Z")).toBe("Oct 10, 2026, 2:05 PM EDT");
  });
});
