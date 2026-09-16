/**
 * Pure helpers shared by the admin Chat Log (session list, transcript detail
 * and the /api/admin/conversations routes).
 *
 * Deliberately free of React, JSX and Supabase so the query-shaping rules that
 * are easy to get wrong — search sanitisation, filter whitelisting, paging and
 * "migration 025 is not applied yet" detection — can be unit tested in the node
 * environment. See src/lib/__tests__/ui-conversations.test.ts.
 */

/** Sessions per page in the admin list. */
export const PAGE_SIZE = 25;

export const SURFACES = ["chat", "voice"] as const;
export type Surface = (typeof SURFACES)[number];

export const REVIEW_FILTERS = ["needs_review", "converted"] as const;
export type ReviewFilter = (typeof REVIEW_FILTERS)[number];

/**
 * PostgREST `.or()` expression for "this conversation is worth a look":
 * Stacy errored, or a search she ran came back with nothing.
 */
export const NEEDS_REVIEW_OR = "error_count.gt.0,empty_results_count.gt.0";

/** Whitelist `?surface=`; anything unrecognised means "no surface filter". */
export function parseSurface(value: string | null | undefined): Surface | null {
  return typeof value === "string" && (SURFACES as readonly string[]).includes(value)
    ? (value as Surface)
    : null;
}

/** Whitelist `?filter=`; anything unrecognised means "no review filter". */
export function parseReviewFilter(value: string | null | undefined): ReviewFilter | null {
  return typeof value === "string" && (REVIEW_FILTERS as readonly string[]).includes(value)
    ? (value as ReviewFilter)
    : null;
}

/**
 * Strip the characters that let a crafted search term rewrite a PostgREST
 * filter: `%_\` are LIKE wildcards and `,()"` are the separators of the filter
 * grammar itself. Same rule as src/app/api/leads/route.ts.
 */
export function sanitizeSearchTerm(raw: string | null | undefined, maxLength = 100): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/[%_\\,()"]/g, "").trim().slice(0, maxLength);
}

/**
 * Postgres/PostgREST codes meaning "the thing you selected does not exist".
 * 42703 undefined_column, 42P01 undefined_table; PGRST204/205 are the schema
 * cache's equivalents. All of them mean migration 025 has not been applied.
 */
const MISSING_SCHEMA_CODES = new Set(["42703", "42P01", "PGRST204", "PGRST205"]);

export function isMissingSchemaError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && MISSING_SCHEMA_CODES.has(code);
}

/**
 * Short "how long ago" label. `nowMs` is passed in rather than read from the
 * clock so this stays pure — react-hooks/purity forbids Date.now() inside a
 * server component's render, and a pure function is testable.
 */
export function relativeTime(iso: string | null | undefined, nowMs: number): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  // Clamp: a row written by a server whose clock runs ahead must not read
  // "-3m ago".
  const seconds = Math.max(0, Math.floor((nowMs - then) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export interface ConversationListParams {
  surface?: Surface | null;
  filter?: ReviewFilter | null;
  q?: string | null;
  page?: number | null;
}

/**
 * Build a Chat Log URL that carries the current filters. Page 1 is the default
 * and is left out so the "first page" link is a clean /admin/conversations.
 */
export function buildConversationsHref(
  params: ConversationListParams,
  basePath = "/admin/conversations",
): string {
  const search = new URLSearchParams();
  if (params.surface) search.set("surface", params.surface);
  if (params.filter) search.set("filter", params.filter);
  const q = typeof params.q === "string" ? params.q.trim() : "";
  if (q) search.set("q", q);
  if (params.page && params.page > 1) search.set("page", String(params.page));
  const query = search.toString();
  return query ? `${basePath}?${query}` : basePath;
}

/** Total pages for a row count, never below 1 so "Page 1 of 0" cannot render. */
export function totalPages(total: number, pageSize = PAGE_SIZE): number {
  if (!Number.isFinite(total) || total <= 0) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}

const MAX_TOOL_ARGS_CHARS = 4000;

/**
 * Pretty-print a tool call's arguments for the collapsed <details> view.
 * Returns "" when there is nothing to show, so callers can skip the block.
 */
export function formatToolArgs(args: unknown): string {
  if (args === null || args === undefined) return "";
  if (typeof args === "string") return args.slice(0, MAX_TOOL_ARGS_CHARS);
  try {
    const json = JSON.stringify(args, null, 2);
    if (!json) return "";
    return json.length > MAX_TOOL_ARGS_CHARS
      ? `${json.slice(0, MAX_TOOL_ARGS_CHARS)}\n…[truncated]`
      : json;
  } catch {
    // Circular or otherwise unserialisable jsonb — never throw inside render.
    return "[arguments could not be displayed]";
  }
}

/** Percentage of sessions that produced a lead, rounded, 0 when there are none. */
export function conversionRate(converted: number, total: number): number {
  if (!total || total <= 0) return 0;
  return Math.round((converted / total) * 100);
}
