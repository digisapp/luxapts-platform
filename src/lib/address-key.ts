// One street address, one key: "100 West 31st Street", "100 W 31st St" and
// "100 W. 31 St." all compare equal. Used to dedupe imported buildings and to
// match MLS listings to their building.

const WORDS: [RegExp, string][] = [
  [/\b(street|st)\b/g, "st"],
  [/\b(avenue|ave|av)\b/g, "ave"],
  [/\b(boulevard|blvd)\b/g, "blvd"],
  [/\b(place|pl)\b/g, "pl"],
  [/\b(drive|dr)\b/g, "dr"],
  [/\b(road|rd)\b/g, "rd"],
  [/\b(court|ct)\b/g, "ct"],
  [/\b(terrace|ter)\b/g, "ter"],
  [/\b(lane|ln)\b/g, "ln"],
  [/\b(parkway|pkwy)\b/g, "pkwy"],
  [/\b(highway|hwy)\b/g, "hwy"],
  [/\b(northeast|ne)\b/g, "ne"],
  [/\b(northwest|nw)\b/g, "nw"],
  [/\b(southeast|se)\b/g, "se"],
  [/\b(southwest|sw)\b/g, "sw"],
  [/\b(west|w)\b/g, "w"],
  [/\b(east|e)\b/g, "e"],
  [/\b(north|n)\b/g, "n"],
  [/\b(south|s)\b/g, "s"],
];

export function addressKey(address: string): string {
  let a = address
    .toLowerCase()
    .replace(/[.,#]/g, " ")
    // Unit designators never identify the building
    .replace(/\b(apt|unit|ph|suite|ste)\s*[\w-]+$/g, "");
  for (const [re, to] of WORDS) a = a.replace(re, to);
  return a
    .replace(/(\d+)(st|nd|rd|th)\b/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** The leading street number of an address ("1100" from "1100 Brickell Bay Dr"), or null. */
export function streetNumberOf(address: string): string | null {
  return /^\s*(\d+)/.exec(address)?.[1] ?? null;
}
