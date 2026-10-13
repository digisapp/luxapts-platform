// Contact filters for the NYC book: parsed from a URL (the list page, the
// API, "work this list") or stored as a saved smart list, and applied to a
// PostgREST query. One definition, so a list's count, its rows and the
// call-through order can never disagree.

import { z } from "zod";
import { NURTURE_STAGE, WORKING_STAGES } from "./stages";
import { addDays } from "./dates";

export const TOUCH_FILTERS = ["awaiting", "hot", "warm", "cold", "never", "replied", "stale30", "stale90", "stale180"] as const;
export const KIND_FILTERS = ["renter", "buyer", "broker", "people"] as const;
export const REACH_FILTERS = ["phone", "email", "none"] as const;
export const ADDED_FILTERS = ["30", "90", "365"] as const;
export const BUDGET_FILTERS = ["lt3", "3to45", "45to6", "6to8", "8plus"] as const;
export const BEDS_FILTERS = ["0", "1", "2", "3"] as const;
export const SCOPE_FILTERS = ["active", "archive", "deleted"] as const;
export const SORTS = ["recent", "added", "name", "oldest_touch", "due", "price_high", "replied"] as const;
export type CrmSort = (typeof SORTS)[number];

/** "No previous agent" in the agent filter. */
export const NO_AGENT = "__none";

/** Replied within this many days = hot; replied longer ago = warm. */
export const HOT_DAYS = 180;
/** Never replied and first inquired this long ago = archive. */
export const ARCHIVE_DAYS = 3 * 365;
/**
 * "Lease up soon": first inquired in this month or the next two (in some
 * past year), at least ~10 months ago. A renter inquires, signs a
 * 12-month lease a few weeks later, and starts looking again 1-2 months
 * before it ends: around the same time of year.
 */
export const LEASE_WINDOW_MONTHS = 3;
export const LEASE_MIN_AGE_DAYS = 300;

/** Price bands (monthly rent of the listing they asked about). */
export const BUDGET_BANDS: Record<(typeof BUDGET_FILTERS)[number], { label: string; min?: number; max: number }> = {
  lt3: { label: "Under $3k", max: 3000 },
  "3to45": { label: "$3k–4.5k", min: 3000, max: 4500 },
  "45to6": { label: "$4.5k–6k", min: 4500, max: 6000 },
  "6to8": { label: "$6k–8k", min: 6000, max: 8000 },
  // Capped where sale prices start (BUYER_MIN_PRICE): rents only.
  "8plus": { label: "$8k+", min: 8000, max: 50_000 },
};

export const crmFiltersSchema = z.object({
  q: z.string().trim().max(100).optional(),
  stages: z.array(z.string().max(80)).max(20).optional(),
  tag: z.string().max(60).optional(),
  source: z.string().max(80).optional(),
  agent: z.string().max(80).optional(),
  kind: z.enum(KIND_FILTERS).optional(),
  hood: z.string().max(80).optional(),
  budget: z.enum(BUDGET_FILTERS).optional(),
  beds: z.enum(BEDS_FILTERS).optional(),
  reach: z.enum(REACH_FILTERS).optional(),
  touch: z.enum(TOUCH_FILTERS).optional(),
  lease: z.literal("soon").optional(),
  scope: z.enum(SCOPE_FILTERS).optional(),
  due: z.boolean().optional(),
  added: z.enum(ADDED_FILTERS).optional(),
});

export type CrmFilters = z.infer<typeof crmFiltersSchema>;

export interface BuiltinList {
  key: string;
  label: string;
  hint: string;
  filters: CrmFilters;
  sort: CrmSort;
  group: "today" | "reengage" | "book";
}

/**
 * The book sorted by what predicts a reply, not by stage: 99% of the
 * imported book sits at "Lead", so stage says nothing. Reply history and
 * timing do (people who replied before reply again; leases turn over
 * yearly), and three years of silence means archive.
 */
