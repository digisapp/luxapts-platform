import { createAdminClient } from "@/lib/supabase/server";
import { bridgeLeadToShowing } from "@/lib/leads/bridge";
import { CITY_SLUGS, isKnownCitySlug, normalizeCitySlug } from "@/lib/constants/cities";
import { createLeadSchema, leadFieldsSchema, type CreateLeadInput } from "@/lib/validations";
import { isValidUUID } from "@/lib/utils";

/**
 * One lead per conversation, on every channel (web chat, microsite chat,
 * phone). The first create_lead/book_tour creates it through /api/leads; every
 * later one adds to it here, so a tour booked or a budget given after the
 * contact details were saved still reaches the lead instead of being refused.
 */

type Args = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

const MAX_MERGED_NOTES = 10_000;

/** The lead this conversation already produced, if any. Never throws. */
export async function sessionLeadId(sessionKey: string | null | undefined): Promise<string | null> {
  if (!sessionKey) return null;
  try {
    const { data } = await createAdminClient()
      .from("chat_sessions")
      .select("lead_id")
      .eq("session_key", sessionKey)
      .maybeSingle();
    return (data?.lead_id as string | null | undefined) ?? null;
  } catch (err) {
    console.error("Session lead lookup failed:", err);
    return null;
  }
}

/** "2:00 PM", "2pm", "noon", "14:00:00" -> "14:00". Null when it isn't a clock time. */
export function normalizeTourTime(raw: unknown): string | null {
  const s = str(raw).toLowerCase().replace(/\./g, "");
  if (s === "noon") return "12:00";
  const m = /^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(am|pm|a|p)?$/.exec(s);
  // A bare "14" or "2" is ambiguous; ask rather than guess.
  if (!m || (!m[2] && !m[3])) return null;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  if (m[3]) {
    if (hour < 1 || hour > 12) return null;
    if (m[3].startsWith("p") && hour !== 12) hour += 12;
    if (m[3].startsWith("a") && hour === 12) hour = 0;
  }
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** A real calendar date as YYYY-MM-DD ("2026-11-01T00:00:00Z" is trimmed). */
function normalizeDate(raw: unknown): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(raw));
  if (!m) return undefined;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? `${m[1]}-${m[2]}-${m[3]}` : undefined;
}

