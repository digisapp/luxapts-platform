import { describe, it, expect } from "vitest";
import { SEND_WINDOW, fromLocal, isPending, localParts, scheduleReplyAt } from "@/lib/email/send-window";

/** A fixed Miami wall-clock time as an instant. */
const miami = (year: number, month: number, day: number, hour: number, minute = 0) => fromLocal({ year, month, day, hour, minute });

describe("scheduleReplyAt", () => {
  it("waits 10–20 minutes after a daytime signup", () => {
    const now = miami(2026, 10, 7, 14, 0); // 2:00 PM EDT
    const earliest = scheduleReplyAt(now, () => 0);
    const latest = scheduleReplyAt(now, () => 0.999999);
    expect((earliest.getTime() - now.getTime()) / 60_000).toBeCloseTo(SEND_WINDOW.minDelayMinutes, 5);
    expect((latest.getTime() - now.getTime()) / 60_000).toBeCloseTo(SEND_WINDOW.maxDelayMinutes, 3);
  });

  it("holds a late-night signup until 8:15–9:00 the next morning, Miami time", () => {
    const now = miami(2026, 10, 7, 23, 10);
    const first = localParts(scheduleReplyAt(now, () => 0));
    expect(first).toMatchObject({ month: 10, day: 8, hour: 8, minute: 15 });
    const last = localParts(scheduleReplyAt(now, () => 0.9999));
    expect(last).toMatchObject({ month: 10, day: 8, hour: 8, minute: 59 });
  });

  it("holds an early-morning signup until the same morning's window", () => {
    const now = miami(2026, 10, 8, 3, 0);
    expect(localParts(scheduleReplyAt(now, () => 0.5))).toMatchObject({ month: 10, day: 8, hour: 8 });
  });

  it("pushes a signup that would land just after closing to the next morning", () => {
    const now = miami(2026, 10, 7, 20, 50); // 8:50 PM + 10–20 min crosses 9 PM
    expect(localParts(scheduleReplyAt(now, () => 0.5))).toMatchObject({ day: 8, hour: 8 });
  });

  it("lets a signup just before closing go out tonight when the delay still fits", () => {
    const now = miami(2026, 10, 7, 20, 40);
    expect(localParts(scheduleReplyAt(now, () => 0))).toMatchObject({ day: 7, hour: 20, minute: 50 });
  });

  it("keeps the morning window on Miami wall-clock time across daylight saving", () => {
    const winter = localParts(scheduleReplyAt(miami(2027, 1, 12, 23, 30), () => 0));
    const summer = localParts(scheduleReplyAt(miami(2027, 7, 12, 23, 30), () => 0));
    expect(winter).toMatchObject({ hour: 8, minute: 15 });
    expect(summer).toMatchObject({ hour: 8, minute: 15 });
    // The two instants differ by an hour in UTC, since EST and EDT differ by one.
    const winterUtc = scheduleReplyAt(miami(2027, 1, 12, 23, 30), () => 0).getUTCHours();
    const summerUtc = scheduleReplyAt(miami(2027, 7, 12, 23, 30), () => 0).getUTCHours();
    expect(winterUtc - summerUtc).toBe(1);
  });

  it("rolls the morning window across a month end", () => {
    const now = miami(2026, 10, 31, 22, 0);
    expect(localParts(scheduleReplyAt(now, () => 0))).toMatchObject({ year: 2026, month: 11, day: 1, hour: 8 });
  });
});

describe("isPending", () => {
  it("is true only for a future time", () => {
    const now = new Date("2026-10-07T12:00:00Z");
    expect(isPending("2026-10-07T12:20:00Z", now)).toBe(true);
    expect(isPending("2026-10-07T11:59:00Z", now)).toBe(false);
    expect(isPending(null, now)).toBe(false);
    expect(isPending("garbage", now)).toBe(false);
  });
});
