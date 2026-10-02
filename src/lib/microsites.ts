/**
 * Building name per microsite domain. Single source of truth — the admin
 * dashboard labels and the sender identity for outbound mail both read it.
 */
export const MICROSITE_BUILDINGS: Record<string, string> = {
  "namdartowers.com": "Namdar Towers",
  "downtown6miami.com": "Downtown 6",
  "jadebrickell.com": "Jade Brickell",
  "sentralbrickell.com": "Sentral Brickell",
  "perrinbrickell.com": "The Perrin",
  "midtown5apartments.com": "Midtown 5",
  "2600biscaynemiami.com": "2600 Biscayne",
  "jemmiamiapartments.com": "JEM Miami Worldcenter",
  "kenectmiamiapartments.com": "Kenect Miami",
  "3333biscaynemiami.com": "3333 Biscayne",
  "biscayne18.com": "Biscayne 18",
  "urban22edgewater.com": "Urban 22",
  "downtown5miami.com": "Downtown 5th",
  "panoramatowerbrickell.com": "Panorama Tower",
  "maizonbrickell.com": "Maizon Brickell",
  "muzemet.com": "Muze at Met",
  "remitheriver.com": "Remi on the River",
  "artplazaapartments.com": "Art Plaza",
  "miamiworldtowerapartments.com": "Miami World Tower",
  // Both Mohawk domains are the same building, so both carry the same name —
  // a lead from either should arrive from "Mohawk at Wynwood". Likewise
  // neoedgewatermiami.com and 2600biscaynemiami.com are one building, but they
  // keep different labels because each domain is searched under its own name.
  "mohawkwynwood.com": "Mohawk at Wynwood",
  "mohawkmiami.com": "Mohawk at Wynwood",
  "2900terrace.com": "2900 Terrace",
  "neoedgewatermiami.com": "Neo Edgewater",
};

/**
 * Who a reply to a lead should appear to come from.
 *
 * Someone who signed up on downtown6miami.com should see "Downtown 6" in their
 * inbox — they may not recognise the parent brand at all.
 *
 * The address stays on staycio.com deliberately. Sending from the microsite
 * domains themselves would need DKIM and SPF on all 19, and those domains have
 * no sending reputation, so early mail would land in spam. What a recipient
 * actually sees in their inbox is the display name anyway.
 */
export function senderIdentityFor(
  sourceDetail: string | null | undefined,
  fallbackFrom: string
): { from: string; label: string } {
  const building = sourceDetail ? MICROSITE_BUILDINGS[sourceDetail] : undefined;
  if (!sourceDetail || !building) return { from: fallbackFrom, label: "Staycio" };

  const localPart = sourceDetail.replace(/\.com$/, "").replace(/[^a-z0-9]/gi, "");
  // Quote the display name: building names contain spaces and periods
  // ("Mr. C", "No. 17") which break an unquoted From header.
  return { from: `"${building}" <${localPart}@staycio.com>`, label: building };
}

/**
 * Where each microsite belongs on staycio.com.
 *
 * Until now the platform linked to none of the 23 domains, so Google had no
 * path into them: five days after the second wave launched, not one of those
 * pages was indexed, and the only three sites with search traffic were the
 * three old enough to have been found some other way. A contextual link from
 * the neighborhood page the building actually sits in is the cheapest,
 * most legitimate way to fix that. Keep it contextual — no sitewide footer
 * block of 23 links, which reads as a link scheme to Google.
 *
 * `neighborhood` is the slug on the Miami city record; "downtown" is shared
 * with other cities, so the page filters on city as well.
 */
export type MicrositeGuide = {
  domain: string;
  name: string;
  neighborhood: string;
  /** Static wording only — nothing here that a slipped delivery date can falsify. */
  blurb: string;
};

export const MICROSITE_GUIDES: MicrositeGuide[] = [
  // Brickell
  { domain: "perrinbrickell.com", name: "The Perrin", neighborhood: "brickell", blurb: "Pre-leasing waitlist" },
  { domain: "sentralbrickell.com", name: "Sentral Brickell", neighborhood: "brickell", blurb: "Early interest list" },
  { domain: "jadebrickell.com", name: "Jade Brickell", neighborhood: "brickell", blurb: "Rent & sale listings" },
  { domain: "panoramatowerbrickell.com", name: "Panorama Tower", neighborhood: "brickell", blurb: "Availability & rents" },
  { domain: "maizonbrickell.com", name: "Maizon Brickell", neighborhood: "brickell", blurb: "Availability & rents" },
  // Downtown Miami
  { domain: "downtown6miami.com", name: "Downtown 6", neighborhood: "downtown", blurb: "Pre-leasing waitlist" },
  { domain: "downtown5miami.com", name: "Downtown 5th", neighborhood: "downtown", blurb: "Availability & rents" },
  { domain: "namdartowers.com", name: "Namdar Towers", neighborhood: "downtown", blurb: "Availability & rents" },
  { domain: "muzemet.com", name: "Muze at Met", neighborhood: "downtown", blurb: "Availability & rents" },
  { domain: "jemmiamiapartments.com", name: "JEM Miami Worldcenter", neighborhood: "downtown", blurb: "Pre-leasing waitlist" },
  { domain: "kenectmiamiapartments.com", name: "Kenect Miami", neighborhood: "downtown", blurb: "Pre-leasing waitlist" },
  { domain: "miamiworldtowerapartments.com", name: "Miami World Tower", neighborhood: "downtown", blurb: "Availability & rents" },
  // Edgewater
  { domain: "neoedgewatermiami.com", name: "Neo Edgewater", neighborhood: "edgewater", blurb: "Now preleasing" },
  { domain: "2600biscaynemiami.com", name: "2600 Biscayne", neighborhood: "edgewater", blurb: "Now leasing as Neo Edgewater" },
  { domain: "urban22edgewater.com", name: "Urban 22", neighborhood: "edgewater", blurb: "Availability & rents" },
  { domain: "2900terrace.com", name: "2900 Terrace", neighborhood: "edgewater", blurb: "Pre-leasing waitlist" },
  { domain: "3333biscaynemiami.com", name: "3333 Biscayne", neighborhood: "edgewater", blurb: "Pre-leasing waitlist" },
  { domain: "biscayne18.com", name: "Biscayne 18", neighborhood: "edgewater", blurb: "Pre-leasing waitlist" },
  // Wynwood, Midtown, A&E, River
  { domain: "mohawkwynwood.com", name: "Mohawk at Wynwood", neighborhood: "wynwood", blurb: "Pre-leasing waitlist" },
  { domain: "midtown5apartments.com", name: "Midtown 5", neighborhood: "midtown-miami", blurb: "Availability & rents" },
  { domain: "artplazaapartments.com", name: "Art Plaza", neighborhood: "arts-district", blurb: "Availability & rents" },
  { domain: "remitheriver.com", name: "Remi on the River", neighborhood: "river-district", blurb: "Availability & rents" },
];
