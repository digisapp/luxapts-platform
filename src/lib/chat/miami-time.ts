import { ADMIN_TIME_ZONE, miamiDateKey, startOfMiamiDay } from "@/lib/admin/time";

/**
 * "Today" for Stacy and her Chat Log is the Miami calendar day. The server
 * runs in UTC, which turned it over at 8 PM Eastern: "ASAP" parsed to
 * tomorrow, a unit available tomorrow was called available "now", and the
 * Chat Log's Today count reset mid-evening. Same zone math as the admin's
 * owner-facing dates (src/lib/admin/time.ts).
 */

export const MIAMI_TIME_ZONE = ADMIN_TIME_ZONE;

/** Today's Miami date as YYYY-MM-DD. */
export function miamiToday(now: Date = new Date()): string {
  return miamiDateKey(now);
}

/** The instant the current Miami day began, DST included. */
export { startOfMiamiDay };
