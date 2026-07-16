import { describe, it, expect } from "vitest";
import {
  computeSlots,
  timeToMinutes,
  dayOfWeekUTC,
  type AvailabilityWindow,
} from "../tours/slots";

// 2026-08-03 is a Monday (dayOfWeek 1). Fixed "now" well before any slot.
const NOW = new Date("2026-08-03T00:00:00Z");

const monday9to5: AvailabilityWindow = {
  showerId: "shower-a",
  dayOfWeek: 1,
  startTime: "09:00",
  endTime: "17:00",
};

describe("timeToMinutes", () => {
  it("parses HH:MM and HH:MM:SS", () => {
    expect(timeToMinutes("09:30")).toBe(570);
    expect(timeToMinutes("14:00:00")).toBe(840);
  });

  it("rejects garbage", () => {
    expect(timeToMinutes("25:00")).toBeNull();
    expect(timeToMinutes("noon")).toBeNull();
  });
});

describe("dayOfWeekUTC", () => {
  it("is timezone-independent", () => {
    expect(dayOfWeekUTC("2026-08-03")).toBe(1); // Monday
    expect(dayOfWeekUTC("2026-08-09")).toBe(0); // Sunday
  });
});

describe("computeSlots", () => {
  it("returns hourly slots inside an availability window", () => {
    const days = computeSlots({ windows: [monday9to5], bookings: [], now: NOW });
    const monday = days.find((d) => d.date === "2026-08-03");
    expect(monday).toBeDefined();
    const times = monday!.slots.map((s) => s.time);
    expect(times[0]).toBe("09:00");
    expect(times[times.length - 1]).toBe("16:00"); // last full hour before 17:00
    expect(times).toHaveLength(8);
  });

  it("returns nothing when no windows exist", () => {
    expect(computeSlots({ windows: [], bookings: [], now: NOW })).toEqual([]);
  });

  it("counts overlapping showers as capacity", () => {
    const days = computeSlots({
      windows: [monday9to5, { ...monday9to5, showerId: "shower-b" }],
      bookings: [],
      now: NOW,
    });
    const slot = days[0].slots.find((s) => s.time === "10:00");
    expect(slot?.available).toBe(2);
  });

  it("subtracts existing bookings from capacity", () => {
    const days = computeSlots({
      windows: [monday9to5],
      bookings: [{ date: "2026-08-03", time: "10:00:00" }],
      now: NOW,
    });
    const times = days[0].slots.map((s) => s.time);
    expect(times).not.toContain("10:00"); // fully booked
    expect(times).toContain("11:00");
  });

  it("keeps a slot open while capacity remains", () => {
    const days = computeSlots({
      windows: [monday9to5, { ...monday9to5, showerId: "shower-b" }],
      bookings: [{ date: "2026-08-03", time: "10:00" }],
      now: NOW,
    });
    const slot = days[0].slots.find((s) => s.time === "10:00");
    expect(slot?.available).toBe(1);
  });

  it("hides slots inside the minimum lead time", () => {
    const lateNow = new Date("2026-08-03T08:00:00Z"); // 3h lead → first slot 11:00
    const days = computeSlots({ windows: [monday9to5], bookings: [], now: lateNow });
    const monday = days.find((d) => d.date === "2026-08-03");
    expect(monday!.slots[0].time).toBe("11:00");
  });

  it("only offers slots on matching weekdays", () => {
    const days = computeSlots({ windows: [monday9to5], bookings: [], now: NOW });
    // Window covers Mondays only; horizon is 7 days so exactly one Monday
    expect(days).toHaveLength(1);
    expect(days[0].date).toBe("2026-08-03");
  });

  it("aligns slots to the hour when a window starts off-hour", () => {
    const days = computeSlots({
      windows: [{ ...monday9to5, startTime: "09:30", endTime: "12:00" }],
      bookings: [],
      now: NOW,
    });
    expect(days[0].slots.map((s) => s.time)).toEqual(["10:00", "11:00"]);
  });

  it("ignores malformed booking times instead of throwing", () => {
    const days = computeSlots({
      windows: [monday9to5],
      bookings: [{ date: "2026-08-03", time: "whenever" }],
      now: NOW,
    });
    expect(days[0].slots.map((s) => s.time)).toContain("10:00");
  });
});