export const BUILTIN_LISTS: BuiltinList[] = [
  {
    key: "awaiting",
    label: "Waiting on you",
    hint: "Replied in the last 6 months and never heard back. Newest replies first.",
    filters: { touch: "awaiting" },
    sort: "replied",
    group: "today",
  },
  {
    key: "due",
    label: "Follow-ups due",
    hint: "A follow-up is due today or overdue",
    filters: { due: true },
    sort: "due",
    group: "today",
  },
  {
    key: "lease",
    label: "Lease up soon",
    hint: "Renters who first inquired around this time of year, 10+ months ago: their lease is likely ending. Biggest budgets first.",
    filters: { lease: "soon", kind: "renter", scope: "active" },
    sort: "price_high",
    group: "today",
  },
  {
    key: "hot",
    label: "Hot",
    hint: "Replied in the last 6 months",
    filters: { touch: "hot", kind: "people" },
    sort: "oldest_touch",
    group: "today",
  },
  {
    key: "working",
    label: "In progress",
    hint: "Following up, interested, options sent, showing or applied",
    filters: { stages: WORKING_STAGES },
    sort: "oldest_touch",
    group: "today",
  },
  {
    key: "warm",
    label: "Warm",
    hint: "Replied before, but not in the last 6 months",
    filters: { touch: "warm", kind: "people" },
    sort: "oldest_touch",
    group: "reengage",
  },
  {
    key: "never",
    label: "Never contacted",
    hint: "No call, text or email yet (archive excluded)",
    filters: { touch: "never", kind: "people", scope: "active" },
    sort: "added",
    group: "reengage",
  },
  {
    key: "cold",
    label: "Cold",
    hint: "Contacted but never replied (archive excluded)",
    filters: { touch: "cold", kind: "people", scope: "active" },
    sort: "oldest_touch",
    group: "reengage",
  },
  {
    key: "nurture",
    label: "Nurture",
    hint: "Future move-ins and long-term nurture",
    filters: { stages: [NURTURE_STAGE] },
    sort: "oldest_touch",
    group: "reengage",
  },
  {
    key: "buyers",
    label: "Buyers",
    hint: "Asked about a listing for sale ($50k+) or have a buyer deal",
    filters: { kind: "buyer" },
    sort: "recent",
    group: "book",
  },
  {
    key: "brokers",
    label: "Brokers",
    hint: "Other agents who asked about listings. Kept out of the calling lists.",
    filters: { kind: "broker" },
    sort: "recent",
    group: "book",
  },
  {
    key: "deleted",
    label: "Recently deleted",
    hint: "Deleted contacts. Restore any of them, or delete them forever from here.",
    filters: { scope: "deleted" },
    sort: "recent",
    group: "book",
  },
  {
    key: "archive",
    label: "Archive",
    hint: "First inquired 3+ years ago and never replied. Kept, but out of the calling lists.",
    filters: { scope: "archive" },
    sort: "added",
    group: "book",
  },
  { key: "all", label: "Everyone", hint: "Every contact in the book", filters: {}, sort: "recent", group: "book" },
];

export const LIST_GROUPS: { key: BuiltinList["group"]; label: string }[] = [
  { key: "today", label: "Work these first" },
  { key: "reengage", label: "Re-engage" },
  { key: "book", label: "The book" },
];

export function builtinList(key: string | null | undefined): BuiltinList | undefined {
  return BUILTIN_LISTS.find((l) => l.key === key);
}

type Params = { get(name: string): string | null; getAll(name: string): string[] };

/** Filters from a query string. Invalid values are dropped, not rejected. */
export function filtersFromParams(params: Params): CrmFilters {
  const raw: Record<string, unknown> = {};
  for (const key of ["q", "tag", "source", "agent", "kind", "hood", "budget", "beds", "reach", "touch", "lease", "scope", "added"] as const) {
    const v = params.get(key);
    if (v) raw[key] = v;
  }
  const stages = params.getAll("stage").filter(Boolean);
  if (stages.length) raw.stages = stages;
  if (params.get("due") === "1") raw.due = true;

  const out: CrmFilters = {};
  for (const [key, value] of Object.entries(raw)) {
    const one = crmFiltersSchema.safeParse({ [key]: value });
    if (one.success) Object.assign(out, one.data);
  }
  if (out.q === "") delete out.q;
  return out;
}

export function filtersToParams(filters: CrmFilters, params = new URLSearchParams()): URLSearchParams {
  if (filters.q) params.set("q", filters.q);
  for (const s of filters.stages ?? []) params.append("stage", s);
  if (filters.tag) params.set("tag", filters.tag);
  if (filters.source) params.set("source", filters.source);
  if (filters.agent) params.set("agent", filters.agent);
  if (filters.kind) params.set("kind", filters.kind);
  if (filters.hood) params.set("hood", filters.hood);
  if (filters.budget) params.set("budget", filters.budget);
  if (filters.beds) params.set("beds", filters.beds);
  if (filters.reach) params.set("reach", filters.reach);
  if (filters.touch) params.set("touch", filters.touch);
  if (filters.lease) params.set("lease", filters.lease);
  if (filters.scope) params.set("scope", filters.scope);
  if (filters.due) params.set("due", "1");
  if (filters.added) params.set("added", filters.added);
  return params;
}

