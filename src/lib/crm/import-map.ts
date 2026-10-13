// CSV row → contact + timeline, for Follow Up Boss exports (and any CSV with
// recognisable headers). Pure, so it runs in the browser importer, the
// command-line importer and the tests alike.

import { fromLocal } from "@/lib/email/send-window";
import { DEFAULT_STAGE } from "./stages";
import {
  nameKey,
  normalizeEmail,
  realEmailsFirst,
  titleCase,
  normalizePhone,
  parseTags,
  parseWholeNumber,
  splitName,
  uniqueValues,
} from "./normalize";
import { parseCalls, parseNotes, parseTexts, shortHash, type HistoryEntry } from "./fub-history";
import type { ActivityDirection, ActivityKind, CallOutcome } from "./types";

export type ImportField =
  | "external_id"
  | "first_name"
  | "last_name"
  | "name"
  | "emails"
  | "phones"
  | "stage"
  | "source"
  | "assigned_to"
  | "tags"
  | "price"
  | "beds"
  | "move_in"
  | "property_address"
  | "property_city"
  | "property_state"
  | "property_link"
  | "neighborhood"
  | "background"
  | "added_at"
  | "is_contacted"
  | "message"
  | "notes"
  | "texts"
  | "calls";

/** Header aliases per field, most preferred first (compared via headerKey). */
const ALIASES: Record<Exclude<ImportField, "emails" | "phones" | "tags">, string[]> = {
  external_id: ["id", "personid", "contactid", "fubid"],
  first_name: ["firstname", "first", "givenname"],
  last_name: ["lastname", "last", "surname", "familyname"],
  name: ["name", "fullname", "contactname"],
  stage: ["stage", "leadstage", "status"],
  source: ["leadsource", "source"],
  assigned_to: ["assignedto", "assignedagent", "agent", "owner"],
  price: ["propertyprice", "budget", "maxprice", "price", "listingprice"],
  beds: ["propertybeds", "beds", "bedrooms"],
  move_in: ["month", "movein", "moveindate", "movedate", "timeframe"],
  property_address: ["propertyaddress"],
  property_city: ["propertycity"],
  property_state: ["propertystate"],
  property_link: ["propertylink", "listinglink", "listingurl"],
  neighborhood: ["neighborhood", "propertyneighborhood"],
  background: ["background", "backgroundinformation"],
  added_at: ["dateadded", "created", "createdat", "datecreated"],
  is_contacted: ["iscontacted", "contacted"],
  message: ["message", "inquirymessage"],
  notes: ["notes", "note"],
  texts: ["texts"],
  calls: ["calls"],
};

const EMAIL_HEADER = /^(email|emailaddress|mail)\d*$/;
const PHONE_HEADER = /^(phone|phonenumber|telephone|mobile|mobilephone|cell|cellphone|homephone|workphone)\d*$/;
const TAG_HEADER = /^(tags?|labels?)$/;

export const FIELD_LABELS: Record<ImportField, string> = {
  external_id: "Follow Up Boss ID",
  first_name: "First name",
  last_name: "Last name",
  name: "Full name",
  emails: "Emails",
  phones: "Phones",
  stage: "Stage",
  source: "Lead source",
  assigned_to: "Assigned agent",
  tags: "Tags",
  price: "Price",
  beds: "Beds",
  move_in: "Move-in",
  property_address: "Listing address",
  property_city: "Listing city",
  property_state: "Listing state",
  property_link: "Listing link",
  neighborhood: "Neighborhood",
  background: "Background",
  added_at: "Date added",
  is_contacted: "Contacted?",
  message: "Inquiry message",
  notes: "Notes history",
  texts: "Text history",
  calls: "Call history",
};

/** Tag added to anyone whose inquiry was for a Florida listing. */
export const FLORIDA_TAG = "Florida inquiry";

