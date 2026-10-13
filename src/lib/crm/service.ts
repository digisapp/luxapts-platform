// Server-side data access for the NYC contacts book. Always called with the
// service-role client from admin-checked routes and pages.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyContactFilters,
  applyContactSort,
  BUILTIN_LISTS,
  crmFiltersSchema,
  type CrmFilters,
  type CrmSort,
} from "./filters";
import { findMatch, mergeContact, newContact, toContactWrite, type ContactWrite } from "./merge";
import type { ImportContact } from "./import-map";
import {
  CONTACT_LIST_COLUMNS,
  type CrmActivity,
  type CrmContact,
  type CrmSender,
  type CrmTemplate,
  type CrmContactListRow,
  type CrmFacets,
  type CrmSmartList,
  type CrmTask,
} from "./types";
import { addDays, nyDateKey } from "./dates";

export const PAGE_SIZE = 50;

export interface ListContext {
  today: string;
  now: Date;
}

export function listContext(now: Date = new Date()): ListContext {
  return { today: nyDateKey(now), now };
}

export async function listContacts(
  supabase: SupabaseClient,
  filters: CrmFilters,
  sort: CrmSort,
  offset: number,
  ctx: ListContext
): Promise<{ rows: CrmContactListRow[]; total: number }> {
  let query = supabase.from("crm_contacts").select(CONTACT_LIST_COLUMNS, { count: "exact" });
  query = applyContactFilters(query, filters, ctx.today, ctx.now);
  query = applyContactSort(query, sort);
  const { data, count, error } = await query.range(offset, offset + PAGE_SIZE - 1);
  if (error) throw new Error(`Could not load contacts: ${error.message}`);
  return { rows: (data ?? []) as unknown as CrmContactListRow[], total: count ?? 0 };
}

export async function countContacts(
  supabase: SupabaseClient,
  filters: CrmFilters,
  ctx: ListContext
): Promise<number> {
  let query = supabase.from("crm_contacts").select("id", { count: "exact", head: true });
  query = applyContactFilters(query, filters, ctx.today, ctx.now);
  const { count, error } = await query;
  if (error) throw new Error(`Could not count contacts: ${error.message}`);
  return count ?? 0;
}

/** Counts for several lists at once, keyed like the input. */
export async function countLists(
  supabase: SupabaseClient,
  lists: { key: string; filters: CrmFilters }[],
  ctx: ListContext
): Promise<Record<string, number>> {
  const counts = await Promise.all(
    lists.map((l) => countContacts(supabase, l.filters, ctx).catch(() => -1))
  );
  return Object.fromEntries(lists.map((l, i) => [l.key, counts[i]]));
}

export async function getFacets(supabase: SupabaseClient): Promise<CrmFacets> {
  const { data, error } = await supabase.rpc("crm_facets");
  if (error) throw new Error(`Could not load filters: ${error.message}`);
  const f = (data ?? {}) as Partial<CrmFacets>;
  return {
    stages: f.stages ?? [],
    sources: f.sources ?? [],
    agents: f.agents ?? [],
    tags: f.tags ?? [],
    neighborhoods: f.neighborhoods ?? [],
  };
}

/** The contact at `index` in a list, and the one after it. */
export async function contactsAt(
  supabase: SupabaseClient,
  filters: CrmFilters,
  sort: CrmSort,
  index: number,
  ctx: ListContext
): Promise<{ ids: string[]; total: number }> {
  let query = supabase.from("crm_contacts").select("id", { count: "exact" });
  query = applyContactFilters(query, filters, ctx.today, ctx.now);
  query = applyContactSort(query, sort);
  const { data, count, error } = await query.range(index, index + 1);
  if (error) throw new Error(`Could not step through the list: ${error.message}`);
  return { ids: (data ?? []).map((r) => r.id as string), total: count ?? 0 };
}

/** Every id a filter matches (for "apply to all N"), paged past the 1000-row cap. */
export async function collectIds(
  supabase: SupabaseClient,
  filters: CrmFilters,
  ctx: ListContext,
  limit = 50_000
): Promise<string[]> {
  const ids: string[] = [];
  for (let offset = 0; offset < limit; offset += 1000) {
    let query = supabase.from("crm_contacts").select("id");
    query = applyContactFilters(query, filters, ctx.today, ctx.now);
    const { data, error } = await query.order("id").range(offset, offset + 999);
    if (error) throw new Error(`Could not collect contacts: ${error.message}`);
    ids.push(...(data ?? []).map((r) => r.id as string));
    if (!data || data.length < 1000) break;
  }
  return ids.slice(0, limit);
}

