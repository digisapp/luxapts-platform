// Move-in availability labels for the building and unit pages.
//
// `units.available_on` is a DATE column ("2026-10-08"). Two traps:
//  - `new Date("2026-10-08")` is UTC midnight, which is the evening of Oct 7
//    anywhere west of Greenwich — so the string is treated as a plain calendar
//    date and compared as a string, never as an instant.
//  - scraped dates go stale: a unit "available Feb 28" that is still listed in
//    September is available now, and showing the old date reads as an error.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "Today" is the calendar day where the building is, not where the server is:
// a UTC server would flip every date 4–7 hours early, and one fixed US zone
// would still call an LA unit "available now" three hours before its move-in
// day starts there. Keyed by state because every market sits in one zone.
const STATE_TIME_ZONES: Record<string, string> = {
  CT: "America/New_York",
  DC: "America/New_York",
  FL: "America/New_York",
  GA: "America/New_York",
  MA: "America/New_York",
  NC: "America/New_York",
  NJ: "America/New_York",
  NY: "America/New_York",
  PA: "America/New_York",
  IL: "America/Chicago",
  TN: "America/Chicago",
  TX: "America/Chicago",
  AZ: "America/Phoenix",
  CO: "America/Denver",
  CA: "America/Los_Angeles",
  NV: "America/Los_Angeles",
  OR: "America/Los_Angeles",
  WA: "America/Los_Angeles",
};

// Unknown state: the westernmost mainland zone, so a date is never called
// "now" before it has started anywhere in the lower 48.
const FALLBACK_TIME_ZONE = "America/Los_Angeles";

/** IANA zone for a US state code ("FL", "tx"); the Pacific zone when unknown. */
export function timeZoneForState(state: string | null | undefined): string {
  return (state && STATE_TIME_ZONES[state.trim().toUpperCase()]) || FALLBACK_TIME_ZONE;
}

/** Today's calendar date as YYYY-MM-DD in the given zone. */
export function todayKey(timeZone: string = FALLBACK_TIME_ZONE, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** The YYYY-MM-DD part of a date or timestamp string, or null if malformed. */
function dateKey(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export interface Availability {
  /** True when the unit can be moved into today (no date, or date ≤ today). */
  now: boolean;
  /** "Available now" or "Available Oct 8" (year added when not this year). */
  label: string;
  /** Short form for dense rows: "Now" or "Oct 8". */
  short: string;
}

export function availability(
  availableOn: string | null | undefined,
  today: string = todayKey()
): Availability {
  const key = availableOn ? dateKey(availableOn) : null;
  if (!key || key <= today) {
    return { now: true, label: "Available now", short: "Now" };
  }
  const [y, m, d] = key.split("-").map(Number);
  const sameYear = key.slice(0, 4) === today.slice(0, 4);
  const date = `${MONTHS[m - 1]} ${d}${sameYear ? "" : `, ${y}`}`;
  return { now: false, label: `Available ${date}`, short: date };
}
