import type { LeadStatus } from "@/types/database";
import { MICROSITE_BUILDINGS, senderIdentityFor } from "@/lib/microsites";
import { briefByDomain } from "@/lib/voice/building-briefs";
import { micrositeFacts } from "@/lib/voice/microsite-facts";

/**
 * What the inbox needs to know about the lead behind a conversation: who
 * they are, how to reach them, what they asked for, and which building's
 * name the replies go out under.
 */
export interface LeadContext {
  id: string;
  name: string | null;
  email: string | null;
  /** E.164 or as typed on the form; null when we still don't have one. */
  phone: string | null;
  status: LeadStatus;
  /** The microsite they signed up on ("downtown6miami.com"), if any. */
  domain: string | null;
  /** "Downtown 6"; null for leads from the main site. */
  building: string | null;
  city: string | null;
  unitType: string | null;
  moveIn: string | null;
  /** The From header replies to this lead use. */
  sender: string;
  createdAt: string;
}

export const LEAD_STATUSES: LeadStatus[] = ["new", "contacted", "touring", "applied", "leased", "lost"];

/** "[downtown6miami.com] Downtown 6 — Unit: 2 Bedroom · Move-in: Q4 2026" -> parts. */
export function parseLeadNotes(notes: string | null | undefined): { unitType: string | null; moveIn: string | null } {
  const text = notes ?? "";
  const unit = text.match(/Unit:\s*([^·\n]+)/);
  const move = text.match(/Move-in:\s*([^·\n]+)/);
  const clean = (v: string | undefined) => {
    const t = (v ?? "").trim();
    return t && !/^not sure/i.test(t) ? t : null;
  };
  return { unitType: clean(unit?.[1]), moveIn: clean(move?.[1]) };
}

export interface LeadRowForContext {
  id: string;
  name: string | null;
  user_email: string | null;
  user_phone: string | null;
  status: LeadStatus;
  source_detail: string | null;
  notes: string | null;
  created_at: string;
  city?: { name: string | null } | null;
}

export function toLeadContext(row: LeadRowForContext, defaultFrom: string): LeadContext {
  const building = row.source_detail ? (MICROSITE_BUILDINGS[row.source_detail] ?? null) : null;
  const { unitType, moveIn } = parseLeadNotes(row.notes);
  return {
    id: row.id,
    name: row.name?.trim() || null,
    email: row.user_email?.trim() || null,
    phone: row.user_phone?.trim() || null,
    status: row.status,
    domain: building ? row.source_detail : null,
    building,
    city: row.city?.name ?? (building ? "Miami" : null),
    unitType,
    moveIn,
    sender: senderIdentityFor(row.source_detail, defaultFrom).from,
    createdAt: row.created_at,
  };
}

/**
 * What a building's own site publishes, for the AI drafting a reply: the
 * full brief for the three buildings that have one, else the page facts.
 * The same text Stacy's phone line and chat answer from, so the email
 * can't contradict them.
 */
export function buildingFactsFor(domain: string | null | undefined): string | null {
  if (!domain) return null;
  const brief = briefByDomain(domain);
  const facts = brief ? `${brief.name}: ${brief.brief}` : micrositeFacts(domain);
  // The briefs are written for the voice agent and name its tools.
  return facts ? facts.replace(/\s*\(create_lead\)/g, "") : null;
}