export function headerKey(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export interface ImportMapping {
  headers: string[];
  /** Column indexes per field, most preferred first. */
  fields: Partial<Record<ImportField, number[]>>;
  /** Columns kept verbatim in `extra`. */
  extra: number[];
  /**
   * Listing-description columns ("CONDO IN TRIBECA | ..."). The neighborhood
   * is read from them when there is no neighborhood column; they also stay
   * in `extra`, since the rest of the text is worth keeping.
   */
  descriptions: number[];
}

export function guessMapping(headers: string[]): ImportMapping {
  const keys = headers.map(headerKey);
  const fields: Partial<Record<ImportField, number[]>> = {};
  const used = new Set<number>();

  const multi = (field: ImportField, re: RegExp) => {
    const cols = keys.flatMap((k, i) => (re.test(k) ? [i] : []));
    if (cols.length) {
      fields[field] = cols;
      cols.forEach((c) => used.add(c));
    }
  };
  multi("emails", EMAIL_HEADER);
  multi("phones", PHONE_HEADER);
  multi("tags", TAG_HEADER);

  for (const [field, aliases] of Object.entries(ALIASES) as [ImportField, string[]][]) {
    const cols: number[] = [];
    for (const alias of aliases) {
      keys.forEach((k, i) => {
        if (k === alias && !used.has(i)) cols.push(i);
      });
    }
    if (cols.length) {
      fields[field] = cols;
      cols.forEach((c) => used.add(c));
    }
  }

  const extra = headers.flatMap((_, i) => (used.has(i) ? [] : [i]));
  const descriptions = keys.flatMap((k, i) => (k === "description" ? [i] : []));
  return { headers, fields, extra, descriptions };
}

export interface ImportActivity {
  kind: ActivityKind;
  direction: ActivityDirection | null;
  outcome: CallOutcome | null;
  occurred_at: string;
  actor: string | null;
  body: string | null;
  meta: Record<string, string | number>;
  import_key: string;
}

export interface ImportContact {
  external_id: string | null;
  first_name: string | null;
  last_name: string | null;
  emails: string[];
  phones: string[];
  stage: string;
  source: string | null;
  assigned_to: string | null;
  tags: string[];
  price: number | null;
  beds: number | null;
  move_in: string | null;
  property_address: string | null;
  property_city: string | null;
  property_state: string | null;
  property_link: string | null;
  neighborhood: string | null;
  background: string | null;
  added_at: string | null;
  contacted: boolean;
  last_contacted_at: string | null;
  last_inbound_at: string | null;
  last_activity_at: string | null;
  extra: Record<string, string>;
  activities: ImportActivity[];
}

/** "2023-03-06" or "3/6/2023" → noon that day in New York. */
export function parseDateValue(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  let y: number, m: number, d: number;
  let iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(value);
  if (iso) {
    [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else {
    iso = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(value);
    if (!iso) return null;
    [m, d, y] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  }
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  return fromLocal({ year: y, month: m, day: d, hour: 12, minute: 0 }).toISOString();
}

/**
 * The neighborhood in a StreetEasy-style listing description:
 * "CONDO IN TRIBECA | Renter's Preferred Tour: In Person" → "Tribeca".
 */
export function neighborhoodFromDescription(description: string | null | undefined): string | null {
  const m = /^[A-Z][A-Z /&-]*? IN ([A-Z0-9][A-Z0-9 .'/&-]*?)\s*(?:\||$)/.exec((description ?? "").trim());
  return m ? titleCase(m[1].trim()).slice(0, 80) : null;
}

function clip(value: string | null, max: number): string | null {
  return value ? value.slice(0, max) : null;
}

const NONE_VALUES = new Set(["<unspecified>", "unspecified", "none", "n/a", "na", "-"]);

/**
 * One CSV row → one contact and its timeline. Null when the row names no
 * one and gives no way to reach them.
 *
 * `agentKeys` (nameKey of every agent) settles text/call direction when the
 * contact's current name no longer matches the name in the history.
 */
export function rowToContact(
  row: string[],
  mapping: ImportMapping,
  agentKeys: Set<string>
): ImportContact | null {
  const cell = (i: number) => (row[i] ?? "").replace(/\r\n?/g, "\n").trim();
  const get = (field: ImportField): string | null => {
    for (const i of mapping.fields[field] ?? []) {
      const v = cell(i);
      if (v && !NONE_VALUES.has(v.toLowerCase())) return v;
    }
    return null;
  };
  const all = (field: ImportField) => (mapping.fields[field] ?? []).map(cell);

  let first = clip(get("first_name"), 80);
  let last = clip(get("last_name"), 80);
  const full = get("name");
  if (!first && !last && full) {
    const split = splitName(full);
    first = clip(split.first, 80);
    last = clip(split.last, 80);
  }
  const contactName = full ?? [first, last].filter(Boolean).join(" ");

  const emails = realEmailsFirst(uniqueValues(all("emails").map(normalizeEmail))).slice(0, 10);
  const phones = uniqueValues(all("phones").map(normalizePhone)).slice(0, 10);
  if (!first && !last && emails.length === 0 && phones.length === 0) return null;

  const propertyState = clip(get("property_state"), 40);
  const tags = uniqueValues([
    ...all("tags").flatMap(parseTags),
    propertyState?.toUpperCase() === "FL" ? FLORIDA_TAG : null,
  ]).slice(0, 50);

  const addedAt = parseDateValue(get("added_at"));
  const price = parseWholeNumber(get("price"), 1);
  const beds = parseWholeNumber(get("beds"), 0, 20);
  const propertyAddress = clip(get("property_address"), 200);
  const propertyLink = clip(get("property_link"), 500);
  const neighborhood =
    clip(get("neighborhood"), 80) ??
    mapping.descriptions.map((i) => neighborhoodFromDescription(cell(i))).find(Boolean) ??
    null;
  const source = clip(get("source"), 80);

  // Timeline: the original inquiry, then texts, calls and notes.
  const history: HistoryEntry[] = [];
  const texts = get("texts");
  const calls = get("calls");
  const notes = get("notes");
  if (texts) history.push(...parseTexts(texts, contactName, agentKeys));
  if (calls) history.push(...parseCalls(calls, contactName, agentKeys));
  if (notes) history.push(...parseNotes(notes));

  const activities: ImportActivity[] = [];
  const seen = new Set<string>();
  const add = (a: Omit<ImportActivity, "import_key">, keyPart: string) => {
    const key = `${a.kind}:${keyPart}`;
    if (seen.has(key)) return;
    seen.add(key);
    // A malformed row can put a whole sentence where the sender's name goes.
    activities.push({ ...a, actor: clip(a.actor, 120), import_key: key });
  };

  const message = get("message")?.replace(/^message:\s*/i, "") ?? null;
  if ((message || propertyAddress) && addedAt) {
    const meta: Record<string, string | number> = {};
    if (propertyAddress) meta.address = propertyAddress;
    if (price) meta.price = price;
    if (beds !== null) meta.beds = beds;
    if (propertyLink) meta.link = propertyLink;
    if (source) meta.source = source;
    add(
      {
        kind: "inquiry",
        direction: "inbound",
        outcome: null,
        occurred_at: addedAt,
        actor: contactName || null,
        body: clip(message, 5000),
        meta,
      },
      "original"
    );
  }

  for (const h of history) {
    const occurred = h.occurred_at ?? addedAt;
    if (!occurred) continue;
    add(
      {
        kind: h.kind,
        direction: h.direction,
        outcome: h.outcome,
        occurred_at: occurred,
        actor: h.actor,
        body: h.body,
        meta: h.meta,
      },
      `${h.occurred_at ?? "undated"}:${shortHash(`${h.actor ?? ""}|${h.body ?? ""}`)}`
    );
  }

  let lastContacted: string | null = null;
  let lastInbound: string | null = null;
  let lastActivity: string | null = addedAt;
  const later = (a: string | null, b: string) => (a === null || b > a ? b : a);
  for (const a of activities) {
    lastActivity = later(lastActivity, a.occurred_at);
    if (a.kind !== "call" && a.kind !== "text") continue;
    if (a.direction === "outbound") lastContacted = later(lastContacted, a.occurred_at);
    else if (a.direction === "inbound") lastInbound = later(lastInbound, a.occurred_at);
  }
  const isContacted = /^(yes|y|true|1)$/i.test(get("is_contacted") ?? "");

  const extra: Record<string, string> = {};
  for (const i of mapping.extra) {
    const v = cell(i);
    if (!v) continue;
    let key = mapping.headers[i] || `Column ${i + 1}`;
    if (key in extra) key = `${key} (${i + 1})`;
    extra[key] = v.slice(0, 2000);
  }

  return {
    external_id: clip(get("external_id"), 80),
    first_name: first,
    last_name: last,
    emails,
    phones,
    stage: clip(get("stage"), 80) ?? DEFAULT_STAGE,
    source,
    assigned_to: clip(get("assigned_to"), 80),
    tags,
    price,
    beds,
    move_in: clip(get("move_in"), 80),
    property_address: propertyAddress,
    property_city: clip(get("property_city"), 80),
    property_state: propertyState,
    property_link: propertyLink,
    neighborhood,
    background: clip(get("background"), 10_000),
    added_at: addedAt,
    contacted: isContacted || lastContacted !== null,
    last_contacted_at: lastContacted,
    last_inbound_at: lastInbound,
    last_activity_at: lastActivity,
    extra,
    activities,
  };
}

/** nameKey of every agent named in the file's assigned-agent column. */
export function agentKeysFrom(rows: string[][], mapping: ImportMapping): Set<string> {
  const cols = mapping.fields.assigned_to ?? [];
  const keys = new Set<string>();
  for (const row of rows) {
    for (const i of cols) {
      const k = nameKey(row[i]);
      if (k) keys.add(k);
    }
  }
  return keys;
}
