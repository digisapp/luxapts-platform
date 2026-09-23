import { createAdminClient } from "@/lib/supabase/server";
import { executeTool } from "@/lib/xai/tool-executor";
import { normalizeCitySlug } from "@/lib/constants/cities";
import { getFirstRelation } from "@/lib/db-helpers";
import { isValidUUID } from "@/lib/utils";
import { getBuildingTourSlots } from "@/lib/tours/slots";
import { callSessionKey, type CallInfo } from "@/lib/voice/auth";
import { verifiedBuildingDetails, verifiedSearchResults } from "@/lib/voice/verified";

/**
 * Tools for Stacy on the phone. Same data and lead pipeline as web chat
 * (executeTool), with three differences that only matter out loud:
 *
 * - prices and availability are filtered to recently verified units;
 * - callers say building names, not ids, so there is a name lookup;
 * - a tour is booked against the real slot calendar, and the lead defaults to
 *   the caller's own number so nobody has to spell a phone number to a robot.
 */

export const VOICE_TOOL_NAMES = [
  "find_building",
  "search_listings",
  "get_building_details",
  "search_knowledge",
  "get_tour_slots",
  "book_tour",
  "create_lead",
] as const;

export type VoiceToolName = (typeof VOICE_TOOL_NAMES)[number];

export function isVoiceToolName(name: unknown): name is VoiceToolName {
  return typeof name === "string" && (VOICE_TOOL_NAMES as readonly string[]).includes(name);
}

type Args = Record<string, unknown>;

/**
 * Where a conversation is happening, which decides how its lead is recorded.
 * Phone calls and microsite chat run the same tools.
 */
export interface LeadChannel {
  /** chat_sessions.session_key; also enforces one lead per conversation. */
  sessionKey: string;
  /** Contact number to use when the person doesn't give one (caller ID). */
  defaultPhone: string | null;
  /** leads.source as accepted by /api/leads. */
  source: "voice" | "chat";
  /** Written after insert: final leads.source and source_detail. */
  finalSource?: "microsite";
  sourceDetail: string;
  /** Appended to the lead's notes. */
  note: string;
}

