// Pure helpers for the search page (kept out of the component so they can be
// unit-tested without rendering it).

import { availability } from "@/app/buildings/availability";

/**
 * Neighborhoods to hand to the city-change effect after an AI parse. Only a
 * parse that actually moves to another city needs them carried over; parked
 * there otherwise, they were applied to whatever city was picked next
 * (["brickell"] in Austin → "No apartments found").
 */
export function neighborhoodsForCityChange(
  parsedCity: string | undefined,
  parsedNeighborhoods: string[] | undefined,
  currentCity: string
): string[] | null {
  if (!parsedCity || parsedCity === currentCity) return null;
  return parsedNeighborhoods?.length ? parsedNeighborhoods : null;
}

/**
 * The card's move-in line, dated the way the building and unit pages date it:
 * `available_on` is a calendar date compared against `today` (todayKey in the
 * building's zone). Date-parsing it made it UTC midnight, which printed the
 * day before and said "Available now" from the previous evening in the US.
 */
export function moveInLabel(earliestAvailable: string | null, today: string): string | null {
  if (!earliestAvailable) return null;
  return availability(earliestAvailable, today).label;
}

/** "200+" once the API's page limit was hit — the exact count isn't known. */
export function resultCountLabel(count: number, limitReached: boolean): string {
  return limitReached ? `${count}+` : String(count);
}
