// Which building an MLS listing is in, by street address. A condo tower can
// have several addresses (stored as building_facts "addresses"); a listing
// matches on the normalized street address, and failing that on street number
// + ZIP + the street's first word ("1100 Brickell Bay" vs "1100 Brickell Bay
// Drive" when the MLS splits the suffix differently).

import { addressKey, streetNumberOf } from "@/lib/address-key";
import type { MlsListingRow } from "./reso";

export interface MatchableBuilding {
  id: string;
  address_1: string | null;
  zip: string | null;
  /** Extra street addresses of the same building. */
  addresses?: string[] | null;
}

export interface AddressIndex {
  byKey: Map<string, string>;
  byNumberZip: Map<string, { id: string; firstWord: string }[]>;
}

function firstStreetWord(key: string): string {
  // key looks like "1100 brickell bay dr"; skip the number and a direction
  const parts = key.split(" ").slice(1);
  return parts.find((p) => !/^(n|s|e|w|ne|nw|se|sw)$/.test(p)) ?? "";
}

/** Pure. */
export function buildAddressIndex(buildings: MatchableBuilding[]): AddressIndex {
  const byKey = new Map<string, string>();
  const byNumberZip = new Map<string, { id: string; firstWord: string }[]>();
  for (const b of buildings) {
    for (const address of [b.address_1, ...(b.addresses ?? [])]) {
      if (!address) continue;
      const key = addressKey(address);
      if (!byKey.has(key)) byKey.set(key, b.id);
      const num = streetNumberOf(address);
      if (num && b.zip) {
        const k = `${num}|${b.zip.slice(0, 5)}`;
        const list = byNumberZip.get(k) ?? [];
        list.push({ id: b.id, firstWord: firstStreetWord(key) });
        byNumberZip.set(k, list);
      }
    }
  }
  return { byKey, byNumberZip };
}

/** The building id for a listing, or null. Pure. */
export function matchListing(
  row: Pick<MlsListingRow, "street_number" | "street_name" | "postal_code" | "unparsed_address">,
  index: AddressIndex
): string | null {
  const street = row.street_number && row.street_name ? `${row.street_number} ${row.street_name}` : null;
  const candidates = [street, row.unparsed_address?.split(",")[0] ?? null].filter(Boolean) as string[];
  for (const c of candidates) {
    const id = index.byKey.get(addressKey(c));
    if (id) return id;
  }
  if (row.street_number && row.postal_code && row.street_name) {
    const list = index.byNumberZip.get(`${row.street_number}|${row.postal_code.slice(0, 5)}`) ?? [];
    const word = firstStreetWord(addressKey(`${row.street_number} ${row.street_name}`));
    const hits = [...new Set(list.filter((b) => b.firstWord === word).map((b) => b.id))];
    if (hits.length === 1) return hits[0];
  }
  return null;
}
