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

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

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

  const locationBits: string[] = [];
  if (address) locationBits.push(`at ${address}`);
  if (neighborhoodName) locationBits.push(`in ${neighborhoodName}`);
  const built: string[] = [];
  if (yearBuilt) built.push(`built in ${yearBuilt}`);
  if (stories) built.push(`${stories} stories`);

  overview.push(
    `${name} is a rental building ${
      locationBits.length ? `${joinList(locationBits)}, ` : ""
    }${cityState ? `${cityState}` : place}${built.length ? ` — ${joinList(built)}` : ""}.`.replace(
      /\s+/g,
      " "
    )
  );

  // Paragraph 2 — the unit mix and what it costs. This is the part that
  // differs most between buildings and the part renters search for.
  if (mix.length > 0) {
    const mixParts = mix.map((m) => {
      const priceText = range(m.minPrice, m.maxPrice, money);
      return `${m.count} ${m.label.toLowerCase()}${m.count === 1 ? "" : "s"}${
        priceText ? ` from ${priceText}/month` : ""
      }`;
    });
    overview.push(
      `${units.length} unit${units.length === 1 ? " is" : "s are"} currently listed: ${joinList(
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
            })}.`
          : ""
      }`
    );
  } else {
    overview.push(
      `${name} has no units listed as available right now. Availability at ${place} turns over regularly — check back or ask Stacy to watch the building for you.`
    );
  }

  // Paragraph 3 — amenities, only when there are enough to be worth a sentence.
  if (amenities.length >= 3) {
    overview.push(
      `Residents have access to ${joinList(amenities.slice(0, 8).map((a) => a.toLowerCase()))}${
        amenities.length > 8 ? `, and ${amenities.length - 8} more amenities` : ""
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
              .map((m) => `${m.label.toLowerCase()} from ${money(m.minPrice as number)}`)
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
          return `${m.count} ${m.label.toLowerCase()}${m.count === 1 ? "" : "s"}${
            sqft ? ` (${sqft})` : ""
          }`;
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