export interface ImportResult {
  created: number;
  merged: number;
  activities: number;
}

const ACTIVITY_CHUNK = 1000;

/**
 * Writes one batch of imported rows. Each row is matched against the book
 * (and against earlier rows of the same batch) by findMatch; matches are
 * merged, the rest created. Timeline entries are keyed (contact, import_key)
 * so re-importing the same export adds nothing twice.
 *
 * Batches must run one after another: a person split across two concurrent
 * batches could be created twice.
 */
export async function importContacts(
  supabase: SupabaseClient,
  items: ImportContact[],
  batch: string
): Promise<ImportResult> {
  const { data: candidates, error: matchError } = await supabase.rpc("crm_match_contacts", {
    p_external_ids: items.flatMap((i) => (i.external_id ? [i.external_id] : [])),
    p_emails: items.flatMap((i) => i.emails),
    p_phones: items.flatMap((i) => i.phones),
  });
  if (matchError) throw new Error(`Could not match contacts: ${matchError.message}`);

  const pool: ContactWrite[] = ((candidates ?? []) as Record<string, unknown>[]).map(toContactWrite);
  const existingIds = new Set(pool.map((c) => c.id));
  const touched = new Map<string, ContactWrite>();
  const activities: Record<string, unknown>[] = [];
  let created = 0;
  let merged = 0;

  for (const item of items) {
    const match = findMatch(item, pool);
    let row: ContactWrite;
    if (match) {
      row = mergeContact(match, item);
      pool[pool.indexOf(match)] = row;
      if (existingIds.has(row.id) && !touched.has(row.id)) merged++;
    } else {
      row = newContact(crypto.randomUUID(), item, batch);
      pool.push(row);
      created++;
    }
    touched.set(row.id, row);
    for (const a of item.activities) activities.push({ ...a, contact_id: row.id });
  }

  if (touched.size > 0) {
    const { error } = await supabase
      .from("crm_contacts")
      .upsert(Array.from(touched.values()), { onConflict: "id" });
    if (error) throw new Error(`Could not save contacts: ${error.message}`);
  }

  // Two rows of one batch merged into one contact can carry the same entry.
  const unique = new Map(activities.map((a) => [`${a.contact_id}|${a.import_key}`, a]));
  const rows = Array.from(unique.values());
  for (let i = 0; i < rows.length; i += ACTIVITY_CHUNK) {
    const { error } = await supabase
      .from("crm_activities")
      .upsert(rows.slice(i, i + ACTIVITY_CHUNK), {
        onConflict: "contact_id,import_key",
        ignoreDuplicates: true,
      });
    if (error) throw new Error(`Could not save history: ${error.message}`);
  }

  return { created, merged, activities: rows.length };
}

export interface CrmOverview {
  facets: CrmFacets;
  smartLists: CrmSmartList[];
  /** Count per built-in list key and per saved list id (-1 if it failed). */
  counts: Record<string, number>;
}

/** Everything the list page's sidebar needs: filter menus, saved lists, counts. */
export async function getOverview(supabase: SupabaseClient, ctx: ListContext): Promise<CrmOverview> {
  const [facets, listsRes] = await Promise.all([
    getFacets(supabase),
    supabase.from("crm_smart_lists").select("id, name, filters, position").order("position").order("created_at"),
  ]);
  if (listsRes.error) throw new Error(`Could not load smart lists: ${listsRes.error.message}`);
  const smartLists = (listsRes.data ?? []) as CrmSmartList[];
  const counts = await countLists(
    supabase,
    [
      ...BUILTIN_LISTS.map((l) => ({ key: l.key, filters: l.filters })),
      ...smartLists.map((l) => ({ key: l.id, filters: savedFilters(l) })),
    ],
    ctx
  );
  return { facets, smartLists, counts };
}

/** A saved list's filters, re-validated (they were stored as JSON). */
export function savedFilters(list: Pick<CrmSmartList, "filters">): CrmFilters {
  const parsed = crmFiltersSchema.safeParse(list.filters);
  return parsed.success ? parsed.data : {};
}

export interface ContactBundle {
  contact: CrmContact;
  activities: CrmActivity[];
  tasks: CrmTask[];
}

