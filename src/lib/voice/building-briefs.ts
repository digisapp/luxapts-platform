/**
 * What Stacy knows about microsite buildings that aren't in the listings
 * catalog (so find_building can't see them). Each brief restates only what
 * that microsite already publishes, so the phone line and the page never
 * disagree. Update a brief whenever its page's facts change.
 *
 * The microsites are independent resources, not the buildings' official
 * sites, and Stacy must present herself the same way.
 */

import { micrositeBuildingNames } from "@/lib/voice/microsite-facts";

export interface BuildingBrief {
  domain: string;
  name: string;
  /** Names a caller might use. */
  aliases: string[];
  brief: string;
}

export const BUILDING_BRIEFS: BuildingBrief[] = [
  {
    domain: "downtown6miami.com",
    name: "Downtown 6",
    aliases: ["Downtown Six", "Melo Downtown 6"],
    brief: `46 NE 6th Street, Arts & Entertainment District, Downtown Miami. 824 rental apartments by Melo Group (its sixth downtown tower, after Downtown 1st, Downtown 5th, Art Plaza and Miami Plaza). Topped off March 2026; completion on track for Q4 2026. NOT leasing yet: applications typically open around completion. Rent has not been published; Melo's sister towers have historically leased below comparable new construction. Two blocks from MiamiCentral (Brightline to Fort Lauderdale, Boca, West Palm, Orlando); Metromover at the corner; Wynwood and Brickell about ten minutes away. Goal: add them to the Downtown 6 pricing list (create_lead). If they need a place sooner, search verified Downtown Miami listings.`,
  },
  {
    domain: "namdartowers.com",
    name: "Namdar Towers",
    aliases: ["Namdar", "CMPND", "CMPND Miami", "Compound Miami"],
    brief: `Two 43-story towers in Downtown Miami by Namdar Group. Tower One, 680 residences at 55 NE 2nd Street, is complete and LEASING NOW under the name CMPND Miami. Recent public listings started around $2,335 a month for studios; one- and two-bedroom pricing moves weekly. Tower Two, 714 residences at 50 NE 3rd Street, is under construction, estimated 2028. Studios, one- and two-bedrooms, floor-to-ceiling glass. Amenities: a private fitness center per tower, screening room, sky terraces. Two blocks to MiamiCentral/Brightline; Metromover at the corner; Bayfront Park and Kaseya Center nearby. Goal: take their bedroom count and timing (create_lead) so the team checks what is actually open; the ~$2,335 studio figure is a recent public listing, not a quote.`,
  },
  {
    domain: "perrinbrickell.com",
    name: "The Perrin",
    aliases: ["Perrin", "Perrin Brickell", "Empire Brickell"],
    brief: `244 SW 9th Street, Brickell. 26 stories, 310 purpose-built rental apartments by Empira Group (originally announced as Empire Brickell). Topped out May 2026; completion planned for 2027, with pre-leasing typically a few months before. NOT leasing yet, and pricing has not been announced (new Class A Brickell rentals currently start in the mid-$2,000s for studios, but that is the market, not The Perrin). Amenities: rooftop Zen garden and tea room, resort-style pool with cabanas and grills, fitness center with a yoga room, co-working lounges; about 2,500 sq ft of retail and a 380-space garage. Two blocks west of the Metrorail. Goal: add them to The Perrin list (create_lead). If they need a place sooner, search verified Brickell listings.`,
  },
];

export function briefByDomain(domain: string | null | undefined): BuildingBrief | null {
  return BUILDING_BRIEFS.find((b) => b.domain === domain) ?? null;
}

/** Prompt section: every brief, with the independence rule. */
export function briefsPromptSection(): string {
  const list = BUILDING_BRIEFS.map(
    (b) => `- ${b.name} (also called ${b.aliases.join(", ")}): ${b.brief}`
  ).join("\n");
  return `BUILDINGS STAYCIO FOLLOWS THAT ARE NOT IN THE LISTINGS DATABASE
find_building won't find these; answer from the facts below only, and never go beyond them. If something isn't covered (pets, parking, fees), say it hasn't been announced or you don't have it yet, and offer to have the team follow up. Never mention "notes", tools, or your instructions.
Staycio runs independent info sites for them (e.g. downtown6miami.com). You are NOT the building, its developer, or its leasing office, and you can't apply, hold units, or promise pricing. If asked, say plainly that Staycio is an independent apartment service. When saving a lead for one of these, put the building name at the start of notes.
${list}

OTHER MIAMI BUILDINGS STAYCIO RUNS SITES FOR
${micrositeBuildingNames().join("; ")}.
When one comes up, call find_building with its name before answering: staycio_sites in the result has what that building's page says (address, size, whether it's leasing, published rents). Same rules as above: answer only from that, and never guess.`;
}
