// Manhattan Skyline (manhattanskyline.com) building pages, read from the
// site's own units API.
//
// The building pages load their listings with
//   GET /api/units?buildings=<building slug>
// so the page HTML the scraper sees has no prices, and West River House,
// Soho Court, Manhattan East and Sullivan Mews imported with 0 units. The
// API returns every listing with number, beds, baths, rent, size and move-in
// date, paginated 100 at a time.

import type { ScrapedUnit } from "./types";

/** The building slug from a manhattanskyline.com building URL, else null. Pure. */
export function manhattanSkylineSlug(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/(^|\.)manhattanskyline\.com$/i.test(u.hostname)) return null;
    // /buildings/<area>/<building>[/apartment-…]
    const parts = u.pathname.split("/").filter(Boolean);
    return parts[0] === "buildings" && parts[2] ? parts[2].toLowerCase() : null;
  } catch {
    return null;
  }
}

interface SkylineUnit {
  number?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  price?: string | number | null;
  square_footage?: number | string | null;
  available_on?: string | null;
  is_rental?: boolean;
  is_residential?: boolean;
}

/** Rental units from one API page. Pure. */
export function unitsFromSkyline(rows: SkylineUnit[]): ScrapedUnit[] {
  const units: ScrapedUnit[] = [];
  for (const r of rows) {
    if (r.is_rental === false || r.is_residential === false) continue;
    const rent = Number(r.price);
    if (!Number.isFinite(rent) || rent < 300 || r.bedrooms == null) continue;
    const sqft = Number(r.square_footage);
    units.push({
      unit_number: r.number?.trim() || undefined,
      beds: r.bedrooms,
      baths: r.bathrooms ?? 1,
      sqft: Number.isFinite(sqft) && sqft > 0 ? sqft : undefined,
      rent,
      available_on: r.available_on && /^\d{4}-\d{2}-\d{2}$/.test(r.available_on) ? r.available_on : undefined,
    });
  }
  return units;
}

/** Every rental listing for the building; null if the API can't be read. */
export async function scrapeManhattanSkyline(
  slug: string,
  fetchText: (url: string) => Promise<string | null>
): Promise<{ units: ScrapedUnit[]; sourceUrl: string } | null> {
  const base = `https://manhattanskyline.com/api/units?buildings=${encodeURIComponent(slug)}`;
  const units: ScrapedUnit[] = [];
  for (let page = 1; page <= 10; page++) {
    const body = await fetchText(page === 1 ? base : `${base}&page=${page}`);
    if (!body) return page === 1 ? null : { units, sourceUrl: base };
    let parsed: { units?: { data?: SkylineUnit[]; last_page?: number } };
    try {
      parsed = JSON.parse(body);
    } catch {
      return page === 1 ? null : { units, sourceUrl: base };
    }
    units.push(...unitsFromSkyline(parsed.units?.data ?? []));
    if (!parsed.units?.last_page || page >= parsed.units.last_page) break;
  }
  return { units, sourceUrl: base };
}
