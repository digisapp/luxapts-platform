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
  "miamiworldtowerapartments.com": "Miami World Tower",};

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
