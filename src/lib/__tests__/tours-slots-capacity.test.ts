import { describe, it, expect } from "vitest";
import { computeSlots, type AvailabilityWindow } from "../tours/slots";

// 2026-08-03 is a Monday (dayOfWeek 1). Fixed "now" well before any slot.
const NOW = new Date("2026-08-03T00:00:00Z");

const window = (showerId: string): AvailabilityWindow => ({
  showerId,
  dayOfWeek: 1,
  startTime: "09:00",
  endTime: "17:00",
});

const slotAt = (time: string, windows: AvailabilityWindow[], bookings: Parameters<typeof computeSlots>[0]["bookings"]) =>
  computeSlots({ windows, bookings, now: NOW })[0]?.slots.find((s) => s.time === time);

describe("computeSlots — per-shower capacity", () => {
  it("removes only the shower who is actually booked", () => {
    // Shower A is showing another building at 10:00; B is still free.
    const slot = slotAt("10:00", [window("a"), window("b")], [
      { date: "2026-08-03", time: "10:00", showerId: "a" },
    ]);
    expect(slot?.available).toBe(1);
  });

  it("closes the slot when every covering shower is booked elsewhere", () => {
    // The double-booking bug: capacity counted A and B as free because their
    // bookings were at a DIFFERENT building, so this slot stayed open and the
    // same shower was booked twice at the same hour.
    const slot = slotAt("10:00", [window("a"), window("b")], [
      { date: "2026-08-03", time: "10:00", showerId: "a" },
      { date: "2026-08-03", time: "10:00", showerId: "b" },
    ]);
    expect(slot).toBeUndefined();
  });

  it("does not count one shower's booking twice", () => {
    const slot = slotAt("10:00", [window("a"), window("b")], [
      { date: "2026-08-03", time: "10:00", showerId: "a" },
      { date: "2026-08-03", time: "10:00", showerId: "a" },
    ]);
    expect(slot?.available).toBe(1);
  });

  it("only affects the booked hour", () => {
    const slot = slotAt("11:00", [window("a"), window("b")], [
      { date: "2026-08-03", time: "10:00", showerId: "a" },
      { date: "2026-08-03", time: "10:00", showerId: "b" },
    ]);
    expect(slot?.available).toBe(2);
  });

  it("only affects the booked date", () => {
    const slot = slotAt("10:00", [window("a")], [
      { date: "2026-08-10", time: "10:00", showerId: "a" },
    ]);
    expect(slot?.available).toBe(1);
  });

  it("ignores a booking by a shower who is not certified here", () => {
    const slot = slotAt("10:00", [window("a")], [
      { date: "2026-08-03", time: "10:00", showerId: "stranger" },
    ]);
    expect(slot?.available).toBe(1);
  });

  it("still subtracts unassigned (open) leads generically", () => {
    // An open lead at THIS building has no claim yet, but one of these
    // showers will take it.
    const slot = slotAt("10:00", [window("a"), window("b")], [{ date: "2026-08-03", time: "10:00" }]);
    expect(slot?.available).toBe(1);
  });

  it("combines a named booking with an open lead", () => {
    const slot = slotAt("10:00", [window("a"), window("b")], [
      { date: "2026-08-03", time: "10:00", showerId: "a" },
      { date: "2026-08-03", time: "10:00" },
    ]);
    expect(slot).toBeUndefined();
  });

  it("normalizes HH:MM:SS booking times", () => {
    const slot = slotAt("10:00", [window("a"), window("b")], [
      { date: "2026-08-03", time: "10:00:00", showerId: "a" },
    ]);
    expect(slot?.available).toBe(1);
  });
});
