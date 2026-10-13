"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowDownUp,
  Bookmark,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  PhoneForwarded,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { PopoverMenu } from "@/components/admin/leads/PopoverMenu";
import {
  BUDGET_BANDS,
  BUDGET_FILTERS,
  BUILTIN_LISTS,
  filtersToParams,
  NO_AGENT,
  sameFilters,
  SORT_LABELS,
  SORTS,
  workSortFor,
  type CrmFilters,
  type CrmSort,
} from "@/lib/crm/filters";
import { stageMeta } from "@/lib/crm/stages";
import type { CrmContactListRow } from "@/lib/crm/types";
import type { CrmOverview } from "@/lib/crm/service";
import { CONTACT_GRID, ContactRow } from "./ContactRow";
import { FacetPicker } from "./FacetPicker";
import { NycBulkBar } from "./NycBulkBar";
import { AddContactDialog, DeleteContactsDialog, errorOf, SaveListDialog, TagsDialog } from "./NycDialogs";
import { describeFilters } from "./nyc-format";
import { contactHref, type ReachKind, type WorkContext } from "./work";
import { ListPicker, ListSidebar, type NavList } from "./ListNav";
import { useNow } from "./use-now";

const PAGE_SIZE = 50;

interface ContactsBookProps {
  initialFilters: CrmFilters;
  initialSort: CrmSort;
  initialContacts: CrmContactListRow[];
  initialTotal: number;
  initialOverview: CrmOverview;
  today: string;
}

const REACH_OPTIONS = [
  { key: "", label: "Any way to reach" },
  { key: "phone", label: "Has a phone" },
  { key: "email", label: "Has an email" },
  { key: "none", label: "No phone or email" },
] as const;

const TOUCH_OPTIONS = [
  { key: "", label: "Any contact history" },
  { key: "hot", label: "Hot: replied in 6 months" },
  { key: "warm", label: "Warm: replied, not lately" },
  { key: "cold", label: "Cold: never replied" },
  { key: "never", label: "Never contacted" },
  { key: "replied", label: "Replied ever" },
  { key: "stale30", label: "No touch in 30+ days" },
  { key: "stale90", label: "No touch in 90+ days" },
  { key: "stale180", label: "No touch in 180+ days" },
] as const;

const KIND_OPTIONS = [
  { key: "", label: "Any type" },
  { key: "people", label: "Renters & buyers" },
  { key: "renter", label: "Renters" },
  { key: "buyer", label: "Buyers" },
  { key: "broker", label: "Brokers" },
];

const KIND_LABELS: Record<string, string> = { renter: "renters", buyer: "buyers", broker: "brokers" };

const BUDGET_OPTIONS = [
  { key: "", label: "Any budget" },
  ...BUDGET_FILTERS.map((k) => ({ key: k, label: BUDGET_BANDS[k].label })),
];

const BEDS_OPTIONS = [
  { key: "", label: "Any size" },
  { key: "0", label: "Studio" },
  { key: "1", label: "1 bed" },
  { key: "2", label: "2 beds" },
  { key: "3", label: "3+ beds" },
];

const ADDED_OPTIONS = [
  { key: "", label: "Added any time" },
  { key: "30", label: "Added last 30 days" },
  { key: "90", label: "Added last 90 days" },
  { key: "365", label: "Added last year" },
] as const;

const chip =
  "inline-flex h-11 items-center gap-2 rounded-lg border px-3.5 text-sm transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 md:h-10";

