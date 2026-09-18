import type { MicrositeDomain } from "@/lib/validations";

/**
 * Microsite domain -> catalog building slug, for the live availability strip on
 * the operating-building pages.
 *
 * Only domains listed here can show inventory. A building missing from the
 * catalog (Downtown 5th, Art Plaza, Miami World Tower) simply has no entry and
 * its page renders exactly as it did before the strip existed.
 */
export const MICROSITE_CATALOG_SLUG: Partial<Record<MicrositeDomain, string>> = {
  "panoramatowerbrickell.com": "panorama-tower",
  "maizonbrickell.com": "maizon-brickell",
  "muzemet.com": "muze-at-met",
  "remitheriver.com": "remi-on-the-river",
};

/**
 * Prices older than this are not shown at all.
 *
 * The microsites promise "what's actually available". A rent captured in
 * January and presented in September is worse than showing nothing: it is the
 * same broken-promise failure that made the Namdar page convert at 1% while
 * carrying real search traffic. Panorama Tower is the live example — nine
 * units are marked available but their last price capture is eight months old,
 * so it falls through to the no-data response.
 */
export const INVENTORY_MAX_AGE_DAYS = 45;
