import { describe, expect, it } from "vitest";
import { availability, timeZoneForState, todayKey } from "./availability";

describe("availability", () => {
  const today = "2026-09-29";

  it("treats a missing date as available now", () => {
    expect(availability(null, today)).toEqual({ now: true, label: "Available now", short: "Now" });
    expect(availability(undefined, today).now).toBe(true);
  });

  it("treats past dates and today as available now", () => {
    expect(availability("2026-02-28", today).label).toBe("Available now");
    expect(availability("2026-09-26", today).label).toBe("Available now");
    expect(availability("2026-09-29", today).label).toBe("Available now");
  });

  it("formats future dates as calendar dates without a UTC shift", () => {
    expect(availability("2026-09-30", today)).toEqual({
      now: false,
      label: "Available Sep 30",
      short: "Sep 30",
    });
    expect(availability("2026-10-01", today).short).toBe("Oct 1");
  });

  it("adds the year for dates in another year", () => {
    expect(availability("2027-01-15", today).label).toBe("Available Jan 15, 2027");
  });

  it("accepts timestamp strings", () => {
    expect(availability("2026-10-08T00:00:00+00:00", today).short).toBe("Oct 8");
  });

  it("falls back to available now for malformed input", () => {
    expect(availability("Spring", today).now).toBe(true);
  });
});

describe("todayKey", () => {
  it("uses the building's calendar day, not UTC", () => {
    // 02:00 UTC on Sep 30 is still Sep 29 in Miami
    expect(todayKey("America/New_York", new Date("2026-09-30T02:00:00Z"))).toBe("2026-09-29");
    expect(todayKey("America/New_York", new Date("2026-09-30T05:00:00Z"))).toBe("2026-09-30");
  });

  it("does not call an LA date 'now' while it is still the day before in LA", () => {
    // 05:30 UTC Oct 8 = 01:30 Oct 8 in New York, 22:30 Oct 7 in Los Angeles
    const now = new Date("2026-10-08T05:30:00Z");
    expect(availability("2026-10-08", todayKey(timeZoneForState("NY"), now)).now).toBe(true);
    expect(availability("2026-10-08", todayKey(timeZoneForState("CA"), now)).now).toBe(false);
  });
});

describe("timeZoneForState", () => {
  it("maps the markets' states and falls back to Pacific", () => {
    expect(timeZoneForState("FL")).toBe("America/New_York");
    expect(timeZoneForState("tx")).toBe("America/Chicago");
    expect(timeZoneForState("TN")).toBe("America/Chicago");
    expect(timeZoneForState("CA")).toBe("America/Los_Angeles");
    expect(timeZoneForState(null)).toBe("America/Los_Angeles");
    expect(timeZoneForState("ZZ")).toBe("America/Los_Angeles");
  });
});
