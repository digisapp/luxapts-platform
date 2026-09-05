/**
 * City slug normalization shared by every surface that accepts a city from
 * free text or an LLM: the chat tools, the natural-language query parser and
 * the public search API. The canonical slugs are the `cities.slug` values in
 * the database; everything here maps common shorthand onto them.
 */

export const CITY_SLUGS = [
  "new-york",
  "brooklyn",
  "miami",
  "los-angeles",
  "san-francisco",
  "chicago",
  "austin",
  "dallas",
  "nashville",
  "atlanta",
  "boston",
  "seattle",
  "denver",
] as const;

export type CitySlug = (typeof CITY_SLUGS)[number];

const CITY_SLUG_ALIASES: Record<string, CitySlug> = {
  nyc: "new-york",
  ny: "new-york",
  "new-york-city": "new-york",
  newyork: "new-york",
  manhattan: "new-york",
  bk: "brooklyn",
  bklyn: "brooklyn",
  mia: "miami",
  "miami-fl": "miami",
  la: "los-angeles",
  losangeles: "los-angeles",
  "los-angeles-ca": "los-angeles",
  sf: "san-francisco",
  sanfrancisco: "san-francisco",
  "san-fran": "san-francisco",
  chi: "chicago",
  atx: "austin",
  dfw: "dallas",
  nash: "nashville",
  atl: "atlanta",
  bos: "boston",
  sea: "seattle",
  den: "denver",
};

/**
 * Lower-cases, trims, collapses whitespace/underscores into hyphens and
 * resolves shorthand ("NYC", "LA", "sf") to the canonical slug. Unknown
 * values are returned normalized but unmapped so the caller can still
 * validate them against the database.
 */
export function normalizeCitySlug(input: unknown): string {
  if (typeof input !== "string") return "";
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return CITY_SLUG_ALIASES[slug] ?? slug;
}

export function isKnownCitySlug(slug: string): slug is CitySlug {
  return (CITY_SLUGS as readonly string[]).includes(slug);
}
