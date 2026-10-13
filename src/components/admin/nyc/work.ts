// "Work this list": a contact page opened from a list carries that list
// (filters + sort), its name and the contact's position, so "Next" can step
// to the following person without going back to the list.

export type ReachKind = "call" | "text" | "email";

export interface WorkContext {
  /** The list's filters and sort, as a query string. */
  query: string;
  label: string;
  index: number;
  total: number;
  /** The page the list lives on, for "back" (default: People). */
  base?: string;
}

const BASES = ["/admin/nyc", "/admin/nyc/recruiting"];

export function contactHref(id: string, work?: WorkContext | null, log?: ReachKind): string {
  const params = new URLSearchParams();
  if (work) {
    params.set("w", work.query);
    params.set("wl", work.label);
    params.set("i", String(work.index));
    params.set("n", String(work.total));
    if (work.base && work.base !== "/admin/nyc") params.set("wb", work.base);
  }
  if (log) params.set("log", log);
  const qs = params.toString();
  return `/admin/nyc/${id}${qs ? `?${qs}` : ""}`;
}

type Params = { get(name: string): string | null };

export function readWork(params: Params): WorkContext | null {
  const query = params.get("w");
  if (query === null) return null;
  const index = Number(params.get("i"));
  const total = Number(params.get("n"));
  const base = params.get("wb");
  return {
    query,
    label: params.get("wl") || "List",
    index: Number.isInteger(index) && index >= 0 ? index : 0,
    total: Number.isInteger(total) && total >= 0 ? total : 0,
    // Only known pages, so the URL cannot send "back" anywhere else.
    ...(base && BASES.includes(base) ? { base } : {}),
  };
}

export function readReach(params: Params): ReachKind | null {
  const v = params.get("log");
  return v === "call" || v === "text" || v === "email" ? v : null;
}
