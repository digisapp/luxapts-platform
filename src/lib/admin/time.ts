// Owner-facing dates in the admin are Miami dates. The server renders in UTC,
// so toLocaleString() and setHours(0, 0, 0, 0) there moved an evening lead to
// the next day, and new Date("2026-10-10") in the browser is UTC midnight,
// which labelled that day's chart point "Oct 9". The zone math reuses what the
// app already has: todayKey (buildings/availability) and send-window's
// localParts/fromLocal, which are pinned to America/New_York.

import { todayKey } from "@/app/buildings/availability";
import { fromLocal, localParts } from "@/lib/email/send-window";

export const ADMIN_TIME_ZONE = "America/New_York";

/** The Miami calendar date ("2026-10-10") of an instant. */
export function miamiDateKey(at: Date | string): string {
  return todayKey(ADMIN_TIME_ZONE, typeof at === "string" ? new Date(at) : at);
}

/** The instant the current Miami day began, DST included. */
export function startOfMiamiDay(now: Date = new Date()): Date {
  const { year, month, day } = localParts(now);
  return fromLocal({ year, month, day, hour: 0, minute: 0 });
}

/** `count` consecutive date keys ending with `lastKey`, oldest first. */
export function dayKeysEndingAt(lastKey: string, count: number): string[] {
  const [y, m, d] = lastKey.split("-").map(Number);
  return Array.from({ length: Math.max(0, count) }, (_, i) =>
    new Date(Date.UTC(y, m - 1, d - (count - 1 - i))).toISOString().slice(0, 10)
  );
}

/** Rows per Miami day for the last `days` days, today included, oldest first. */
export function countByMiamiDay(
  timestamps: string[],
  days: number,
  now: Date = new Date()
): { date: string; count: number }[] {
  const counts = new Map(dayKeysEndingAt(miamiDateKey(now), days).map((k) => [k, 0]));
  for (const ts of timestamps) {
    const key = miamiDateKey(ts);
    const n = counts.get(key);
    if (n !== undefined) counts.set(key, n + 1);
  }
  return Array.from(counts, ([date, count]) => ({ date, count }));
}

/** "Oct 10" for a date key, read as a calendar date rather than UTC midnight. */
export function formatDayKey(
  key: string,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }
): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d))
  );
}

/** "Oct 10, 2026" in Miami time, for server-rendered dates. */
export function formatMiamiDate(at: string | Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: ADMIN_TIME_ZONE,
  }).format(new Date(at));
}

/** "Oct 10, 2026, 2:05 PM EDT" in Miami time, for server-rendered timestamps. */
export function formatMiamiDateTime(at: string | Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: ADMIN_TIME_ZONE,
    timeZoneName: "short",
  }).format(new Date(at));
}