export function ContactsBook({
  initialFilters,
  initialSort,
  initialContacts,
  initialTotal,
  initialOverview,
  today,
}: ContactsBookProps) {
  const router = useRouter();
  const [filters, setFilters] = useState<CrmFilters>(initialFilters);
  const [sort, setSort] = useState<CrmSort>(initialSort);
  const [search, setSearch] = useState(initialFilters.q ?? "");
  const [contacts, setContacts] = useState(initialContacts);
  const [total, setTotal] = useState(initialTotal);
  const [offset, setOffset] = useState(0);
  const [overview, setOverview] = useState(initialOverview);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const now = useNow();
  const [dialog, setDialog] = useState<"add" | "tags" | "delete" | "save" | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const requestIdRef = useRef(0);
  const firstRender = useRef(true);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  // "/" jumps to search.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      searchRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Typing settles into the filters after a pause.
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((f) => {
        const q = search.trim() || undefined;
        if (f.q === q) return f;
        const next = { ...f };
        if (q) next.q = q;
        else delete next.q;
        return next;
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const stagesPresent = useMemo(() => overview.facets.stages.map((s) => s.value), [overview]);

  const lists = useMemo<NavList[]>(
    () => [
      ...BUILTIN_LISTS.map((l) => ({ key: l.key, label: l.label, hint: l.hint, filters: l.filters, sort: l.sort, group: l.group })),
      ...overview.smartLists.map((l) => ({
        key: l.id,
        label: l.name,
        hint: describeFilters(l.filters as CrmFilters).join(" · "),
        filters: l.filters as CrmFilters,
        group: "saved" as const,
      })),
    ],
    [overview]
  );
  const activeList = lists.find((l) => sameFilters(l.filters, filters));
  const listLabel = activeList?.label ?? "Filtered list";
  const workSort = workSortFor(sort);
  const listQuery = useMemo(() => {
    const p = filtersToParams(filters);
    p.set("sort", workSort);
    return p.toString();
  }, [filters, workSort]);

  const loadOverview = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/nyc/overview");
      if (res.ok) setOverview(await res.json());
    } catch {
      /* the counts refresh on the next change */
    }
  }, []);

  const fetchContacts = useCallback(
    async (nextOffset: number) => {
      const requestId = ++requestIdRef.current;
      setLoading(true);
      try {
        const params = filtersToParams(filters);
        params.set("sort", sort);
        params.set("offset", String(nextOffset));
        const res = await fetch(`/api/admin/nyc/contacts?${params}`);
        const data = await res.json().catch(() => ({}));
        if (requestId !== requestIdRef.current) return;
        if (!res.ok || !Array.isArray(data.contacts)) {
          setLoadError(
            data.error ||
              (res.status === 401 || res.status === 403
                ? "Your session expired or this account is not an admin. Sign in again."
                : `Could not load contacts (${res.status}).`)
          );
          return;
        }
        setLoadError(null);
        setContacts(data.contacts);
        setTotal(data.total ?? 0);
        setOffset(nextOffset);
        setSelected(new Set());
        setAllMatching(false);
      } catch {
        if (requestId === requestIdRef.current) setLoadError("Could not reach the server. Check your connection and retry.");
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [filters, sort]
  );

  // Refetch and mirror the view into the URL when filters or sort change.
  // The first render already has the server's rows.
  useEffect(() => {
    const params = filtersToParams(filters);
    if (sort !== "recent") params.set("sort", sort);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    fetchContacts(0);
  }, [fetchContacts, filters, sort]);

  const pageIds = contacts.map((c) => c.id);
  const selectedOnPage = pageIds.filter((id) => selected.has(id)).length;
  const allOnPage = pageIds.length > 0 && selectedOnPage === pageIds.length;
  const bulkCount = allMatching ? total : selected.size;

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = selectedOnPage > 0 && !allOnPage;
  }, [selectedOnPage, allOnPage]);

  function setFilter<K extends keyof CrmFilters>(key: K, value: CrmFilters[K] | undefined) {
    setFilters((f) => {
      const next = { ...f };
      if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) delete next[key];
      else next[key] = value;
      return next;
    });
  }

  function chooseList(list: NavList) {
    setFilters(list.filters);
    setSearch(list.filters.q ?? "");
    if (list.sort) setSort(list.sort);
  }

  function clearFilters() {
    setFilters({});
    setSearch("");
  }

  function hrefFor(id: string, rowIndex: number, log?: ReachKind) {
    // A row opened under "Recent activity" has no stable position to step
    // from (see workSortFor), so it opens without "Next".
    const work: WorkContext | null =
      workSort === sort ? { query: listQuery, label: listLabel, index: offset + rowIndex, total } : null;
    return contactHref(id, work, log);
  }

  async function startWorking() {
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/nyc/next?${listQuery}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setActionError(data.error || "Could not start the list.");
      if (!data.id) return setNotice("Nobody left in this list.");
      router.push(contactHref(data.id, { query: listQuery, label: listLabel, index: data.index, total: data.total }));
    } catch {
      setActionError("Could not reach the server. Check your connection and retry.");
    }
  }

  async function changeStage(id: string, stage: string) {
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/nyc/contacts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      const err = await errorOf(res);
      if (err) return setActionError(err);
      setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, stage } : c)));
      loadOverview();
    } catch {
      setActionError("Could not update the stage. Check your connection and retry.");
    }
  }

  async function bulk(
    action: "stage" | "add_tag" | "remove_tag" | "kind" | "delete" | "restore" | "purge",
    value?: string
  ): Promise<string | null> {
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch("/api/admin/nyc/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          allMatching ? { filters, action, value } : { ids: Array.from(selected), action, value }
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return data.error || `Bulk change failed (${res.status}).`;
      const n: number = data.updated ?? data.deleted ?? data.restored ?? 0;
      const who = `${n.toLocaleString()} ${n === 1 ? "contact" : "contacts"}`;
      setNotice(
        action === "delete"
          ? `Moved ${who} to Recently deleted. You can restore them from there.`
          : action === "restore"
            ? `Restored ${who}.`
            : action === "purge"
              ? `Deleted ${who} forever.`
          : action === "stage"
            ? `Moved ${who} to ${stageMeta(value ?? "").label}.`
            : action === "kind"
              ? `Marked ${who} as ${KIND_LABELS[value ?? ""] ?? value}.`
              : action === "add_tag"
                ? `Tagged ${who} “${value}”.`
                : `Removed “${value}” from ${who}.`
      );
      const removed = action === "delete" || action === "restore" || action === "purge";
      await Promise.all([fetchContacts(removed ? 0 : offset), loadOverview()]);
      return null;
    } catch {
      return "Could not reach the server. Check your connection and retry.";
    } finally {
      setBusy(false);
    }
  }

  async function runBulk(action: "stage" | "kind", value: string) {
    const err = await bulk(action, value);
    if (err) setActionError(err);
  }

  async function saveList(name: string): Promise<string | null> {
    const res = await fetch("/api/admin/nyc/smart-lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, filters }),
    });
    const err = await errorOf(res);
    if (!err) {
      setNotice(`Saved “${name}”.`);
      loadOverview();
    }
    return err;
  }

  async function deleteList(list: NavList) {
    if (!window.confirm(`Delete the list “${list.label}”? Its contacts stay in the book.`)) return;
    const res = await fetch(`/api/admin/nyc/smart-lists/${list.key}`, { method: "DELETE" });
    const err = await errorOf(res);
    if (err) return setActionError(err);
    loadOverview();
  }

  const filtered = Object.keys(filters).length > 0;
  const inDeleted = filters.scope === "deleted";
  const described = describeFilters(filters);
  const stageValue = filters.stages?.length === 1 ? filters.stages[0] : filters.stages?.length ? "__multi" : undefined;
  const reach = REACH_OPTIONS.find((o) => o.key === (filters.reach ?? "")) ?? REACH_OPTIONS[0];
  const touch = TOUCH_OPTIONS.find((o) => o.key === (filters.touch ?? "")) ?? TOUCH_OPTIONS[0];
  const budget = BUDGET_OPTIONS.find((o) => o.key === (filters.budget ?? "")) ?? BUDGET_OPTIONS[0];
  const kind = KIND_OPTIONS.find((o) => o.key === (filters.kind ?? "")) ?? KIND_OPTIONS[0];
  // Filters beyond the chosen list's own, for the phone "Filters (n)" button.
  const extraFilterCount = activeList ? 0 : Object.keys(filters).filter((k) => k !== "q").length;
  const beds = BEDS_OPTIONS.find((o) => o.key === (filters.beds ?? "")) ?? BEDS_OPTIONS[0];
  const added = ADDED_OPTIONS.find((o) => o.key === (filters.added ?? "")) ?? ADDED_OPTIONS[0];
  const everyone = overview.counts.all ?? 0;

  return (
    <div className={cn("space-y-5", bulkCount > 0 && "pb-36 sm:pb-24")}>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">NYC Contacts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {everyone.toLocaleString()} {everyone === 1 ? "person" : "people"} from the brokerage book, kept apart from
            Staycio&apos;s Miami leads.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              fetchContacts(offset);
              loadOverview();
            }}
            disabled={loading}
            aria-label="Refresh"
            title="Refresh"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] transition-colors hover:bg-white/[0.08] disabled:opacity-60"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setDialog("add")}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-black transition-colors hover:bg-white/90"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add person
          </button>
        </div>
      </div>

      <div className="xl:grid xl:grid-cols-[14rem_minmax(0,1fr)] xl:items-start xl:gap-6">
        <aside className="hidden xl:sticky xl:top-6 xl:block">
          <ListSidebar
            lists={lists}
            counts={overview.counts}
            activeKey={activeList?.key}
            onChoose={chooseList}
            onDelete={deleteList}
          />
        </aside>

        <div className="min-w-0 space-y-5">
          <div className="xl:hidden">
            <ListPicker lists={lists} counts={overview.counts} activeKey={activeList?.key} onChoose={chooseList} />
          </div>

          {/* Search + filters */}
          <div className="space-y-3">
            <div className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchRef}
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && search) {
                    e.preventDefault();
                    setSearch("");
                  }
                }}
                placeholder="Search name, phone, email, tag or listing address"
                aria-label="Search contacts"
                aria-keyshortcuts="/"
                className="pl-9"
              />
            </div>

            {/* Phones: filters fold behind one button so the list is on screen. */}
            <div className="flex gap-2 sm:hidden">
              <button
                type="button"
                onClick={() => setShowFilters((v) => !v)}
                aria-expanded={showFilters}
                className={cn(chip, "flex-1 justify-center", extraFilterCount ? "border-sky-400/30 bg-sky-400/10 text-sky-100" : "border-white/10 bg-white/[0.03]")}
              >
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                {showFilters ? "Hide filters" : extraFilterCount ? `Filters (${extraFilterCount})` : "Filters"}
              </button>
            </div>

            <div className={cn("flex-wrap gap-2 sm:flex", showFilters ? "flex" : "hidden")}>
              <FacetPicker
                label="Stage"
                value={stageValue}
                options={overview.facets.stages}
                special={stageValue === "__multi" ? [{ value: "__multi", label: `${filters.stages!.length} stages` }] : []}
                display={(v) => stageMeta(v).label}
                onChange={(v) => setFilter("stages", v && v !== "__multi" ? [v] : v === "__multi" ? filters.stages : undefined)}
              />
              <FacetPicker
                label="Neighborhood"
                value={filters.hood}
                options={overview.facets.neighborhoods}
                onChange={(v) => setFilter("hood", v)}
              />
              <FacetPicker label="Tag" value={filters.tag} options={overview.facets.tags} onChange={(v) => setFilter("tag", v)} />
              <FacetPicker label="Source" value={filters.source} options={overview.facets.sources} onChange={(v) => setFilter("source", v)} />
              <FacetPicker
                label="Previous agent"
                value={filters.agent}
                options={overview.facets.agents}
                special={[{ value: NO_AGENT, label: "None" }]}
                onChange={(v) => setFilter("agent", v)}
              />
              {(
                [
                  ["kind", kind, KIND_OPTIONS, "Type"],
                  ["budget", budget, BUDGET_OPTIONS, "Budget"],
                  ["beds", beds, BEDS_OPTIONS, "Size"],
                  ["touch", touch, TOUCH_OPTIONS, "Contact history"],
                  ["reach", reach, REACH_OPTIONS, "Reachable by"],
                  ["added", added, ADDED_OPTIONS, "Date added"],
                ] as const
              ).map(([key, current, options, name]) => (
                <PopoverMenu
                  key={key}
                  label={`${name}: ${current.label}`}
                  triggerClassName={cn(chip, current.key ? "border-sky-400/30 bg-sky-400/10 text-sky-100" : "border-white/10 bg-white/[0.03]")}
                  triggerContent={
                    <>
                      {current.label}
                      <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
                    </>
                  }
                  items={options.map((o) => ({ key: o.key || "any", text: o.label, label: o.label, checked: o.key === current.key }))}
                  onSelect={(k) => setFilter(key, (k === "any" ? undefined : k) as never)}
                />
              ))}
              <PopoverMenu
                label={`Sort: ${SORT_LABELS[sort]}`}
                align="end"
                triggerClassName={cn(chip, "border-white/10 bg-white/[0.03] sm:ml-auto")}
                triggerContent={
                  <>
                    <ArrowDownUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    {SORT_LABELS[sort]}
                    <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
                  </>
                }
                items={SORTS.map((s) => ({ key: s, text: SORT_LABELS[s], label: SORT_LABELS[s], checked: s === sort }))}
                onSelect={(s) => setSort(s as CrmSort)}
              />
            </div>

            {activeList && activeList.key !== "all" ? (
              // A list explains itself; its filters are not "your filters".
              <p className="text-sm text-muted-foreground">{activeList.hint}</p>
            ) : (
              filtered && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="text-muted-foreground">{described.join(" · ")}</span>
                  <button type="button" onClick={() => setDialog("save")} className="inline-flex items-center gap-1 font-medium text-sky-300 hover:text-sky-200">
                    <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />
                    Save as list
                  </button>
                  <button type="button" onClick={clearFilters} className="font-medium text-foreground/80 hover:text-foreground">
                    Clear
                  </button>
                </div>
              )
            )}
          </div>

          {[loadError, actionError].map(
            (msg, i) =>
              msg && (
                <div key={i} role="alert" className="flex items-center justify-between gap-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  <span className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {msg}
                  </span>
                  <button
                    type="button"
                    onClick={() => (i === 0 ? fetchContacts(offset) : setActionError(null))}
                    className="shrink-0 rounded-md border border-red-500/40 px-3 py-1 text-xs font-medium hover:bg-red-500/20"
                  >
                    {i === 0 ? "Retry" : "Dismiss"}
                  </button>
                </div>
              )
          )}

          {notice && (
            <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              {notice}
            </div>
          )}

          {/* The list */}
          <section aria-label="Contacts" className="overflow-clip rounded-xl border border-white/[0.08] bg-white/[0.02] shadow-xl shadow-black/20">
            <div className="flex min-h-[52px] flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-2 sm:px-5">
              <label className={cn("-m-2 flex items-center gap-3 p-2", contacts.length > 0 ? "cursor-pointer" : "opacity-50")}>
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allOnPage}
                  disabled={contacts.length === 0}
                  onChange={(e) => {
                    setSelected(e.target.checked ? new Set(pageIds) : new Set());
                    setAllMatching(false);
                  }}
                  aria-label="Select everyone on this page"
                  className="h-4 w-4 cursor-pointer rounded border-white/20 bg-transparent accent-white disabled:cursor-default"
                />
                <span className="text-sm font-semibold">
                  <span className="tabular-nums">{total.toLocaleString()}</span> {total === 1 ? "person" : "people"}
                  <span className="font-normal text-muted-foreground"> · {listLabel}</span>
                </span>
              </label>
              <div className="flex items-center gap-3">
                {loading && (
                  <span role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    Updating
                  </span>
                )}
                <button
                  type="button"
                  onClick={startWorking}
                  disabled={total === 0}
                  title={`Open the first person and step through the list with Next (${SORT_LABELS[workSort].toLowerCase()})`}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 text-sm font-medium text-emerald-100 transition-colors hover:bg-emerald-400/20 disabled:opacity-40"
                >
                  <PhoneForwarded className="h-4 w-4" aria-hidden="true" />
                  Work this list
                </button>
              </div>
            </div>

            {allOnPage && total > contacts.length && (
              <div className="border-b border-white/[0.06] bg-sky-400/[0.06] px-4 py-2 text-center text-sm sm:px-5">
                {allMatching ? (
                  <>
                    All <span className="font-semibold tabular-nums">{total.toLocaleString()}</span> people in this list are selected.{" "}
                    <button type="button" onClick={() => setAllMatching(false)} className="font-medium text-sky-300 hover:text-sky-200">
                      Just this page
                    </button>
                  </>
                ) : (
                  <>
                    {contacts.length} on this page selected.{" "}
                    <button type="button" onClick={() => setAllMatching(true)} className="font-medium text-sky-300 hover:text-sky-200">
                      Select all {total.toLocaleString()} in this list
                    </button>
                  </>
                )}
              </div>
            )}

            {contacts.length === 0 && loading ? (
              <ul aria-hidden="true" className="divide-y divide-white/[0.06]">
                {Array.from({ length: 6 }).map((_, i) => (
                  <li key={i} className={cn(CONTACT_GRID, "px-4 py-4 sm:px-5")}>
                    <span className="mt-2.5 h-4 w-4 rounded bg-white/[0.06] lg:mt-0" />
                    <span className="h-9 w-9 animate-pulse rounded-full bg-white/[0.06]" />
                    <span className="space-y-2">
                      <span className="block h-3.5 w-40 animate-pulse rounded bg-white/[0.08]" />
                      <span className="block h-3 w-56 animate-pulse rounded bg-white/[0.05]" />
                    </span>
                  </li>
                ))}
              </ul>
            ) : contacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
                <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
                  <Users className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                </span>
                <p className="text-sm font-semibold">{filtered ? "Nobody matches" : "The book is empty"}</p>
                <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                  {filtered ? "Try another search, or clear the filters." : "Import a Follow Up Boss export to fill it."}
                </p>
                {filtered ? (
                  <button type="button" onClick={clearFilters} className="mt-5 inline-flex h-9 items-center rounded-lg border border-white/10 bg-white/[0.04] px-4 text-sm font-medium hover:bg-white/[0.08]">
                    Clear filters
                  </button>
                ) : (
                  <Link href="/admin/nyc/import" className="mt-5 inline-flex h-9 items-center rounded-lg border border-white/10 bg-white/[0.04] px-4 text-sm font-medium hover:bg-white/[0.08]">
                    Import contacts
                  </Link>
                )}
              </div>
            ) : (
              <ul className={cn("divide-y divide-white/[0.06] transition-opacity", loading && "opacity-60")}>
                {contacts.map((c, i) => (
                  <ContactRow
                    key={c.id}
                    contact={c}
                    href={hrefFor(c.id, i)}
                    selected={allMatching || selected.has(c.id)}
                    now={now}
                    today={today}
                    stages={stagesPresent}
                    onSelect={(id, checked) => {
                      setAllMatching(false);
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (checked) next.add(id);
                        else next.delete(id);
                        return next;
                      });
                    }}
                    onStageChange={changeStage}
                    onReach={(id, kind) => router.push(hrefFor(id, i, kind))}
                  />
                ))}
              </ul>
            )}

            {total > PAGE_SIZE && (
              <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-4 py-2.5 sm:px-5">
                <p className="text-xs tabular-nums text-muted-foreground">
                  {(offset + 1).toLocaleString()}–{Math.min(offset + PAGE_SIZE, total).toLocaleString()} of {total.toLocaleString()}
                </p>
                <div className="flex gap-1">
                  <button
                    type="button"
                    disabled={offset === 0 || loading}
                    onClick={() => fetchContacts(Math.max(0, offset - PAGE_SIZE))}
                    className="inline-flex h-9 items-center gap-1 rounded-lg px-3 text-sm font-medium hover:bg-white/[0.06] disabled:pointer-events-none disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={offset + PAGE_SIZE >= total || loading}
                    onClick={() => fetchContacts(offset + PAGE_SIZE)}
                    className="inline-flex h-9 items-center gap-1 rounded-lg px-3 text-sm font-medium hover:bg-white/[0.06] disabled:pointer-events-none disabled:opacity-40"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      <NycBulkBar
        deletedMode={inDeleted}
        onRestore={async () => {
          const err = await bulk("restore");
          if (err) setActionError(err);
        }}
        count={bulkCount}
        stages={stagesPresent}
        busy={busy}
        onStage={(s) => runBulk("stage", s)}
        onKind={(k) => runBulk("kind", k)}
        onTags={() => setDialog("tags")}
        onDelete={() => setDialog("delete")}
        onClear={() => {
          setSelected(new Set());
          setAllMatching(false);
        }}
      />

      <TagsDialog
        open={dialog === "tags"}
        onOpenChange={(o) => setDialog(o ? "tags" : null)}
        count={bulkCount}
        tags={overview.facets.tags}
        onApply={(mode, tag) => bulk(mode, tag)}
      />
      <DeleteContactsDialog
        open={dialog === "delete"}
        onOpenChange={(o) => setDialog(o ? "delete" : null)}
        count={bulkCount}
        forever={inDeleted}
        onConfirm={() => bulk(inDeleted ? "purge" : "delete")}
      />
      <SaveListDialog
        open={dialog === "save"}
        onOpenChange={(o) => setDialog(o ? "save" : null)}
        summary={described.join(" · ")}
        onSave={saveList}
      />
      <AddContactDialog open={dialog === "add"} onOpenChange={(o) => setDialog(o ? "add" : null)} sources={overview.facets.sources} />
    </div>
  );
}
