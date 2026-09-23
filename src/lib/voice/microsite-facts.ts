import generated from "./microsite-facts.generated.json";
import { BUILDING_BRIEFS, briefByDomain } from "@/lib/voice/building-briefs";
import { MICROSITE_BUILDINGS } from "@/lib/microsites";

/**
 * What Stacy's microsite chat knows about the building a page covers, for the
 * sites without a full BUILDING_BRIEF. Like the briefs, each entry restates
 * only what that page publishes, so the chat can't contradict it.
 *
 * The 17 generated sites come from microsites/_generator/build.js (regenerate,
 * never edit the JSON). The hand-built pages are written here; update an entry
 * whenever its page's facts change.
 */
const HAND_BUILT: Record<string, string> = {
  "jadebrickell.com":
    "Jade Brickell (formally Jade Residences at Brickell Bay), 1331 Brickell Bay Drive, Brickell, Miami FL 33131, on the Biscayne Bay side of Brickell. A condominium built in 2004: 48 stories, 340 residences of 895 to 6,487 sq ft, one to five bedrooms. Units are individually owned, so rentals and sales are listed by owners. The page's August 2026 snapshot from public listings: rentals average about $12,350 a month; for-sale inventory about $1.04M to $5.4M, around $1,078 per sq ft; two-bedrooms closed at $1.2M to $1.44M in 2026. Floor-to-ceiling glass, private elevator arrivals. Short walk to Brickell City Centre and Mary Brickell Village. Goal: take whether they want to rent or buy, bedrooms and timing (create_lead) so the team sends current listings. The figures are averages, not quotes.",
  "sentralbrickell.com":
    "\"Sentral Brickell\" is Staycio's descriptive name for the announced Sentral-managed rental tower at One Twenty Brickell (SW 8th Street corridor, Brickell) by developer PMG; the official name hasn't been announced and may differ. 537 rental residences; PMG anticipates full completion of One Twenty Brickell by 2028. NOT leasing yet and pricing is unpublished. The development's other tower is 34 stories with 266 fully furnished condominiums, plus ground-floor retail and resort-style shared amenities. Sentral communities typically offer furnished and unfurnished homes with flexible terms and app-run, hotel-style service (see Sentral Wynwood), but this tower's mix hasn't been announced. Walk to Brickell City Centre, Mary Brickell Village, the Underline and the Metromover. Goal: add them to the interest list (create_lead) with annual vs furnished/flexible preference. If they need a place sooner, search verified Brickell listings.",
  "midtown5apartments.com":
    "Midtown 5, 3201 NE 1st Avenue (also 125 NE 32nd Street), Midtown Miami FL 33137, beside The Shops at Midtown (Target, Trader Joe's) and one block from Wynwood. Operating and leasing now: 400 residences, 24 stories, studios through three bedrooms, 538 to 1,501 sq ft. The page's August 2026 snapshot from public listings: studios from about $2,462 a month, one-bedrooms in the $2,600s to $3,000s, two-bedrooms in the $3,000s to $4,000s, about 29 homes available. Nine-foot ceilings, in-unit washer and dryer, balconies, 24-hour door service, EV charging, bike storage, pet-friendly with pet amenities (breed and weight rules: confirm with the leasing office), smoke-free. It is a different building from Midtown 8 / Yard 8. Goal: take bedrooms, budget and timing (create_lead) for today's pricing; the snapshot figures are not quotes.",
};

const GENERATED: Record<string, string> = generated;

/** Page facts for a microsite's chat, or null when a full brief already covers it. */
export function micrositeFacts(domain: string): string | null {
  if (briefByDomain(domain)) return null;
  return HAND_BUILT[domain] ?? GENERATED[domain] ?? null;
}

/** Names people use that don't contain the site's building name. */
const EXTRA_NAMES: Record<string, string[]> = {
  "jadebrickell.com": ["Jade Residences", "Jade at Brickell Bay"],
  "sentralbrickell.com": ["One Twenty Brickell", "120 Brickell", "Sentral"],
  "midtown5apartments.com": ["Midtown Five"],
  "2600biscaynemiami.com": ["Neo Edgewater"],
  "neoedgewatermiami.com": ["2600 Biscayne"],
  "mohawkwynwood.com": ["Mohawk"],
  "jemmiamiapartments.com": ["JEM"],
  "downtown5miami.com": ["Downtown 5", "Downtown Five"],
};

// "the Muze building" -> "muze"; applied to names too so "Remi on the River" still matches.
const norm = (s: string) =>
  s.replace(/\b(the|apartments?|building|residences)\b/gi, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Staycio's microsite buildings matching a spoken name, with what each page
 * publishes. Covers every site, including the three with full briefs, so the
 * phone line can answer about any of them. Two domains covering one building
 * (the Mohawk pair) collapse to one result.
 */
export function findMicrositeBuildings(query: string): { name: string; site: string; facts: string }[] {
  const q = norm(query);
  if (q.length < 3) return [];
  const seen = new Set<string>();
  const out: { name: string; site: string; facts: string }[] = [];
  for (const [domain, name] of Object.entries(MICROSITE_BUILDINGS)) {
    const brief = briefByDomain(domain);
    const names = [name, domain.replace(/\.com$/, ""), ...(brief?.aliases ?? []), ...(EXTRA_NAMES[domain] ?? [])]
      .map(norm)
      .filter((n) => n.length >= 3);
    if (!names.some((n) => n.includes(q) || q.includes(n))) continue;
    const facts = brief?.brief ?? HAND_BUILT[domain] ?? GENERATED[domain];
    const building = brief?.name ?? name;
    if (!facts || seen.has(building)) continue;
    seen.add(building);
    out.push({ name: building, site: domain, facts });
  }
  return out.slice(0, 3);
}

/** Every building Staycio runs a site for, for the prompt's directory line. */
export function micrositeBuildingNames(): string[] {
  const briefed = new Set(BUILDING_BRIEFS.map((b) => b.domain));
  return [
    ...new Set(
      Object.entries(MICROSITE_BUILDINGS)
        .filter(([domain]) => !briefed.has(domain))
        .map(([, name]) => name)
    ),
  ];
}
