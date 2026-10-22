// Glenwood (glenwoodnyc.com) property pages, parsed directly.
//
// Every Glenwood page lists its open apartments as identical cards:
//   "Paramount Tower | ID: 2990 | Bedrooms | 2 | Bathrooms | 2 | … |
//    Monthly Price | $8,995"
// The model read some of these pages (The Bristol) and returned nothing for
// others with the same template (Paramount Tower, The Regent), even with all
// four cards in its input. A template this regular does not need a model.
//
// Output matches what the model produced for Glenwood before: no unit number
// (the page shows a listing ID, not an apartment number) and no plan name,
// so existing units keep their identity (beds|baths|rent, see floorplanKey).

import type { ScrapedUnit } from "./types";

export function isGlenwoodUrl(url: string): boolean {
  try {
    return /(^|\.)glenwoodnyc\.com$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

function toText(html: string): string {
  return html
    .replace(/<svg[\s\S]*?<\/svg>/gi, "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<[^>]+>/g, " | ")
    .replace(/&nbsp;/g, " ")
    .replace(/(\s*\|\s*)+/g, " | ")
    .replace(/\s+/g, " ");
}

const CARD =
  /ID:\s*(\d+)\s*\|\s*Bedrooms\s*\|\s*(Studio|\d+(?:\.\d+)?)\s*\|\s*Bathrooms\s*\|\s*(\d+(?:\.\d+)?)\s*\|.{0,200}?Monthly Price\s*\|\s*\$\s?([\d,]{3,})/gi;

/** Listing cards on a Glenwood page. Pure. */
export function parseGlenwoodListings(html: string): ScrapedUnit[] {
  const seen = new Set<string>();
  const units: ScrapedUnit[] = [];
  for (const m of toText(html).matchAll(CARD)) {
    const [, id, bedsText, bathsText, priceText] = m;
    if (seen.has(id)) continue;
    seen.add(id);
    const rent = Number(priceText.replace(/,/g, ""));
    if (!Number.isFinite(rent) || rent < 300) continue;
    units.push({
      beds: /studio/i.test(bedsText) ? 0 : Number(bedsText),
      baths: Number(bathsText),
      rent,
    });
  }
  return units;
}
