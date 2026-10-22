/**
 * Unique, factual page content derived from what we already know about a
 * building.
 *
 * 213 of the 247 active buildings have no `description` at all, and the other
 * 34 are one-liners, so every building page rendered an h1 and a unit table and
 * nothing else — ~2.3KB of near-identical boilerplate across the catalogue.
 * That is the classic "Crawled – currently not indexed" shape.
 *
 * Nothing here is invented: every sentence is assembled from stored columns
 * (address, year built, stories, unit mix, live rents, policies, amenities).
 * Buildings differ in those facts, so the prose differs with them — no model
 * generation, nothing to fact-check, nothing that reads as scaled content.
 */

export interface SummaryUnit {
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  price: number | null;
}

export interface SummaryInput {
  name: string;
  address?: string | null;
  cityName?: string | null;
  state?: string | null;
  neighborhoodName?: string | null;
  yearBuilt?: number | null;
  stories?: number | null;
  description?: string | null;
  petPolicy?: string | null;
  parkingPolicy?: string | null;
  amenities?: string[];
  units: SummaryUnit[];
  /** ISO date of the freshest rent snapshot, when one exists. */
  pricesVerifiedAt?: string | null;
  /** Leasing office number, for the "how do I tour" answer. */
  leasingPhone?: string | null;
  /** Absolute URL of the building page, named in the "how do I tour" answer. */
  pageUrl?: string | null;
  /** The building's IANA zone, so the verified date is its calendar day, not the server's. */
  timeZone?: string;
  /**
   * Leasing hasn't opened. `expectedOpening` is the developer's or press's
   * own words ("Leasing begins winter 2026"), shown quoted and dated because
   * opening dates slip.
   */
  preLeasing?: {
    expectedOpening: string;
    checkedAt?: string | null;
    developer?: string | null;
    unitsTotal?: number | null;
  } | null;
}

export interface UnitMixRow {
  key: string;
  label: string;
  count: number;
  minPrice: number | null;
  maxPrice: number | null;
  minSqft: number | null;
  maxSqft: number | null;
}

export interface BuildingSummary {
  /** Prose overview. Uses the stored description as the opening line when set. */
  overview: string[];
  unitMix: UnitMixRow[];
  faqs: { question: string; answer: string }[];
}

function bedKey(beds: number | null): string | null {
  if (beds == null) return null;
  if (beds === 0) return "studio";
  if (beds >= 4) return "4-bedroom";
  return `${beds}-bedroom`;
}

function bedLabel(key: string): string {
  return key === "studio" ? "Studio" : `${key.charAt(0)} Bedroom`;
}

/** How a layout reads in a sentence: "4 one-bedrooms", "1 studio". */
const BED_WORDS: Record<string, [string, string]> = {
  studio: ["studio", "studios"],
  "1-bedroom": ["one-bedroom", "one-bedrooms"],
  "2-bedroom": ["two-bedroom", "two-bedrooms"],
  "3-bedroom": ["three-bedroom", "three-bedrooms"],
  "4-bedroom": ["four-plus-bedroom", "four-plus-bedrooms"],
};

function layoutWord(key: string, count: number): string {
  const [one, many] = BED_WORDS[key] ?? [key, `${key}s`];
  return count === 1 ? one : many;
}

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

/**
 * "October 22, 2026". A bare date ("2026-06-14") is a calendar day, not an
 * instant: parsed as UTC midnight it printed as June 13 in New York.
 */
function asOfDate(value: string, timeZone?: string): string {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  return new Date(dateOnly ? `${value}T12:00:00Z` : value).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: dateOnly ? "UTC" : timeZone,
  });
}

function range(min: number | null, max: number | null, fmt: (n: number) => string): string | null {
  if (min == null) return null;
  if (max == null || max === min) return fmt(min);
  return `${fmt(min)}–${fmt(max)}`;
}

