// Pure display helpers for the NYC contacts screens (tested in
// nyc-format.test.ts).

import { formatPrice } from "@/lib/utils";
import { ageLabel } from "@/components/admin/leads/lead-format";
import type { CrmContact } from "@/lib/crm/types";
import {
  BUDGET_BANDS,
  LEASE_MIN_AGE_DAYS,
  leaseMonths,
  NO_AGENT,
  type CrmFilters,
} from "@/lib/crm/filters";
import { stageMeta } from "@/lib/crm/stages";
import { daysBetween, nyDateKey } from "@/lib/crm/dates";

export type Tone = "amber" | "sky" | "muted" | "red";

type TouchFields = Pick<CrmContact, "do_not_contact" | "contacted" | "last_contacted_at" | "last_inbound_at">;

/** Where things stand with someone, in two or three words. */
export function touchSummary(c: TouchFields, now: number): { label: string; tone: Tone } {
  if (c.do_not_contact) return { label: "Do not contact", tone: "red" };
  const replied = c.last_inbound_at ? Date.parse(c.last_inbound_at) : null;
  const contacted = c.last_contacted_at ? Date.parse(c.last_contacted_at) : null;
  if (replied !== null && (contacted === null || replied > contacted)) {
    return { label: `Replied ${ageLabel(c.last_inbound_at!, now)}`, tone: "sky" };
  }
  if (contacted !== null) return { label: `Contacted ${ageLabel(c.last_contacted_at!, now)}`, tone: "muted" };
  if (c.contacted) return { label: "Contacted", tone: "muted" };
  return { label: "Never contacted", tone: "amber" };
}

export const TONE_TEXT: Record<Tone, string> = {
  amber: "text-amber-300",
  sky: "text-sky-300",
  muted: "text-muted-foreground",
  red: "text-red-300",
};

/** "100 Example St #5F · Tribeca · $5,400 · 1 bd" — the listing they asked about. */
export function inquirySummary(
  c: Pick<CrmContact, "property_address" | "price" | "beds"> & { neighborhood?: string | null }
): string | null {
  const parts = [
    c.property_address,
    c.neighborhood,
    c.price ? formatPrice(c.price) : null,
    c.beds === null || c.beds === undefined ? null : c.beds === 0 ? "Studio" : `${c.beds} bd`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

export function durationText(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return s ? `${m}m ${s}s` : `${m}m`;
}

export const OUTCOME_LABELS: Record<string, string> = {
  talked: "Talked",
  voicemail: "Left voicemail",
  no_answer: "No answer",
  bad_number: "Bad number",
};

/** "Talked · 5m 4s", "No answer", "12s". */
export function callSummary(outcome: string | null, durationSec: unknown): string | null {
  const parts = [
    outcome ? OUTCOME_LABELS[outcome] ?? outcome : null,
    typeof durationSec === "number" && durationSec > 0 ? durationText(durationSec) : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/** A first name to put in task titles and buttons. */
export function firstNameOf(c: Pick<CrmContact, "first_name" | "last_name">): string {
  return c.first_name || c.last_name || "them";
}

const TOUCH_TEXT: Record<string, string> = {
  hot: "Hot (replied in 6 months)",
  warm: "Warm (replied, not lately)",
  cold: "Cold (never replied)",
  never: "Never contacted",
  replied: "Replied before",
  stale30: "No touch in 30+ days",
  stale90: "No touch in 90+ days",
  stale180: "No touch in 180+ days",
};

const REACH_TEXT: Record<string, string> = {
  phone: "Has a phone",
  email: "Has an email",
  none: "No phone or email",
};

/** The filters in words, for the summary line and saved-list hints. */
export function describeFilters(f: CrmFilters): string[] {
  const out: string[] = [];
  if (f.q) out.push(`“${f.q}”`);
  if (f.stages?.length) {
    out.push(f.stages.length === 1 ? `Stage: ${stageMeta(f.stages[0]).label}` : `${f.stages.length} stages`);
  }
  if (f.tag) out.push(`Tag: ${f.tag}`);
  if (f.source) out.push(`Source: ${f.source}`);
  if (f.agent) out.push(`Agent: ${f.agent === NO_AGENT ? "Unassigned" : f.agent}`);
  if (f.hood) out.push(f.hood);
  if (f.budget) out.push(BUDGET_BANDS[f.budget].label);
  if (f.beds) out.push(f.beds === "0" ? "Studio" : f.beds === "3" ? "3+ beds" : `${f.beds} bed`);
  if (f.lease) out.push("Lease up soon");
  if (f.touch) out.push(TOUCH_TEXT[f.touch]);
  if (f.reach) out.push(REACH_TEXT[f.reach]);
  if (f.due) out.push("Follow-up due");
  if (f.added) out.push(f.added === "365" ? "Added last year" : `Added last ${f.added} days`);
  if (f.scope === "archive") out.push("Archive");
  else if (f.scope === "active") out.push("Not archived");
  return out;
}

/**
 * Whether someone's lease is probably coming up: they first inquired in
 * this month or the next two, in some past year, 10+ months ago (the same
 * rule as the "Lease up soon" list).
 */
export function leaseUpSoon(addedAt: string | null, today: string): boolean {
  if (!addedAt) return false;
  const added = nyDateKey(new Date(addedAt));
  return daysBetween(added, today) >= LEASE_MIN_AGE_DAYS && leaseMonths(today).includes(Number(added.slice(5, 7)));
}

/**
 * Imported links go into hrefs, so only http(s) passes; a "javascript:"
 * value in a CSV cell would otherwise run on click.
 */
export function safeHttpUrl(url: string | null | undefined): string | null {
  const v = (url ?? "").trim();
  return /^https?:\/\/[^\s]+$/i.test(v) ? v : null;
}
