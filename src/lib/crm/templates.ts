// Saved texts and emails with {merge_fields}, filled per contact. Pure, so
// the contact page, the templates page preview and the tests share it.

import { formatPrice, telHref } from "@/lib/utils";
import { nyDateKey } from "./dates";
import type { CrmContact, CrmSender } from "./types";

export const MERGE_FIELDS = [
  { key: "first_name", label: "First name", fallback: "there" },
  { key: "my_name", label: "Your name", fallback: "" },
  { key: "company", label: "Your company", fallback: "" },
  { key: "listing", label: "Listing they asked about", fallback: "an apartment" },
  { key: "neighborhood", label: "Neighborhood", fallback: "the city" },
  { key: "beds", label: "Size (1-bedroom)", fallback: "" },
  { key: "budget", label: "Price ($5,400)", fallback: "your budget" },
  { key: "when", label: "When they inquired (last March)", fallback: "a while back" },
] as const;

export type MergeKey = (typeof MERGE_FIELDS)[number]["key"];

type MergeContact = Pick<CrmContact, "first_name" | "property_address" | "neighborhood" | "beds" | "price" | "added_at">;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "recently", "in March", "last November", "back in June 2023". */
export function whenText(addedAt: string | null, today: string): string | null {
  if (!addedAt) return null;
  const added = nyDateKey(new Date(addedAt));
  const [ay, am] = [Number(added.slice(0, 4)), Number(added.slice(5, 7))];
  const [ty, tm] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  const months = (ty - ay) * 12 + (tm - am);
  if (months <= 1) return "recently";
  if (ay === ty) return `in ${MONTHS[am - 1]}`;
  if (ay === ty - 1) return `last ${MONTHS[am - 1]}`;
  return `back in ${MONTHS[am - 1]} ${ay}`;
}

function bedsText(beds: number | null): string | null {
  if (beds === null || beds === undefined) return null;
  return beds === 0 ? "studio" : `${beds}-bedroom`;
}

/** Every field's value for one contact; null where the contact has none. */
export function mergeValues(c: MergeContact, sender: CrmSender, today: string): Record<MergeKey, string | null> {
  return {
    first_name: c.first_name?.trim() || null,
    my_name: sender.name.trim() || null,
    company: sender.company.trim() || null,
    listing: c.property_address?.trim() || null,
    neighborhood: c.neighborhood?.trim() || null,
    beds: bedsText(c.beds),
    budget: c.price && c.price < 50_000 ? formatPrice(c.price) : null,
    when: whenText(c.added_at, today),
  };
}

const FALLBACKS = Object.fromEntries(MERGE_FIELDS.map((f) => [f.key, f.fallback])) as Record<MergeKey, string>;

/**
 * Fills {fields}; a field the contact lacks gets its fallback ("there",
 * "an apartment"), or nothing, and the spacing left behind is tidied.
 * Unknown {words} are left as typed.
 */
export function renderTemplate(text: string, values: Record<MergeKey, string | null>): string {
  // "from {company}" reads as "from." without a company, so the phrase goes.
  const source = values.company ? text : text.replace(/[ \t]+(?:from|with|at)[ \t]+\{company\}/g, "");
  return source
    .replace(/\{(\w+)\}/g, (whole, key: string) =>
      key in values ? (values[key as MergeKey] ?? FALLBACKS[key as MergeKey]) : whole
    )
    .split("\n")
    .map((line) =>
      line
        .replace(/[ \t]{2,}/g, " ")
        .replace(/ ([,.!?])/g, "$1")
        // A field emptied after a comma: "listings, ." → "listings."
        .replace(/,+([.!?])/g, "$1")
        .replace(/,(\s*,)+/g, ",")
        .trimEnd()
    )
    .join("\n")
    .trim();
}

/** Fields a template uses that this sender has not filled in yet. */
export function missingSenderFields(text: string, sender: CrmSender): ("my_name" | "company")[] {
  const out: ("my_name" | "company")[] = [];
  if (text.includes("{my_name}") && !sender.name.trim()) out.push("my_name");
  if (text.includes("{company}") && !sender.company.trim()) out.push("company");
  return out;
}

/**
 * An sms: link with the message filled in. "?&body=" is the form both iOS
 * (which reads "&body") and Android (which reads "?body") accept.
 */
export function smsHref(phone: string, body?: string): string {
  const to = `sms:${telHref(phone)}`;
  return body ? `${to}?&body=${encodeURIComponent(body)}` : to;
}

export function mailtoHref(email: string, subject?: string, body?: string): string {
  const params = new URLSearchParams();
  if (subject) params.set("subject", subject);
  if (body) params.set("body", body);
  // URLSearchParams writes spaces as "+", which mail apps show literally.
  const qs = params.toString().replace(/\+/g, "%20");
  return `mailto:${email}${qs ? `?${qs}` : ""}`;
}

export function whatsappTextHref(waLink: string, body?: string): string {
  return body ? `${waLink}?text=${encodeURIComponent(body)}` : waLink;
}