export function phoneChannel(call: CallInfo): LeadChannel {
  return {
    sessionKey: callSessionKey(call.id),
    defaultPhone: call.caller,
    source: "voice",
    sourceDetail: `phone:${call.dialed ?? "unknown"}`,
    note: `Phone call${call.caller ? ` from ${call.caller}` : ""}${call.dialed ? ` to ${call.dialed}` : ""}.`,
  };
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** A call produces at most one lead, however many times the model asks. */
async function callAlreadyHasLead(sessionKey: string): Promise<boolean> {
  const { data } = await createAdminClient()
    .from("chat_sessions")
    .select("lead_id")
    .eq("session_key", sessionKey)
    .maybeSingle();
  return Boolean(data?.lead_id);
}

async function findBuilding(args: Args) {
  const name = str(args.name).replace(/[%_\\,()"]/g, "").slice(0, 100);
  if (name.length < 2) return { error: "Say the building name." };

  const citySlug = str(args.city_slug) ? normalizeCitySlug(args.city_slug) : "";
  let query = createAdminClient()
    .from("buildings")
    .select("id, name, address_1, cities!inner(slug, name), neighborhoods(name)")
    .eq("status", "active")
    .ilike("name", `%${name}%`)
    .limit(5);
  if (citySlug) query = query.eq("cities.slug", citySlug);

  const { data, error } = await query;
  if (error) {
    console.error("Voice find_building failed:", error);
    return { error: "Building lookup failed." };
  }
  const matches = (data ?? []).map((b) => {
    const city = getFirstRelation(b.cities as { slug: string; name: string } | { slug: string; name: string }[] | null);
    const hood = getFirstRelation(b.neighborhoods as { name: string } | { name: string }[] | null);
    return {
      building_id: b.id,
      name: b.name,
      address: b.address_1,
      neighborhood: hood?.name ?? null,
      city: city?.name ?? null,
      city_slug: city?.slug ?? null,
    };
  });
  return matches.length
    ? { matches }
    : { matches: [], note: "No building by that name in our catalog. Ask them to spell it, or search by area instead." };
}

/**
 * The building a tool call means. Models garble 36-character ids when copying
 * them between tool calls, so every building tool also takes the name, and an
 * id that doesn't exist falls back to it.
 */
async function resolveBuildingId(args: Args): Promise<string | null> {
  const id = str(args.building_id);
  if (isValidUUID(id)) {
    const { data } = await createAdminClient()
      .from("buildings")
      .select("id")
      .eq("id", id)
      .eq("status", "active")
      .maybeSingle();
    if (data) return data.id as string;
  }
  if (!str(args.building_name)) return null;
  const found = await findBuilding({ name: args.building_name });
  const matches = ("matches" in found && found.matches) || [];
  // Prefer an exact name match; otherwise only accept an unambiguous one.
  const wanted = str(args.building_name).toLowerCase();
  const exact = matches.find((m) => String(m.name).toLowerCase() === wanted);
  if (exact) return exact.building_id as string;
  return matches.length === 1 ? (matches[0].building_id as string) : null;
}

const UNKNOWN_BUILDING = {
  error: "Couldn't tell which building. Use find_building and pass its exact name as building_name.",
};

async function tourSlots(buildingId: string) {
  const days = await getBuildingTourSlots(createAdminClient(), buildingId, new Date());
  return {
    instant: days.length > 0,
    days: days.slice(0, 4).map((d) => ({
      date: d.date,
      times: d.slots.filter((s) => s.available > 0).map((s) => s.time),
    })),
    ...(days.length === 0
      ? {
          note:
            "No instant slots. You can still take a tour request for the day and rough time they want; " +
            "say the team will confirm the exact time.",
        }
      : {}),
  };
}

async function buildingCitySlug(buildingId: string): Promise<string | null> {
  const { data } = await createAdminClient()
    .from("buildings")
    .select("cities(slug)")
    .eq("id", buildingId)
    .maybeSingle();
  return getFirstRelation(data?.cities as { slug: string } | { slug: string }[] | null)?.slug ?? null;
}

/** Record where the lead came from. Never throws. */
async function tagLeadSource(leadId: string, channel: LeadChannel) {
  try {
    await createAdminClient()
      .from("leads")
      .update({
        source_detail: channel.sourceDetail,
        ...(channel.finalSource ? { source: channel.finalSource } : {}),
      })
      .eq("id", leadId);
  } catch (err) {
    console.error("Voice lead source tag failed:", err);
  }
}

async function createLead(args: Args, channel: LeadChannel, baseUrl: string) {
  const { sessionKey } = channel;
  if (await callAlreadyHasLead(sessionKey)) {
    return { error: "Their details are already saved. Don't save again; just confirm what was saved." };
  }

  const result = await executeTool(
    "create_lead",
    {
      ...args,
      // The caller's own number is the contact unless they gave another.
      phone: str(args.phone) || channel.defaultPhone || undefined,
      notes: [str(args.notes), channel.note].filter(Boolean).join("\n"),
    },
    baseUrl,
    { leadsCreated: 0, sessionKey, leadSource: channel.source }
  );

  const leadId = (result as { lead_id?: string } | null)?.lead_id;
  if (leadId) {
    await tagLeadSource(leadId, channel);
    return { saved: true };
  }
  return result;
}

async function bookTour(args: Args, channel: LeadChannel, baseUrl: string) {
  const buildingId = await resolveBuildingId(args);
  if (!buildingId) return UNKNOWN_BUILDING;
  const date = str(args.tour_date);
  const time = str(args.tour_time).slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return { error: "tour_date must be YYYY-MM-DD and tour_time HH:MM (24h)." };
  }
  if (!str(args.name)) return { error: "Ask for their name before booking." };

  // When the building has a real calendar, only book a slot it offers.
  // Without one, this is a request the team confirms.
  const slots = await tourSlots(buildingId);
  if (slots.instant) {
    const offered = slots.days.find((d) => d.date === date)?.times ?? [];
    if (!offered.some((t) => t.slice(0, 5) === time)) {
      return { error: "That time isn't open.", open_slots: slots.days };
    }
  }

  const citySlug = await buildingCitySlug(buildingId);
  if (!citySlug) return { error: "Couldn't find that building." };

  const result = await createLead(
    {
      city_slug: citySlug,
      name: args.name,
      email: args.email,
      phone: args.phone,
      notes: args.notes,
      tour_date: date,
      tour_time: time,
      targets: [{ building_id: buildingId, rank: 1 }],
      conversation_summary: args.conversation_summary,
    },
    channel,
    baseUrl
  );
  if ((result as { saved?: boolean }).saved) {
    return {
      booked: true,
      confirmed: slots.instant,
      say: slots.instant
        ? "Tour is booked; a Staycio showing agent will meet them there."
        : "Tour request is in; the team will confirm the exact time by text or call.",
    };
  }
  return result;
}

export async function executeVoiceTool(
  name: VoiceToolName,
  args: Args,
  channel: LeadChannel,
  baseUrl: string
): Promise<unknown> {
  try {
    switch (name) {
      case "find_building":
        return await findBuilding(args);

      case "search_listings": {
        // best_match puts the freshest price captures first, so verified units
        // lead the page; a price sort would let January's fabricated rents
        // crowd them out. Price order is applied after filtering instead.
        const result = await executeTool(
          "search_listings",
          { ...args, sort: "best_match", limit: 25 },
          baseUrl
        );
        return verifiedSearchResults(result, str(args.sort));
      }

      case "get_building_details": {
        const buildingId = await resolveBuildingId(args);
        if (!buildingId) return UNKNOWN_BUILDING;
        const details = await executeTool("get_building_details", { building_id: buildingId }, baseUrl);
        const { data: units } = await createAdminClient()
          .from("units_with_latest_price")
          .select("beds, baths, sqft, available_on, latest_rent, price_captured_at")
          .eq("building_id", buildingId)
          .eq("is_available", true);
        return verifiedBuildingDetails(details, units ?? []);
      }

      case "search_knowledge":
        return await executeTool("search_knowledge", args, baseUrl);

      case "get_tour_slots": {
        const buildingId = await resolveBuildingId(args);
        if (!buildingId) return UNKNOWN_BUILDING;
        return await tourSlots(buildingId);
      }

      case "book_tour":
        return await bookTour(args, channel, baseUrl);

      case "create_lead": {
        // Buildings come in by name; an unresolvable one is dropped rather
        // than failing validation and losing the lead.
        const names = Array.isArray(args.building_names) ? args.building_names.slice(0, 5) : [];
        const ids = await Promise.all(names.map((n) => resolveBuildingId({ building_name: n })));
        const targets = [...new Set(ids.filter((id): id is string => Boolean(id)))].map(
          (building_id, i) => ({ building_id, rank: i + 1 })
        );
        const rest = { ...args };
        delete rest.building_names;
        return await createLead({ ...rest, targets: targets.length ? targets : undefined }, channel, baseUrl);
      }
    }
  } catch (err) {
    console.error(`Voice tool ${name} failed:`, err);
    return { error: `${name} failed.` };
  }
}
