import { availability } from "../availability";
import type { UnitRowData } from "./UnitRow";

/** The unit columns a row needs; both pages select at least these. */
export interface UnitRowSource {
  id: string;
  unit_number: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  available_on: string | null;
}

/**
 * One row for the building page's unit list and the unit page's "More units".
 * Resolved on the server so the client list never re-derives dates.
 */
export function toUnitRowData(
  u: UnitRowSource,
  opts: {
    basePath: string;
    /** YYYY-MM-DD in the building's time zone (todayKey) */
    today: string;
    /** Verified rent only */
    price: number | null;
    planName: string | null;
    photos?: { url: string }[];
  }
): UnitRowData {
  const avail = availability(u.available_on, opts.today);
  const photos = opts.photos ?? [];
  return {
    id: u.id,
    href: `${opts.basePath}/units/${u.id}`,
    unitNumber: u.unit_number,
    planName: opts.planName,
    beds: u.beds,
    baths: u.baths,
    sqft: u.sqft,
    price: opts.price,
    availableOn: u.available_on,
    availableNow: avail.now,
    availableLabel: avail.now ? avail.label : `From ${avail.short}`,
    photoUrl: photos[0]?.url ?? null,
    photoCount: photos.length,
  };
}

/** Cheapest verified rent first; unpriced units after, smallest layout first. */
export function compareUnitRows(a: UnitRowData, b: UnitRowData): number {
  if (a.price != null && b.price != null && a.price !== b.price) return a.price - b.price;
  if (a.price != null && b.price == null) return -1;
  if (a.price == null && b.price != null) return 1;
  return (
    (a.beds ?? 99) - (b.beds ?? 99) ||
    (a.sqft ?? 0) - (b.sqft ?? 0) ||
    (a.unitNumber ?? "").localeCompare(b.unitNumber ?? "", undefined, { numeric: true })
  );
}

/**
 * For "More units" on a unit page: the same layout first, then by rent. A unit
 * with unknown beds has no "same layout" — grouping nulls together would pin
 * unrelated units above cheaper ones.
 */
export function compareSiblingRows(beds: number | null) {
  const same = (u: UnitRowData) => beds != null && u.beds === beds;
  return (a: UnitRowData, b: UnitRowData) =>
    Number(same(b)) - Number(same(a)) || compareUnitRows(a, b);
}
