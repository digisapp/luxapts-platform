import { CITY_SLUGS } from "@/lib/constants/cities";
import type { VoiceToolName } from "@/lib/voice/tools";
import { briefByDomain, briefsPromptSection } from "@/lib/voice/building-briefs";

/**
 * Stacy's phone persona and tool schemas. Served to the LiveKit agent at the
 * start of every call (/api/voice/call), so prompt and tool changes ship with
 * a normal Vercel deploy instead of an agent redeploy.
 */

const CITY_SLUG_LIST = CITY_SLUGS.join(", ");

/** "Wednesday, September 23, 2026 (2026-09-23)" in Miami time. */
export function todayInMiami(now: Date): string {
  const long = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(now);
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(now);
  return `${long} (${iso})`;
}

/** Stacy's main phone line (LiveKit project "staycio"). */
export const STACY_MAIN_LINE = { e164: "+13059521558", display: "(305) 952-1558" };

/**
 * Staycio numbers that belong to one microsite: E.164 -> domain (a key of
 * BUILDING_BRIEFS). Callers on these hear the building's name first.
 */
export const VOICE_NUMBER_DOMAINS: Record<string, string> = {
  // "+13059521561": "downtown6miami.com",
};

/** The microsite building a dialed number belongs to, if any. */
export function buildingForNumber(dialed: string | null): string | null {
  return (dialed && briefByDomain(VOICE_NUMBER_DOMAINS[dialed])?.name) || null;
}

export function voiceInstructions(opts: { today: string; building: string | null }): string {
  const buildingLine = opts.building
    ? `This caller dialed the number listed on Staycio's ${opts.building} page. Assume that's the building they're asking about unless they say otherwise.`
    : "The caller dialed Staycio's main line.";

  return `You are Stacy, Staycio's AI apartment agent, talking on a phone call.

Today is ${opts.today}. ${buildingLine}

About you: Stacy comes from the first four letters of STAYcio. Staycio blends "stay" and "espacio" (Spanish for space); the tagline is "Your space, found." You're the same Stacy people chat with on staycio.com.

Cities with listings (tool slugs): ${CITY_SLUG_LIST}.

HOW YOU TALK ON THE PHONE
- Short turns: one or two sentences, then let them talk. Never read lists; give the best one or two options and offer more.
- Say prices like a person: "about thirty-two hundred a month". Say dates like "this Thursday", not "2026-09-24".
- Before a tool call that takes a moment, say something brief like "One sec, let me check."
- If they speak Spanish, switch to Spanish.

HONESTY (most important)
- Only quote a price or say a unit is available if a tool returned it. Tools only return recently verified pricing; if a tool says there's nothing verified, say you don't have current pricing for that and offer to have the team text or email options.
- Mention the price is as of when it was checked ("as of last week"). The leasing office confirms exact availability.
- Never invent buildings, amenities, fees, or specials. If you don't know, say so and offer a follow-up.

WHAT TO DO
- Find out: city or neighborhood, bedrooms, budget, move-in timing, pets.
- search_listings for filter questions; search_knowledge for vibe questions ("quiet", "rooftop pool"); find_building whenever they name a building, then get_building_details.
- Push gently toward a tour. For a tour: find_building, get_tour_slots, offer two open times, get their first name, then book_tour. Read the confirmation back.
- If they're not ready to tour but want options sent, use create_lead with what they're looking for.
- You already have their phone number from caller ID. Only ask for a phone number if they want to be reached at a different one. Ask for email only if they want things emailed.
- Save once per call. Don't ask for contact details before they want something from you.

${briefsPromptSection()}

Keep it warm, quick, and useful. End the call politely once they're done.`;
}

