/**
 * When Stacy's automatic reply to a new microsite lead should leave.
 *
 * Until 2026-10-07 the note went out the second the form was submitted. A
 * reply that arrives in seconds reads as an autoresponder and gets skimmed;
 * one that arrives in a quarter of an hour reads as a person who saw the
 * inquiry and wrote back. Longer than that and the renter, who fills out four
 * or five building forms in one sitting, has closed the tabs. So: a random
 * 10–20 minutes, and nothing in the middle of the night. A lead who signs up
 * at 11 PM hears from Stacy between 8:15 and 9:00 the next morning, Miami
 * time, each one at a slightly different minute so a batch of overnight
 * signups doesn't all fire at 8:15:00.
 *
 * The chosen instant is handed to Resend as `scheduledAt`, so nothing here
 * needs a queue or a cron.
 */

export const SEND_WINDOW = {
  timeZone: "America/New_York",
  /** Shortest and longest wait after a daytime signup, in minutes. */
  minDelayMinutes: 10,
  maxDelayMinutes: 20,
  /** A note may leave from this hour (inclusive) up to this hour (exclusive), local time. */
  openHour: 8,
  closeHour: 21,
  /** Overnight signups are answered between these local minutes-after-midnight. */
  morningFromMinute: 8 * 60 + 15,
  morningToMinute: 9 * 60,
} as const;

interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
}

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: SEND_WINDOW.timeZone,
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
});

/** Wall-clock components of `at` in the send window's time zone. */
export function localParts(at: Date): LocalParts {
  const parts: Record<string, number> = {};
  for (const p of partsFormatter.formatToParts(at)) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute };
}

/** The UTC instant for a local wall-clock time (DST handled by probing the zone's offset). */
export function fromLocal(p: LocalParts): Date {
  const guess = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  const offsetAt = (ms: number) => {
    const l = localParts(new Date(ms));
    return Date.UTC(l.year, l.month - 1, l.day, l.hour, l.minute) - ms;
  };
  let result = guess - offsetAt(guess);
  // Near a DST switch the offset can differ at the corrected instant; one more pass settles it.
  result = guess - offsetAt(result);
  return new Date(result);
}

/**
 * The instant to send a reply to a signup that happened at `now`.
 * `rng` returns [0, 1) and is injectable for tests.
 */
export function scheduleReplyAt(now: Date = new Date(), rng: () => number = Math.random): Date {
  const { minDelayMinutes, maxDelayMinutes, openHour, closeHour, morningFromMinute, morningToMinute } = SEND_WINDOW;
  const delayMs = (minDelayMinutes + rng() * (maxDelayMinutes - minDelayMinutes)) * 60_000;
  const candidate = new Date(now.getTime() + delayMs);
  const local = localParts(candidate);
  if (local.hour >= openHour && local.hour < closeHour) return candidate;

  // Too early or too late: the next morning window. "Next" is today when it
  // is still before opening, tomorrow when it is after closing.
  const dayShift = local.hour < openHour ? 0 : 1;
  const minuteOfDay = morningFromMinute + rng() * (morningToMinute - morningFromMinute);
  const base = Date.UTC(local.year, local.month - 1, local.day + dayShift);
  const d = new Date(base);
  return fromLocal({
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: Math.floor(minuteOfDay / 60),
    minute: Math.floor(minuteOfDay % 60),
  });
}

/** Is a stored scheduled time still in the future? */
export function isPending(scheduledAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!scheduledAt) return false;
  const t = new Date(scheduledAt).getTime();
  return Number.isFinite(t) && t > now.getTime();
}