function toNumber(raw: unknown): number | undefined {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : undefined;
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  const n = Number(raw.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

function toTargets(raw: unknown): CreateLeadInput["targets"] {
  if (!Array.isArray(raw)) return undefined;
  const targets = raw
    .slice(0, 20)
    .map((t) => {
      const row = (t && typeof t === "object" ? t : {}) as Args;
      const buildingId = str(row.building_id);
      const unitId = str(row.unit_id);
      const rank = toNumber(row.rank);
      return {
        ...(isValidUUID(buildingId) ? { building_id: buildingId } : {}),
        ...(isValidUUID(unitId) ? { unit_id: unitId } : {}),
        ...(rank !== undefined && Number.isInteger(rank) && rank >= 1 && rank <= 100 ? { rank } : {}),
      };
    })
    .filter((t) => t.building_id || t.unit_id);
  return targets.length ? targets : undefined;
}

const hasValue = (v: unknown) =>
  v !== undefined && v !== null && !(typeof v === "string" && !v.trim()) && !(Array.isArray(v) && !v.length);

export interface LeadPrepOptions {
  source: CreateLeadInput["source"];
  /** Forces the city whatever the model said (microsite chat is always Miami). */
  citySlug?: string | null;
  /** Contact number when the person gave none (caller ID). New leads only. */
  defaultPhone?: string | null;
  /** A new lead needs an email or phone; additions to an existing one don't. */
  isNew: boolean;
}

export type PreparedLead = { data: CreateLeadInput; dropped: string[] } | { error: string };

/**
 * Turn model-written create_lead arguments into what /api/leads accepts.
 * One malformed optional field ("2:00 PM", a garbled target id) used to 400
 * the whole lead; those are now normalized or dropped (and reported back),
 * and only a problem the model can actually fix comes back as an error.
 */
export function prepareLeadInput(args: Args, opts: LeadPrepOptions): PreparedLead {
  const citySlug = opts.citySlug || normalizeCitySlug(args.city_slug);
  if (opts.isNew && !isKnownCitySlug(citySlug)) {
    return { error: `Unknown city_slug "${str(args.city_slug)}". Use one of: ${CITY_SLUGS.join(", ")}.` };
  }

  const beds = toNumber(args.beds);
  const budgetMin = toNumber(args.budget_min);
  const budgetMax = toNumber(args.budget_max);
  const candidate: Record<string, unknown> = {
    source: opts.source,
    // An update never moves the lead's city; this only satisfies the schema.
    city_slug: isKnownCitySlug(citySlug) ? citySlug : "miami",
    name: str(args.name).slice(0, 200) || undefined,
    email: str(args.email) || undefined,
    phone: str(args.phone) || (opts.isNew ? opts.defaultPhone || undefined : undefined),
    budget_min: budgetMin === undefined ? undefined : Math.round(budgetMin),
    budget_max: budgetMax === undefined ? undefined : Math.round(budgetMax),
    beds: beds !== undefined && Number.isInteger(beds) ? beds : undefined,
    move_in_date: normalizeDate(args.move_in_date),
    tour_date: normalizeDate(args.tour_date),
    tour_time: normalizeTourTime(args.tour_time) ?? undefined,
    notes: str(args.notes).slice(0, 5000) || undefined,
    targets: toTargets(args.targets),
    conversation_summary: str(args.conversation_summary).slice(0, 10_000) || undefined,
  };

  // Anything the model sent that didn't survive normalization.
  const dropped = Object.keys(candidate).filter(
    (k) => k !== "source" && k !== "city_slug" && hasValue(args[k]) && candidate[k] === undefined
  );

  // Drop whatever still fails field validation (an unparseable email next
  // to a good phone, an out-of-range budget) rather than losing the lead.
  for (let i = 0; i < 20; i++) {
    const parsed = leadFieldsSchema.safeParse(candidate);
    if (parsed.success) break;
    const fields = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? "")))];
    const fixable = fields.filter((f) => f && f !== "source" && f !== "city_slug" && f in candidate);
    if (!fixable.length) return { error: parsed.error.issues[0]?.message || "Invalid lead details." };
    for (const f of fixable) {
      delete candidate[f];
      if (!dropped.includes(f)) dropped.push(f);
    }
  }

  if (opts.isNew && !candidate.email && !candidate.phone) {
    const bad = dropped.filter((f) => f === "email" || f === "phone");
    return {
      error: bad.length
        ? `The ${bad.join(" and ")} they gave doesn't look valid. Ask them to repeat it, then try again.`
        : "A lead needs an email address or a phone number. Ask the user for one, then call create_lead again.",
    };
  }

  const final = (opts.isNew ? createLeadSchema : leadFieldsSchema).safeParse(candidate);
  if (!final.success) return { error: final.error.issues[0]?.message || "Invalid lead details." };
  return { data: final.data, dropped };
}

/** Append only the note lines the lead doesn't already carry. Null when nothing is new. */
export function mergeNotes(existing: string | null | undefined, incoming: string | null | undefined): string | null {
  const base = (existing ?? "").trim();
  const fresh = (incoming ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line, i, all) => line && !base.includes(line) && all.indexOf(line) === i);
  if (!fresh.length) return null;
  const addition = fresh.join("\n").slice(0, 5000);
  if (!base) return addition;
  return `${base.slice(0, Math.max(0, MAX_MERGED_NOTES - addition.length - 1))}\n${addition}`;
}

export interface LeadUpdateResult {
  lead_id: string;
  updated: true;
  /** Lead columns that changed. */
  fields: string[];
  /** Whether this update posted a tour to the showing network. */
  bridged: boolean;
}