export function sortFromParam(value: string | null | undefined, fallback: CrmSort = "recent"): CrmSort {
  return (SORTS as readonly string[]).includes(value ?? "") ? (value as CrmSort) : fallback;
}

export function hasFilters(f: CrmFilters): boolean {
  return Object.keys(f).length > 0;
}

export function sameFilters(a: CrmFilters, b: CrmFilters): boolean {
  return filtersToParams(a).toString() === filtersToParams(b).toString();
}

/**
 * Search words. A query that is all phone characters is one digits-only
 * token, so "(212) 555-0123" finds the number stored as +12125550123.
 */
export function searchTokens(q: string): string[] {
  const trimmed = q.trim();
  if (!trimmed) return [];
  const digits = trimmed.replace(/\D/g, "");
  if (/^[\d\s()+\-.]+$/.test(trimmed) && digits.length >= 3) return [digits];
  return trimmed
    .toLowerCase()
    .replace(/[*%_\\]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6);
}

/** A Postgres array literal holding one text element, for `cs` filters. */
export function arrayLiteral(value: string): string {
  return `{"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"}`;
}

// The subset of the PostgREST builder the filters use. supabase-js's own
// generics differ per table and per select, so callers pass any builder and
// get the same type back.
interface Chain {
  eq(column: string, value: unknown): Chain;
  neq(column: string, value: unknown): Chain;
  in(column: string, values: unknown[]): Chain;
  is(column: string, value: null | boolean): Chain;
  not(column: string, operator: string, value: unknown): Chain;
  lte(column: string, value: unknown): Chain;
  lt(column: string, value: unknown): Chain;
  gte(column: string, value: unknown): Chain;
  ilike(column: string, pattern: string): Chain;
  contains(column: string, value: unknown): Chain;
  or(filters: string): Chain;
}

function isoDaysAgo(now: Date, days: number): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 19) + "Z";
}

/** The months (1-12) "Lease up soon" covers, starting with today's. */
export function leaseMonths(today: string): number[] {
  const m = Number(today.slice(5, 7));
  return Array.from({ length: LEASE_WINDOW_MONTHS }, (_, i) => ((m - 1 + i) % 12) + 1);
}

/**
 * Applies `filters` to a crm_contacts query. `today` is the New York date
 * key (follow-ups are date-only); `now` anchors the day-count filters.
 */