/** A contact with its timeline (newest first) and follow-ups. Null if missing. */
export async function getContactBundle(supabase: SupabaseClient, id: string): Promise<ContactBundle | null> {
  const [contactRes, activitiesRes, tasksRes] = await Promise.all([
    supabase.from("crm_contacts").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("crm_activities")
      .select("*")
      .eq("contact_id", id)
      .order("occurred_at", { ascending: false })
      .limit(500),
    supabase
      .from("crm_tasks")
      .select("*")
      .eq("contact_id", id)
      .order("completed_at", { ascending: false, nullsFirst: true })
      .order("due_on", { ascending: true })
      .limit(50),
  ]);
  const error = contactRes.error ?? activitiesRes.error ?? tasksRes.error;
  if (error) throw new Error(`Could not load the contact: ${error.message}`);
  if (!contactRes.data) return null;
  return {
    contact: contactRes.data as CrmContact,
    activities: (activitiesRes.data ?? []) as CrmActivity[],
    tasks: (tasksRes.data ?? []) as CrmTask[],
  };
}

/** How many contacts have a follow-up due today or overdue. */
export async function countDue(supabase: SupabaseClient, today: string): Promise<number> {
  const { count, error } = await supabase
    .from("crm_contacts")
    .select("id", { count: "exact", head: true })
    .lte("next_task_on", today);
  if (error) throw new Error(`Could not count follow-ups: ${error.message}`);
  return count ?? 0;
}

/** Replies in the last three days that nobody has answered yet. */
export async function countNewReplies(supabase: SupabaseClient, now: Date = new Date()): Promise<number> {
  const { count, error } = await supabase
    .from("crm_contacts")
    .select("id", { count: "exact", head: true })
    .eq("awaiting_reply", true)
    .gte("last_inbound_at", new Date(now.getTime() - 3 * 86_400_000).toISOString());
  if (error) throw new Error(`Could not count replies: ${error.message}`);
  return count ?? 0;
}

export interface AgendaTask extends CrmTask {
  contact: Pick<CrmContact, "id" | "first_name" | "last_name" | "emails" | "phones" | "stage" | "do_not_contact"> | null;
}

/** Open follow-ups due within the next week, overdue first. */
export async function getAgenda(supabase: SupabaseClient, today: string): Promise<AgendaTask[]> {
  const { data, error } = await supabase
    .from("crm_tasks")
    .select(
      "id, contact_id, created_at, title, kind, due_on, completed_at, contact:crm_contacts(id, first_name, last_name, emails, phones, stage, do_not_contact)"
    )
    .is("completed_at", null)
    .lte("due_on", addDays(today, 7))
    .order("due_on", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw new Error(`Could not load follow-ups: ${error.message}`);
  return (data ?? []) as unknown as AgendaTask[];
}

export async function getTemplates(supabase: SupabaseClient): Promise<CrmTemplate[]> {
  const { data, error } = await supabase
    .from("crm_templates")
    .select("id, name, channel, subject, body, position")
    .order("position")
    .order("created_at");
  if (error) throw new Error(`Could not load templates: ${error.message}`);
  return (data ?? []) as CrmTemplate[];
}

/** Who the templates say is writing ({my_name}, {company}). */
export async function getSender(supabase: SupabaseClient): Promise<CrmSender> {
  const { data, error } = await supabase.from("crm_settings").select("key, value").in("key", ["sender_name", "company"]);
  if (error) throw new Error(`Could not load settings: ${error.message}`);
  const get = (k: string) => (data ?? []).find((r) => r.key === k)?.value ?? "";
  return { name: get("sender_name"), company: get("company") };
}

export interface TodayStats {
  calls: number;
  talked: number;
  texts: number;
  emails: number;
  replies: number;
  followUpsDone: number;
}

/** What was done in the book today (New York day), not counting imports. */
export async function getTodayStats(supabase: SupabaseClient, since: Date): Promise<TodayStats> {
  const { data, error } = await supabase
    .from("crm_activities")
    .select("kind, direction, outcome")
    .is("import_key", null)
    .gte("created_at", since.toISOString())
    .limit(5000);
  if (error) throw new Error(`Could not load today's activity: ${error.message}`);
  const rows = data ?? [];
  const out = (kind: string) => rows.filter((r) => r.kind === kind && r.direction === "outbound").length;
  return {
    calls: out("call"),
    talked: rows.filter((r) => r.kind === "call" && r.outcome === "talked").length,
    texts: out("text") + out("whatsapp"),
    emails: out("email"),
    replies: rows.filter((r) => r.direction === "inbound").length,
    followUpsDone: rows.filter((r) => r.kind === "task").length,
  };
}

/** "Benjamin" from the signed-in admin's profile, for timeline entries. */
export async function actorName(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle();
  const name = (data?.full_name as string | null | undefined)?.trim();
  // handle_new_user falls back to the email for full_name; keep the local part.
  return name ? name.split("@")[0] : null;
}
