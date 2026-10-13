// Deciding whether an imported row is someone already in the book, and
// folding it in. Pure, and deliberately cautious: a missed duplicate is a
// cleanup chore, a wrong merge loses a person.

import { nameKey, uniqueValues } from "./normalize";
import type { ImportContact } from "./import-map";
import { DEFAULT_STAGE } from "./stages";
import type { ContactKind } from "./types";

/** The contact columns the importer writes (no ids or generated columns). */
export interface ContactWrite {
  id: string;
  external_id: string | null;
  first_name: string | null;
  last_name: string | null;
  emails: string[];
  phones: string[];
  stage: string;
  source: string | null;
  previous_agent: string | null;
  kind: ContactKind;
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
  do_not_contact: boolean;
  contacted: boolean;
  last_contacted_at: string | null;
  last_inbound_at: string | null;
  last_activity_at: string | null;
  import_batch: string | null;
  extra: Record<string, string>;
}

type Identity = Pick<ContactWrite, "external_id" | "first_name" | "emails" | "phones">;

/** First names agree, or one side has none. "Bob" vs "Robert" stays apart. */
export function namesCompatible(a: Identity, b: Identity): boolean {
  const fa = nameKey(a.first_name);
  const fb = nameKey(b.first_name);
  return !fa || !fb || fa === fb;
}

function overlaps(a: string[], b: string[]): boolean {
  return a.some((v) => b.includes(v));
}

/**
 * The existing contact `incoming` is, if any:
 *   1. the same Follow Up Boss ID;
 *   2. a shared email, with compatible first names;
 *   3. a shared phone, with compatible first names and no conflicting
 *      emails (a couple on one phone with their own emails is two people).
 * Two different Follow Up Boss IDs are never merged: FUB already decided
 * they are different people.
 */
export function findMatch<T extends Identity>(incoming: Identity, candidates: T[]): T | null {
  if (incoming.external_id) {
    const same = candidates.find((c) => c.external_id === incoming.external_id);
    if (same) return same;
  }
  const eligible = candidates.filter(
    (c) => !(c.external_id && incoming.external_id && c.external_id !== incoming.external_id)
  );
  const byEmail = eligible.find(
    (c) => overlaps(c.emails, incoming.emails) && namesCompatible(c, incoming)
  );
  if (byEmail) return byEmail;
  return (
    eligible.find(
      (c) =>
        overlaps(c.phones, incoming.phones) &&
        namesCompatible(c, incoming) &&
        !(c.emails.length > 0 && incoming.emails.length > 0 && !overlaps(c.emails, incoming.emails))
    ) ?? null
  );
}

// Compared as instants: PostgREST returns "…+00:00" where the importer
// writes "…Z", so the strings themselves do not sort together.
function later(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(b) > Date.parse(a) ? b : a;
}

function earlier(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(b) < Date.parse(a) ? b : a;
}

/**
 * Folds an imported row into an existing contact. What is already in the
 * book wins (edits made here are newer than any export); the import only
 * fills gaps, adds emails, phones and tags, and moves the activity stamps
 * forward. A contact still at the default stage takes the imported stage.
 */
export function mergeContact(existing: ContactWrite, incoming: ImportContact): ContactWrite {
  const fill = <K extends keyof ContactWrite>(key: K): ContactWrite[K] =>
    (existing[key] ?? (incoming as unknown as ContactWrite)[key]) as ContactWrite[K];

  let background = existing.background;
  if (incoming.background && !(background ?? "").includes(incoming.background)) {
    background = background ? `${background}\n\n${incoming.background}` : incoming.background;
  }

  return {
    ...existing,
    external_id: fill("external_id"),
    first_name: fill("first_name"),
    last_name: fill("last_name"),
    emails: uniqueValues([...existing.emails, ...incoming.emails]).slice(0, 10),
    phones: uniqueValues([...existing.phones, ...incoming.phones]).slice(0, 10),
    stage: existing.stage === DEFAULT_STAGE ? incoming.stage : existing.stage,
    source: fill("source"),
    previous_agent: fill("previous_agent"),
    // Re-classified only from the default, so a type set by hand stays.
    kind: existing.kind === "renter" ? incoming.kind : existing.kind,
    tags: uniqueValues([...existing.tags, ...incoming.tags]).slice(0, 50),
    price: fill("price"),
    beds: fill("beds"),
    move_in: fill("move_in"),
    property_address: fill("property_address"),
    property_city: fill("property_city"),
    property_state: fill("property_state"),
    property_link: fill("property_link"),
    neighborhood: fill("neighborhood"),
    background,
    added_at: earlier(existing.added_at, incoming.added_at),
    // An opt-out is never undone by an import.
    do_not_contact: existing.do_not_contact || incoming.do_not_contact,
    contacted: existing.contacted || incoming.contacted,
    last_contacted_at: later(existing.last_contacted_at, incoming.last_contacted_at),
    last_inbound_at: later(existing.last_inbound_at, incoming.last_inbound_at),
    last_activity_at: later(existing.last_activity_at, incoming.last_activity_at),
    extra: { ...incoming.extra, ...existing.extra },
  };
}

export function newContact(id: string, incoming: ImportContact, batch: string): ContactWrite {
  // Everything but the timeline, which goes to crm_activities.
  const fields: Partial<ImportContact> = { ...incoming };
  delete fields.activities;
  return { id, ...(fields as Omit<ImportContact, "activities">), import_batch: batch };
}

/** The writable columns of a row read back from crm_contacts. */
export function toContactWrite(row: Record<string, unknown>): ContactWrite {
  return {
    id: row.id as string,
    external_id: (row.external_id as string | null) ?? null,
    first_name: (row.first_name as string | null) ?? null,
    last_name: (row.last_name as string | null) ?? null,
    emails: (row.emails as string[] | null) ?? [],
    phones: (row.phones as string[] | null) ?? [],
    stage: (row.stage as string | null) ?? DEFAULT_STAGE,
    source: (row.source as string | null) ?? null,
    previous_agent: (row.previous_agent as string | null) ?? null,
    kind: ((row.kind as ContactKind | null) ?? "renter"),
    tags: (row.tags as string[] | null) ?? [],
    price: (row.price as number | null) ?? null,
    beds: (row.beds as number | null) ?? null,
    move_in: (row.move_in as string | null) ?? null,
    property_address: (row.property_address as string | null) ?? null,
    property_city: (row.property_city as string | null) ?? null,
    property_state: (row.property_state as string | null) ?? null,
    property_link: (row.property_link as string | null) ?? null,
    neighborhood: (row.neighborhood as string | null) ?? null,
    background: (row.background as string | null) ?? null,
    added_at: (row.added_at as string | null) ?? null,
    do_not_contact: Boolean(row.do_not_contact),
    contacted: Boolean(row.contacted),
    last_contacted_at: (row.last_contacted_at as string | null) ?? null,
    last_inbound_at: (row.last_inbound_at as string | null) ?? null,
    last_activity_at: (row.last_activity_at as string | null) ?? null,
    import_batch: (row.import_batch as string | null) ?? null,
    extra: (row.extra as Record<string, string> | null) ?? {},
  };
}