function joinList(parts: string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

export function buildUnitMix(units: SummaryUnit[]): UnitMixRow[] {
  const groups = new Map<string, UnitMixRow>();

  for (const u of units) {
    const key = bedKey(u.beds);
    if (!key) continue;

    let row = groups.get(key);
    if (!row) {
      row = {
        key,
        label: bedLabel(key),
        count: 0,
        minPrice: null,
        maxPrice: null,
        minSqft: null,
        maxSqft: null,
      };
      groups.set(key, row);
    }

    row.count += 1;
    if (u.price != null && u.price > 0) {
      row.minPrice = row.minPrice == null ? u.price : Math.min(row.minPrice, u.price);
      row.maxPrice = row.maxPrice == null ? u.price : Math.max(row.maxPrice, u.price);
    }
    if (u.sqft != null && u.sqft > 0) {
      row.minSqft = row.minSqft == null ? u.sqft : Math.min(row.minSqft, u.sqft);
      row.maxSqft = row.maxSqft == null ? u.sqft : Math.max(row.maxSqft, u.sqft);
    }
  }

  const order = ["studio", "1-bedroom", "2-bedroom", "3-bedroom", "4-bedroom"];
  return [...groups.values()].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
}

export function buildSummary(input: SummaryInput): BuildingSummary {
  const {
    name,
    address,
    cityName,
    state,
    neighborhoodName,
    yearBuilt,
    stories,
    description,
    petPolicy,
    parkingPolicy,
    amenities = [],
    units,
    pricesVerifiedAt,
    timeZone,
    leasingPhone,
    pageUrl,
    preLeasing,
  } = input;

  const place = neighborhoodName && cityName
    ? `${neighborhoodName} in ${cityName}`
    : cityName || "the city";
  const cityState = cityName ? `${cityName}${state ? `, ${state}` : ""}` : null;

  const mix = buildUnitMix(units);
  const priced = units.filter((u) => u.price != null && u.price > 0).map((u) => u.price as number);
  const minPrice = priced.length ? Math.min(...priced) : null;
  const maxPrice = priced.length ? Math.max(...priced) : null;

  const overview: string[] = [];

  // Paragraph 1 — what and where.
  if (description) {
    overview.push(description.trim().replace(/\s*\.?$/, "."));
  }

  // "3ELEVEN is a 60-story rental building at 311 Eleventh Avenue in Chelsea,
  // Manhattan, New York, NY, built in 2023."
  const where = [address ? `at ${address}` : null, neighborhoodName ? `in ${neighborhoodName}` : null]
    .filter(Boolean)
    .join(" ");
  const cityPart = cityState ? (where ? `, ${cityState}` : `in ${cityState}`) : where ? "" : `in ${place}`;
  // A condo tower (its own description says so) is not a "rental building",
  // even when owners rent units out through it.
  const kind = description && /\bcondo(minium)?s?\b/i.test(description) ? "residential building" : "rental building";
  overview.push(
    `${name} is ${stories ? `${/^8|^1[18]$/.test(String(stories)) ? "an" : "a"} ${stories}-story` : "a"} ${kind} ${where}${cityPart}${
      yearBuilt ? `, built in ${yearBuilt}` : ""
    }.`.replace(/\s+/g, " ")
  );

  // Paragraph 2 — the unit mix and what it costs. This is the part that
  // differs most between buildings and the part renters search for.
  if (mix.length > 0) {
    const mixParts = mix.map((m) => {
      const priceText = range(m.minPrice, m.maxPrice, money);
      return `${m.count} ${layoutWord(m.key, m.count)}${priceText ? ` at ${priceText} a month` : ""}`;
    });
    overview.push(
      `${units.length} apartment${units.length === 1 ? " is" : "s are"} listed right now: ${joinList(
        mixParts
      )}.${
        minPrice && maxPrice && minPrice !== maxPrice
          ? ` Asking rents across the building run ${money(minPrice)} to ${money(maxPrice)} per month.`
          : ""
      }${
        pricesVerifiedAt
          ? ` Pricing was last verified on ${new Date(pricesVerifiedAt).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
              timeZone,
            })}.`
          : ""
      }`
    );
  } else if (preLeasing) {
    const checked = preLeasing.checkedAt ? ` (as of ${asOfDate(preLeasing.checkedAt, timeZone)})` : "";
    overview.push(
      `${name} is a new rental building${preLeasing.developer ? ` from ${preLeasing.developer}` : ""}${
        preLeasing.unitsTotal ? ` with ${preLeasing.unitsTotal.toLocaleString()} apartments` : ""
      }. Leasing hasn't opened yet. The stated timing is "${preLeasing.expectedOpening.replace(/[."]+$/, "")}"${checked}. Pricing and floor plans aren't public; join the first-access list to get them when they're released.`
    );
  } else {
    overview.push(
      `${name} has no units listed as available right now. Availability at ${place} turns over regularly — check back or ask Stacy to watch the building for you.`
    );
  }

  // Paragraph 3 — amenities, only when there are enough to be worth a sentence.
  if (amenities.length >= 3) {
    const shown = amenities.slice(0, 8).map((a) => a.toLowerCase());
    const extra = amenities.length - shown.length;
    overview.push(
      `Residents have access to ${
        extra > 0 ? `${shown.join(", ")}, and ${extra} more amenit${extra === 1 ? "y" : "ies"}` : joinList(shown)
      }.`
    );
  }

  // FAQs — each answer is a stored fact, so these are safe to mark up as
  // FAQPage. Questions map to real long-tail queries ("is X pet friendly").
  const faqs: { question: string; answer: string }[] = [];

  if (minPrice) {
    faqs.push({
      question: `How much does it cost to rent at ${name}?`,
      answer: `Listed rents at ${name} currently start at ${money(minPrice)} per month${
        maxPrice && maxPrice !== minPrice ? ` and go up to ${money(maxPrice)}` : ""
      }.${
        mix.length
          ? ` By layout: ${mix
              .filter((m) => m.minPrice)
              .map((m) => `${layoutWord(m.key, m.count)} from ${money(m.minPrice as number)}`)
              .join(", ")}.`
          : ""
      }`,
    });
  }

  if (mix.length) {
    faqs.push({
      question: `What floor plans are available at ${name}?`,
      answer: `${name} currently lists ${joinList(
        mix.map((m) => {
          const sqft = range(m.minSqft, m.maxSqft, (n) => `${n.toLocaleString()} sq ft`);
          return `${m.count} ${layoutWord(m.key, m.count)}${sqft ? ` (${sqft})` : ""}`;
        })
      )}.`,
    });
  }

  if (petPolicy) {
    faqs.push({
      question: `Is ${name} pet friendly?`,
      answer: petPolicy.trim(),
    });
  }

  if (parkingPolicy) {
    faqs.push({
      question: `Does ${name} have parking?`,
      answer: parkingPolicy.trim(),
    });
  }

  if (preLeasing && mix.length === 0) {
    faqs.push({
      question: `When does ${name} start leasing?`,
      answer: `Leasing hasn't opened yet. The stated timing is "${preLeasing.expectedOpening.replace(/[."]+$/, "")}"${
        preLeasing.checkedAt ? ` as of ${asOfDate(preLeasing.checkedAt, timeZone)}` : ""
      }. Opening dates for new buildings often move; Staycio's first-access list gets pricing and floor plans as soon as they're released.`,
    });
  }

  // The question people ask an assistant right before they'd contact us.
  // Only states what the form does: the renter gets an email confirming the
  // request (tourConfirmationEmail in /api/leads).
  // Nothing to tour before leasing opens; the pre-leasing FAQ covers it.
  if (pageUrl && !(preLeasing && mix.length === 0)) {
    faqs.push({
      question: `How do I schedule a tour at ${name}?`,
      answer: `Request a tour on Staycio at ${pageUrl.replace(/^https?:\/\//, "")}: pick a preferred date and time, and you'll get an email confirming the request.${
        leasingPhone ? ` You can also call the ${name} leasing office at ${leasingPhone}.` : ""
      }`,
    });
  }

  if (cityState) {
    faqs.push({
      question: `Where is ${name} located?`,
      answer: `${name} is at ${address ? `${address}, ` : ""}${cityState}${
        neighborhoodName ? `, in the ${neighborhoodName} neighborhood` : ""
      }.`,
    });
  }

  return { overview, unitMix: mix, faqs };
}
