import { INVENTORY_MAX_AGE_DAYS } from "@/lib/microsite-inventory";

/**
 * What Stacy may say out loud on a phone call.
 *
 * Most "available" units in the catalog were never priced by a scrape (template
 * floorplans with random rents, and 12-per-building generated units, all priced
 * January 2026). On the website that is a bad listing; spoken on a call it is a
 * promise to a real person. So the phone agent only ever sees units whose price
 * was captured recently, using the same cutoff the microsites use.
 */

const DAY_MS = 86_400_000;

export function isVerifiedPrice(
  rent: unknown,
  capturedAt: unknown,
  now: Date = new Date()
): boolean {
  if (typeof rent !== "number" || !(rent > 0)) return false;
  if (typeof capturedAt !== "string") return false;
  const captured = new Date(capturedAt).getTime();
  if (Number.isNaN(captured)) return false;
  return captured >= now.getTime() - INVENTORY_MAX_AGE_DAYS * DAY_MS;
}

type Row = Record<string, unknown>;

/** A past move-in date means "now"; saying "available May 11th" in September is wrong. */
export function spokenAvailability(availableOn: unknown, now: Date = new Date()): string | null {
  if (typeof availableOn !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(availableOn)) return null;
  return availableOn.slice(0, 10) <= now.toISOString().slice(0, 10) ? "now" : availableOn.slice(0, 10);
}

/** Scraper filler ("Not specified in provided HTML") is worse than silence. */
export function policyText(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return /not specified|provided html|n\/a/i.test(value) ? null : value.trim();
}

/** Spoken results are short: a caller cannot skim a list of 25. */
export const MAX_SPOKEN_RESULTS = 5;

/** Keep only verified units from a compacted search_listings result. */
export function verifiedSearchResults(
  result: unknown,
  sort: string = "best_match",
  now: Date = new Date()
): unknown {
  if (!result || typeof result !== "object" || !Array.isArray((result as Row).results)) {
    return result;
  }
  const all = (result as { results: Row[] }).results;
  const verified = all.filter((r) => isVerifiedPrice(r.rent, r.price_captured_at, now));
  if (sort === "price_low") verified.sort((a, b) => Number(a.rent) - Number(b.rent));
  if (sort === "price_high") verified.sort((a, b) => Number(b.rent) - Number(a.rent));
  return {
    city: (result as Row).city,
    result_count: verified.length,
    unverified_omitted: all.length - verified.length,
    results: verified.slice(0, MAX_SPOKEN_RESULTS).map((r) => ({
      unit_id: r.unit_id,
      building_id: r.building_id,
      building_name: r.building_name,
      neighborhood: r.neighborhood,
      beds: r.beds,
      baths: r.baths,
      sqft: r.sqft,
      rent: r.rent,
      price_captured_at: r.price_captured_at,
      available: spokenAvailability(r.available_on, now),
      pet_policy: policyText(r.pet_policy),
      parking_policy: policyText(r.parking_policy),
    })),
    ...(verified.length === 0
      ? {
          note:
            "No units with recently verified pricing match. Do not quote prices or availability. " +
            "Offer to have the team text or email current options instead (create_lead).",
        }
      : {}),
  };
}

/**
 * Replace the units in a compacted get_building_details result with verified
 * ones. `units` are the building's available rows from units_with_latest_price
 * (the compacted payload is capped at 25 units, so it can't be filtered alone).
 */
export function verifiedBuildingDetails(
  result: unknown,
  units: Row[],
  now: Date = new Date()
): unknown {
  const building = (result as { building?: Row } | null)?.building;
  if (!building || typeof building !== "object") return result;
  const verified = units
    .filter((u) => isVerifiedPrice(Number(u.latest_rent), u.price_captured_at, now))
    .sort((a, b) => Number(a.latest_rent) - Number(b.latest_rent));
  // Drop web-only fields (urls, and the raw price_range string, which is not
  // snapshot-backed) along with the unfiltered units.
  const rest = { ...building };
  for (const key of ["units", "available_units_count", "url", "price_range"]) delete rest[key];
  for (const key of ["pet_policy", "parking_policy", "deposit_policy"]) rest[key] = policyText(rest[key]);
  return {
    building: {
      ...rest,
      verified_available_units: verified.length,
      units: verified.slice(0, 10).map((u) => ({
        beds: u.beds,
        baths: u.baths,
        sqft: u.sqft,
        rent: Number(u.latest_rent),
        price_captured_at: u.price_captured_at,
        available: spokenAvailability(u.available_on, now),
      })),
      ...(verified.length === 0
        ? {
            note:
              "No recently verified pricing for this building. Describe the building, but do not " +
              "quote rents or say units are available; offer a tour or a follow-up instead.",
          }
        : {}),
    },
  };
}
