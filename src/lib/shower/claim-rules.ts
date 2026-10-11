// Pure rules for claiming and cancelling showing leads. Kept free of I/O so
// the claim route stays thin and the rules are unit-testable.

/**
 * showing_leads.preferred_date / preferred_time are naive wall-clock values,
 * Miami-local by convention (see src/lib/tours/slots.ts). Every building the
 * shower program serves is in this zone.
 */
export const SHOWING_TIME_ZONE = "America/New_York";

/** Cancelling with less notice than this issues a late_cancel strike. */
export const LATE_CANCEL_HOURS = 2;

/**
 * Claim-then-cancel cap. Claiming a lead is what reveals the renter's name,
 * email and phone, and a cancel with ≥2h notice carries no strike, so without
 * a cap one shower could claim → cancel every open lead in turn and harvest
 * all of their contact details. Rule: a shower who has cancelled
 * MAX_RECENT_CANCELS claims within the last CANCEL_WINDOW_DAYS days can't
 * claim another lead until the oldest of those cancels ages out, and nobody
 * can re-claim a lead they cancelled themselves. That bounds a harvester to
 * MAX_RECENT_CANCELS + 1 leads a week (plus admin attention) without adding
 * strikes beyond the late-cancel rule in the contractor agreement.
 */
export const MAX_RECENT_CANCELS = 2;
export const CANCEL_WINDOW_DAYS = 7;
const CANCEL_WINDOW_MS = CANCEL_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/** Start of the cancel-cap window, as an ISO timestamp for the query. */
export function cancelWindowStart(now: Date = new Date()): string {
  return new Date(now.getTime() - CANCEL_WINDOW_MS).toISOString();
}

const zoneFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: SHOWING_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});

/** Offset (ms) of SHOWING_TIME_ZONE from UTC at the instant `ms`. */
function zoneOffsetMs(ms: number): number {
  const p: Record<string, number> = {};
  for (const part of zoneFormatter.formatToParts(new Date(ms))) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wall - Math.floor(ms / 1000) * 1000;
}

/**
 * The instant a showing starts, reading its naive date + time as Miami wall
 * clock (DST-correct). `new Date("2026-10-12T15:00")` would read it in the
 * server's zone — UTC on Vercel — putting every showing 4–5 hours early.
 * Returns null for unparseable input.
 */
export function showingStartsAt(date: string, time: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})(?::(\d{2}))?/.exec(time);
  if (!d || !t) return null;
  const guess = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2], t[3] ? +t[3] : 0);
  if (!Number.isFinite(guess)) return null;
  let result = guess - zoneOffsetMs(guess);
  // Near a DST switch the offset can differ at the corrected instant; one more pass settles it.
  result = guess - zoneOffsetMs(result);
  return new Date(result);
}

/**
 * Hours between `now` and the showing's start. Falls back to plenty of notice
 * (no strike) when the showing time is missing or malformed.
 */
export function cancelNoticeHours(
  date: string | null | undefined,
  time: string | null | undefined,
  now: Date = new Date()
): number {
  const startsAt = date && time ? showingStartsAt(date, time) : null;
  if (!startsAt) return 99;
  return (startsAt.getTime() - now.getTime()) / (1000 * 60 * 60);
}

/**
 * showing_claims.cancel_notice_hours is numeric(4,1): anything ≥ 1000 would
 * overflow and fail the cancel. Clamp into range.
 */
export function storedNoticeHours(noticeHours: number): number {
  if (!Number.isFinite(noticeHours)) return 0;
  return Math.min(999.9, Math.max(0, Math.round(noticeHours * 10) / 10));
}

export interface ClaimBlock {
  error: string;
  status: number;
}

/**
 * Whether this shower's cancel history bars them from claiming a lead.
 * `recentCancelledAt` = cancelled_at of their cancels inside the window.
 */
export function claimBlockedByCancels(opts: {
  cancelledThisLeadBefore: boolean;
  recentCancelledAt: Array<string | null>;
  now?: Date;
}): ClaimBlock | null {
  const now = opts.now ?? new Date();
  if (opts.cancelledThisLeadBefore) {
    return {
      error: "You cancelled this showing earlier and can't claim it again.",
      status: 409,
    };
  }

  const windowStart = now.getTime() - CANCEL_WINDOW_MS;
  const recent = opts.recentCancelledAt
    .map((iso) => (iso ? new Date(iso).getTime() : NaN))
    .filter((ms) => Number.isFinite(ms) && ms >= windowStart)
    .sort((a, b) => a - b);

  if (recent.length < MAX_RECENT_CANCELS) return null;

  // Claims reopen once enough of the recent cancels have aged out.
  const unblockAt = recent[recent.length - MAX_RECENT_CANCELS] + CANCEL_WINDOW_MS;
  const days = Math.max(1, Math.ceil((unblockAt - now.getTime()) / (24 * 60 * 60 * 1000)));
  return {
    error: `You've cancelled ${recent.length} showings in the last ${CANCEL_WINDOW_DAYS} days. You can claim new leads again in ${days} day${days === 1 ? "" : "s"}.`,
    status: 429,
  };
}