export function applyContactFilters<T>(query: T, filters: CrmFilters, today: string, now: Date): T {
  let q = query as unknown as Chain;
  // Each entry is one OR condition; they are ANDed together at the end.
  const orGroups: string[] = [];

  for (const token of searchTokens(filters.q ?? "")) {
    q = q.ilike("search_text", `%${token}%`);
  }

  const stages = filters.stages ?? [];
  if (stages.length === 1) q = q.eq("stage", stages[0]);
  else if (stages.length > 1) q = q.in("stage", stages);

  if (filters.tag) q = q.contains("tags", arrayLiteral(filters.tag));
  if (filters.source) q = q.eq("source", filters.source);
  if (filters.agent === NO_AGENT) q = q.is("previous_agent", null);
  else if (filters.agent) q = q.eq("previous_agent", filters.agent);
  // "people": renters and buyers, i.e. not other brokers.
  if (filters.kind === "people") q = q.neq("kind", "broker");
  else if (filters.kind) q = q.eq("kind", filters.kind);
  if (filters.hood) q = q.eq("neighborhood", filters.hood);

  if (filters.budget) {
    const band = BUDGET_BANDS[filters.budget];
    if (band.min !== undefined) q = q.gte("price", band.min);
    q = q.lt("price", band.max);
  }
  if (filters.beds === "3") q = q.gte("beds", 3);
  else if (filters.beds) q = q.eq("beds", Number(filters.beds));

  // A relay address (RentHop, Rent.com) is not a way to reach someone.
  if (filters.reach === "phone") q = q.neq("phones", "{}");
  else if (filters.reach === "email") q = q.eq("has_real_email", true);
  else if (filters.reach === "none") q = q.eq("phones", "{}").eq("has_real_email", false);

  switch (filters.touch) {
    case "awaiting":
      q = q
        .eq("awaiting_reply", true)
        .gte("last_inbound_at", isoDaysAgo(now, HOT_DAYS))
        .eq("do_not_contact", false);
      break;
    case "hot":
      q = q.gte("last_inbound_at", isoDaysAgo(now, HOT_DAYS));
      break;
    case "warm":
      q = q.lt("last_inbound_at", isoDaysAgo(now, HOT_DAYS));
      break;
    case "cold":
      q = q.eq("contacted", true).is("last_inbound_at", null).eq("do_not_contact", false);
      break;
    case "never":
      q = q.eq("contacted", false).eq("do_not_contact", false);
      break;
    case "replied":
      q = q.not("last_inbound_at", "is", null);
      break;
    case "stale30":
    case "stale90":
    case "stale180": {
      const days = Number(filters.touch.slice(5));
      // Contacted per the import but with no dated touch counts as stale.
      q = q.eq("contacted", true).eq("do_not_contact", false);
      orGroups.push(`last_contacted_at.is.null,last_contacted_at.lt.${isoDaysAgo(now, days)}`);
      break;
    }
  }

  if (filters.lease === "soon") {
    q = q
      .in("cycle_month", leaseMonths(today))
      .lte("added_at", `${addDays(today, -LEASE_MIN_AGE_DAYS)}T00:00:00Z`)
      .eq("do_not_contact", false);
  }

  // Archive: never replied, and first inquired three or more years ago.
  const archiveCutoff = `${addDays(today, -ARCHIVE_DAYS)}T00:00:00Z`;
  if (filters.scope === "archive") {
    q = q.is("last_inbound_at", null).lt("added_at", archiveCutoff);
  } else if (filters.scope === "active") {
    orGroups.push(`last_inbound_at.not.is.null,added_at.gte.${archiveCutoff},added_at.is.null`);
  }

  if (filters.due) q = q.lte("next_task_on", today);
  if (filters.added) q = q.gte("added_at", `${addDays(today, -Number(filters.added))}T00:00:00Z`);

  // Deleted contacts live in "Recently deleted"; merged ones only show
  // inside the contact they were merged into.
  if (filters.scope === "deleted") q = q.not("deleted_at", "is", null).is("merged_into", null);
  else q = q.eq("is_active", true);

  // Two .or() calls would send two `or` parameters; nest them in one instead.
  if (orGroups.length === 1) q = q.or(orGroups[0]);
  else if (orGroups.length > 1) q = q.or(`and(${orGroups.map((g) => `or(${g})`).join(",")})`);

  return q as unknown as T;
}

interface Orderable {
  order(column: string, options: { ascending: boolean; nullsFirst?: boolean }): Orderable;
}

export function applyContactSort<T>(query: T, sort: CrmSort): T {
  let q = query as unknown as Orderable;
  switch (sort) {
    case "added":
      q = q.order("added_at", { ascending: false, nullsFirst: false });
      break;
    case "name":
      q = q
        .order("first_name", { ascending: true, nullsFirst: false })
        .order("last_name", { ascending: true, nullsFirst: false });
      break;
    case "oldest_touch":
      q = q.order("last_contacted_at", { ascending: true, nullsFirst: true });
      break;
    case "due":
      q = q.order("next_task_on", { ascending: true, nullsFirst: false });
      break;
    case "price_high":
      q = q.order("price", { ascending: false, nullsFirst: false });
      break;
    case "replied":
      q = q.order("last_inbound_at", { ascending: false, nullsFirst: false });
      break;
    default:
      q = q.order("last_activity_at", { ascending: false, nullsFirst: false });
  }
  // A total order, so "work this list" steps through rows predictably.
  return q.order("id", { ascending: true }) as unknown as T;
}

/**
 * The order "work this list" steps through. Logging a call or text moves a
 * contact to the top of "Recent activity", so stepping by position there
 * would walk back into people already worked; "Longest since contact" sends
 * them to the end instead, which the next-contact route handles. Every other
 * sort is unaffected by logging, or only moves people out of the list.
 */
export function workSortFor(sort: CrmSort): CrmSort {
  return sort === "recent" ? "oldest_touch" : sort;
}

export const SORT_LABELS: Record<CrmSort, string> = {
  recent: "Recent activity",
  added: "Newest added",
  name: "Name A–Z",
  oldest_touch: "Longest since contact",
  due: "Follow-up date",
  price_high: "Biggest budget first",
  replied: "Latest reply first",
};
