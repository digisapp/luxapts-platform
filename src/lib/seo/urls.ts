/**
 * Canonical URL construction for everything Google indexes.
 *
 * One rule, enforced here rather than at ~15 call sites: a building is
 * addressed by its slug, and the UUID form only ever exists as a redirect
 * source. Mixing the two produced two crawlable URLs per building.
 */

export const SITE_URL = "https://staycio.com";

export function absoluteUrl(path: string): string {
  return path.startsWith("http") ? path : `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** A building row only needs these two fields to be addressable. */
export type Addressable = { id: string; slug?: string | null };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Path for a building. Falls back to the UUID when a row predates the slug
 * backfill (migration 026) so a missing slug degrades to a working URL rather
 * than a 404.
 */
export function buildingPath(building: Addressable): string {
  return `/buildings/${building.slug || building.id}`;
}

export function buildingUrl(building: Addressable): string {
  return absoluteUrl(buildingPath(building));
}

export function unitPath(building: Addressable, unitId: string): string {
  return `${buildingPath(building)}/units/${unitId}`;
}

export function cityPath(slug: string): string {
  return `/cities/${slug}`;
}

/**
 * Neighborhood slugs are not unique across cities ("midtown" is in NYC, Miami
 * and Atlanta). The page disambiguates with ?city=, so the canonical has to
 * carry it too — otherwise three different pages all claimed
 * /neighborhoods/midtown and two of them were dropped as duplicates.
 */
export function neighborhoodPath(slug: string, citySlug?: string | null, ambiguous = false): string {
  return ambiguous && citySlug
    ? `/neighborhoods/${slug}?city=${citySlug}`
    : `/neighborhoods/${slug}`;
}
