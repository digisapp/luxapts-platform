/**
 * Validation for a move-in date that came back from the query parser.
 *
 * The availability filter is `available_on IS NULL OR available_on <= date`,
 * so a hallucinated date never errors — it silently reshapes every result.
 * A year the model invented ("2025-11-01" for "moving in November") quietly
 * drops most inventory; a far-future one quietly disables the filter. Both
 * look like a working search returning the wrong apartments, so the date is
 * only trusted when it is a real calendar day inside a plausible leasing
 * window.
 */

/** Strict YYYY-MM-DD — the shape `searchRequestSchema` requires. */
export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A stale "ASAP" may sit slightly in the past; a year-off date may not. */
export const MOVE_IN_PAST_GRACE_DAYS = 31;
/** Nobody is searching today for a lease starting more than two years out. */
export const MOVE_IN_MAX_AHEAD_DAYS = 730;

const MS_PER_DAY = 86_400_000;

/**
 * @param value  Candidate date from the model, any type.
 * @param today  Today as YYYY-MM-DD, the same value given to the prompt.
 * @returns The date when it is usable, otherwise null.
 */
export function sanitizeMoveInDate(value: unknown, today: string): string | null {
  if (typeof value !== "string" || !ISO_DATE_RE.test(value)) return null;

  const requested = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(requested.getTime())) return null;
  // `new Date("2026-02-31")` rolls forward to March rather than throwing, so
  // round-trip it to reject days that never existed.
  if (requested.toISOString().slice(0, 10) !== value) return null;

  const base = new Date(`${today}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) return null;

  const daysOut = (requested.getTime() - base.getTime()) / MS_PER_DAY;
  if (daysOut < -MOVE_IN_PAST_GRACE_DAYS || daysOut > MOVE_IN_MAX_AHEAD_DAYS) return null;

  return value;
}
