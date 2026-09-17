/**
 * Bedroom facet landing pages: /cities/miami/2-bedroom-apartments
 *
 * /search is a 1,600-line client component — Googlebot gets a 52KB JS shell
 * with zero headings and 16 links, so the highest-intent queries the catalogue
 * can actually answer ("2 bedroom apartments miami") had no server-rendered
 * page to rank. These facets are the server-rendered answer: real inventory,
 * real prices, one URL per query.
 *
 * Facets are only reachable and only submitted where they have inventory
 * behind them — see MIN_FACET_BUILDINGS in the page and the sitemap.
 */

export interface BedFacet {
  slug: string;
  /** Used in <h1> and <title>, after the city. */
  label: string;
  /** Short form for breadcrumbs and chips. */
  shortLabel: string;
  matches: (beds: number | null) => boolean;
}

export const BED_FACETS: BedFacet[] = [
  {
    slug: "studio-apartments",
    label: "Studio Apartments",
    shortLabel: "Studios",
    matches: (beds) => beds === 0,
  },
  {
    slug: "1-bedroom-apartments",
    label: "1 Bedroom Apartments",
    shortLabel: "1 Bedroom",
    matches: (beds) => beds === 1,
  },
  {
    slug: "2-bedroom-apartments",
    label: "2 Bedroom Apartments",
    shortLabel: "2 Bedroom",
    matches: (beds) => beds === 2,
  },
  {
    slug: "3-bedroom-apartments",
    label: "3 Bedroom Apartments",
    shortLabel: "3 Bedroom",
    matches: (beds) => beds != null && beds >= 3,
  },
];

export function findFacet(slug: string): BedFacet | undefined {
  return BED_FACETS.find((f) => f.slug === slug);
}

export function facetPath(citySlug: string, facetSlug: string): string {
  return `/cities/${citySlug}/${facetSlug}`;
}

/** Below this, a facet page is a thin page — don't link it, don't submit it. */
export const MIN_FACET_BUILDINGS = 3;