/**
 * Add what a later tool call learned to the conversation's existing lead:
 * contact fields and preferences overwrite, notes append, new building
 * targets are added, and a tour date posts the showing lead the way
 * /api/leads does on create. Returns null when the lead no longer exists
 * (deleted by an admin), so the caller creates a fresh one.
 */
export async function updateSessionLead(
  leadId: string,
  input: CreateLeadInput
): Promise<LeadUpdateResult | { error: string } | null> {
  const supabase = createAdminClient();
  const { data: lead, error: readError } = await supabase
    .from("leads")
    .select("id, name, user_email, user_phone, notes")
    .eq("id", leadId)
    .maybeSingle();
  if (readError) {
    console.error("Session lead read failed:", readError);
    return { error: "Couldn't update the request already saved for this conversation." };
  }
  if (!lead) return null;

  const patch: Record<string, unknown> = {};
  if (input.name) patch.name = input.name;
  if (input.email) patch.user_email = input.email;
  if (input.phone) patch.user_phone = input.phone;
  if (input.budget_min !== undefined) patch.budget_min = input.budget_min;
  if (input.budget_max !== undefined) patch.budget_max = input.budget_max;
  if (input.beds !== undefined) patch.beds = input.beds;
  if (input.move_in_date) patch.move_in_date = input.move_in_date;
  if (input.tour_date) {
    patch.tour_date = input.tour_date;
    // A new day without a time must not keep the old day's time.
    patch.tour_time = input.tour_time ?? null;
  }
  const notes = mergeNotes(lead.notes as string | null, input.notes);
  if (notes !== null) patch.notes = notes;

  const fields = Object.keys(patch);
  if (fields.length) {
    const { error } = await supabase.from("leads").update(patch).eq("id", leadId);
    if (error) {
      console.error("Session lead update failed:", error);
      return { error: "Couldn't update the request already saved for this conversation." };
    }
  }

  const { data: existingTargets } = await supabase
    .from("lead_targets")
    .select("building_id, unit_id, rank")
    .eq("lead_id", leadId)
    .order("rank", { ascending: true });
  const targetKey = (t: { building_id?: string | null; unit_id?: string | null }) =>
    `${t.building_id ?? ""}|${t.unit_id ?? ""}`;
  const have = new Set((existingTargets ?? []).map(targetKey));
  const newTargets = (input.targets ?? []).filter((t) => !have.has(targetKey(t)));
  if (newTargets.length) {
    const { error } = await supabase.from("lead_targets").insert(
      newTargets.map((t, i) => ({
        lead_id: leadId,
        building_id: t.building_id ?? null,
        unit_id: t.unit_id ?? null,
        rank: (existingTargets?.length ?? 0) + i + 1,
      }))
    );
    if (error) console.error("Session lead target insert failed:", error);
  }

  const events: Record<string, unknown>[] = [
    {
      lead_id: leadId,
      type: "lead_updated",
      payload: { source: input.source, fields, targets_added: newTargets.length },
    },
  ];
  if (input.conversation_summary) {
    events.push({
      lead_id: leadId,
      type: "conversation_summary",
      payload: { summary: input.conversation_summary },
    });
  }
  const { error: eventError } = await supabase.from("lead_events").insert(events);
  if (eventError) console.error("Session lead event insert failed:", eventError);

  let bridged = false;
  if (input.tour_date) {
    const buildingId =
      input.targets?.find((t) => t.building_id)?.building_id ??
      (existingTargets ?? []).find((t) => t.building_id)?.building_id ??
      null;
    bridged = Boolean(
      await bridgeLeadToShowing(supabase, {
        leadId,
        buildingId,
        name: input.name ?? (lead.name as string | null),
        email: input.email ?? (lead.user_email as string | null),
        phone: input.phone ?? (lead.user_phone as string | null),
        tourDate: input.tour_date,
        tourTime: input.tour_time ?? null,
        notes: input.notes ?? (lead.notes as string | null),
      })
    );
  }

  return { lead_id: leadId, updated: true, fields, bridged };
}