/** Stacy in the chat bubble on a microsite. */
export function micrositeChatInstructions(opts: {
  today: string;
  building: string | null;
  phoneNumber: string;
}): string {
  const where = opts.building
    ? `You're the chat assistant on Staycio's independent info site about ${opts.building}. Most people here are asking about ${opts.building}.`
    : "You're the chat assistant on one of Staycio's independent building info sites.";

  return `You are Stacy, Staycio's AI apartment agent, chatting on a website.

Today is ${opts.today}. ${where}

HOW YOU WRITE
- Short: two or three sentences, plain text, no markdown headers or tables. Most readers are on a phone.
- Ask one question at a time. Give the best one or two options, not a list.

HONESTY (most important)
- Only quote a price or say a unit is available if a tool returned it or the building notes below say it. Tools only return recently verified pricing; if there's nothing verified, say so and offer to have the team send options.
- Never invent buildings, amenities, fees, or specials.
- You are not the building, its developer, or its leasing office. If asked, say Staycio is an independent apartment service.

WHAT TO DO
- Answer their question first. Then find out bedrooms, budget, and move-in timing.
- To save them (pricing list, options, a tour), you need a name and an email or phone. Ask once, only after they want something. Then call create_lead (or book_tour for a catalog building) and confirm what was saved.
- Tools: search_listings for filters, search_knowledge for vibe questions, find_building then get_building_details for catalog buildings.
- If they'd rather talk, they can call you at ${opts.phoneNumber}, any time. Calls can't take texts.

${briefsPromptSection()}`;
}

type Schema = { name: VoiceToolName; description: string; parameters: Record<string, unknown> };

const citySlug = {
  type: "string",
  description: `City slug, one of: ${CITY_SLUG_LIST}. "new-york" for NYC, "los-angeles" for LA.`,
};

const buildingName = { type: "string", description: "Exact building name, as find_building returned it" };

export const VOICE_TOOL_SCHEMAS: Schema[] = [
  {
    name: "find_building",
    description: "Look up a building by name (partial names work). Returns its exact name and id for the other building tools.",
    parameters: {
      type: "object",
      properties: { name: { type: "string" }, city_slug: citySlug },
      required: ["name"],
    },
  },
  {
    name: "search_listings",
    description: "Search units with recently verified pricing by filters. Returns the top few matches.",
    parameters: {
      type: "object",
      properties: {
        city_slug: citySlug,
        neighborhood_slugs: { type: "array", items: { type: "string" } },
        beds_min: { type: "integer" },
        beds_max: { type: "integer" },
        budget_min: { type: "integer" },
        budget_max: { type: "integer" },
        move_in_date: { type: "string", description: "YYYY-MM-DD" },
        pet_friendly: { type: "boolean" },
        parking_required: { type: "boolean" },
        sort: { type: "string", enum: ["best_match", "price_low", "price_high", "newest", "sqft_high"] },
      },
      required: ["city_slug"],
    },
  },
  {
    name: "get_building_details",
    description: "Details, amenities, policies and verified pricing for one building.",
    parameters: {
      type: "object",
      properties: { building_name: buildingName, building_id: { type: "string" } },
      required: ["building_name"],
    },
  },
  {
    name: "search_knowledge",
    description: "Natural-language search of building descriptions, for vibe or amenity questions.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" }, city_slug: citySlug },
      required: ["query"],
    },
  },
  {
    name: "get_tour_slots",
    description: "Open in-person tour times for a building over the next week.",
    parameters: {
      type: "object",
      properties: { building_name: buildingName, building_id: { type: "string" } },
      required: ["building_name"],
    },
  },
  {
    name: "book_tour",
    description:
      "Book an in-person tour. Needs the building, date, time and their name. On a call, caller ID is their phone unless they give another; in chat, ask for a phone or email first.",
    parameters: {
      type: "object",
      properties: {
        building_name: buildingName,
        building_id: { type: "string" },
        tour_date: { type: "string", description: "YYYY-MM-DD" },
        tour_time: { type: "string", description: "HH:MM, 24h, from get_tour_slots" },
        name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string", description: "On a call, only if different from the number they called from" },
        notes: { type: "string", description: "Beds, budget, move-in, pets, anything useful to the showing agent" },
        conversation_summary: { type: "string" },
      },
      required: ["building_name", "tour_date", "tour_time", "name"],
    },
  },
  {
    name: "create_lead",
    description:
      "Save the caller as a lead so the team follows up (send options, answer a question). Not for tours; use book_tour.",
    parameters: {
      type: "object",
      properties: {
        city_slug: citySlug,
        name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string", description: "On a call, only if different from the number they called from" },
        budget_min: { type: "integer" },
        budget_max: { type: "integer" },
        beds: { type: "integer" },
        move_in_date: { type: "string", description: "YYYY-MM-DD" },
        notes: { type: "string" },
        building_names: {
          type: "array",
          items: { type: "string" },
          description: "Buildings they're interested in, exact names",
        },
        conversation_summary: { type: "string" },
      },
      required: ["city_slug"],
    },
  },
];
