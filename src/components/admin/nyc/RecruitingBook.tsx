"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Mail,
  PhoneCall,
  Search,
  Users,
  X,
} from "lucide-react";
import { cn, telHref } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { PopoverMenu } from "@/components/admin/leads/PopoverMenu";
import { ageLabel, avatarTone, initials } from "@/components/admin/leads/lead-format";
import { filtersToParams, type CrmFilters, type CrmSort } from "@/lib/crm/filters";
import { PARTNER_STATUSES, partnerMeta, worksIn } from "@/lib/crm/recruiting";
import { displayName, formatPhone } from "@/lib/crm/normalize";
import type { CrmContactListRow, CrmFacets } from "@/lib/crm/types";
import { FacetPicker } from "./FacetPicker";
import { PartnerStatusMenu } from "./PartnerStatusMenu";
import { errorOf } from "./NycDialogs";
import { contactHref, type ReachKind, type WorkContext } from "./work";
import { useNow } from "./use-now";

const PAGE_SIZE = 50;

/** The recruiting view only ever shows brokers. */
type RecruitFilters = Omit<CrmFilters, "kind">;

interface RecruitingBookProps {
  initialContacts: CrmContactListRow[];
  initialTotal: number;
  initialFacets: CrmFacets;
  initialFilters: RecruitFilters;
  initialSort: CrmSort;
}

const SORT_OPTIONS: { key: CrmSort; label: string }[] = [
  { key: "added", label: "Newest inquiry first" },
  { key: "recent", label: "Recent activity" },
  { key: "name", label: "Name A–Z" },
];

const iconButton =
  "relative z-10 inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground lg:h-8 lg:w-8";

const ROW_GRID =
  "grid grid-cols-[1.25rem_2.25rem_minmax(0,1fr)] gap-x-3 lg:grid-cols-[1.25rem_2.25rem_minmax(0,1fr)_10rem_8rem_5.5rem] lg:items-center lg:gap-x-4";

/**
 * Agents who asked about the brokerage's listings, worked as recruits for
 * Staycio: firm, the market they work, and a recruiting status instead of
 * a renter stage.
 */
export function RecruitingBook({ initialContacts, initialTotal, initialFacets, initialFilters, initialSort }: RecruitingBookProps) {
  const router = useRouter();
  const now = useNow();
  const [filters, setFilters] = useState<RecruitFilters>(initialFilters);
  const [sort, setSort] = useState<CrmSort>(initialSort);
  const [search, setSearch] = useState(initialFilters.q ?? "");
  const [contacts, setContacts] = useState(initialContacts);
  const [total, setTotal] = useState(initialTotal);
  const [offset, setOffset] = useState(0);
  const [facets, setFacets] = useState(initialFacets);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const requestId = useRef(0);
  const firstRender = useRef(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => {
        const q = search.trim() || undefined;
        if (f.q === q) return f;
        const next = { ...f };
        if (q) next.q = q;
        else delete next.q;
        return next;
      });
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  const query = useMemo(() => {
    const p = filtersToParams({ ...filters, kind: "broker" });
    p.set("sort", sort);
    return p;
  }, [filters, sort]);

  const loadFacets = useCallback(async () => {
    const res = await fetch("/api/admin/nyc/overview").catch(() => null);
    if (res?.ok) setFacets((await res.json()).facets);
  }, []);

  const fetchPage = useCallback(
    async (nextOffset: number) => {
      const id = ++requestId.current;
      setLoading(true);
      const params = new URLSearchParams(query);
      params.set("offset", String(nextOffset));
      const res = await fetch(`/api/admin/nyc/contacts?${params}`).catch(() => null);
      const data = res ? await res.json().catch(() => ({})) : {};
      if (id !== requestId.current) return;
      setLoading(false);
      if (!res || !res.ok || !Array.isArray(data.contacts)) {
        setError(data.error || "Could not load the agents.");
        return;
      }
      setError(null);
      setContacts(data.contacts);
      setTotal(data.total ?? 0);
      setOffset(nextOffset);
      setSelected(new Set());
      setAllMatching(false);
    },
    [query]
  );

  useEffect(() => {
    const p = new URLSearchParams(query);
    p.delete("kind");
    if (sort === "added") p.delete("sort");
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    // Next tick, so the effect itself never sets state.
    const t = setTimeout(() => fetchPage(0), 0);
    return () => clearTimeout(t);
  }, [fetchPage, query, sort]);

  function setFilter<K extends keyof RecruitFilters>(key: K, value: RecruitFilters[K] | undefined) {
    setFilters((f) => {
      const next = { ...f };
      if (value === undefined || value === "") delete next[key];
      else next[key] = value;
      return next;
    });
  }

  const work: (index: number) => WorkContext | null = (index) =>
    sort === "recent"
      ? null
      : { query: query.toString(), label: "Recruiting", index: offset + index, total, base: "/admin/nyc/recruiting" };

  async function setStatus(ids: string[] | null, status: string) {
    setError(null);
    const res = await fetch("/api/admin/nyc/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ids ? { ids, action: "partner", value: status } : { filters: { ...filters, kind: "broker" }, action: "partner", value: status }),
    }).catch(() => null);
    const err = res ? await errorOf(res) : "Could not reach the server.";
    if (err) return setError(err);
    const n = ids ? ids.length : total;
    if (ids && ids.length === 1) {
      setContacts((prev) => prev.map((c) => (c.id === ids[0] ? { ...c, partner_status: status } : c)));
    } else {
      setNotice(`Moved ${n.toLocaleString()} ${n === 1 ? "agent" : "agents"} to ${partnerMeta(status).label}.`);
      fetchPage(filters.partner ? 0 : offset);
    }
    loadFacets();
  }

  function reach(id: string, index: number, kind: ReachKind) {
    router.push(contactHref(id, work(index), kind));
  }

  const counts = Object.fromEntries(facets.partner.map((f) => [f.value, f.count]));
  const allBrokers = facets.partner.reduce((n, f) => n + f.count, 0);
  const pageIds = contacts.map((c) => c.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const bulkCount = allMatching ? total : selected.size;
  const sortLabel = SORT_OPTIONS.find((o) => o.key === sort)?.label ?? "Newest inquiry first";
  const filtered = Object.keys(filters).length > 0;

  return (
    <div className={cn("space-y-5", bulkCount > 0 && "pb-28")}>
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Recruiting</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {allBrokers.toLocaleString()} agents who asked about your listings: people to bring to Staycio. Their firm comes
          from their work email; &ldquo;works&rdquo; is the listing they asked about.
        </p>
      </div>

      {/* Pipeline */}
      <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.02]">
        <div className="flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Filter by recruiting status">
          {[{ value: "", label: "All agents", dot: "bg-white/70" }, ...PARTNER_STATUSES].map((s, i) => {
            const active = (filters.partner ?? "") === s.value;
            const n = s.value ? (counts[s.value] ?? 0) : allBrokers;
            return (
              <button
                key={s.value || "all"}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter("partner", (s.value || undefined) as RecruitFilters["partner"])}
                className={cn(
                  "relative min-w-[7rem] flex-1 px-4 py-3 text-left transition-colors",
                  i > 0 && "border-l border-white/[0.06]",
                  active ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
                )}
              >
                <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} aria-hidden="true" />
                  <span className={cn(active && "text-foreground")}>{s.label}</span>
                </span>
                <span className={cn("mt-1 block text-2xl font-semibold tabular-nums", n === 0 && "text-white/25")}>{n.toLocaleString()}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Search + filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, phone or firm"
            aria-label="Search agents"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <FacetPicker label="Firm" value={filters.company} options={facets.companies} onChange={(v) => setFilter("company", v)} />
          <FacetPicker label="Area" value={filters.hood} options={facets.broker_neighborhoods} onChange={(v) => setFilter("hood", v)} />
          <button
            type="button"
            aria-pressed={filters.touch === "replied"}
            onClick={() => setFilter("touch", filters.touch === "replied" ? undefined : "replied")}
            className={cn(
              "inline-flex h-11 items-center rounded-lg border px-3.5 text-sm md:h-10",
              filters.touch === "replied" ? "border-sky-400/30 bg-sky-400/10 text-sky-100" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
            )}
            title="Replied to your team at least once: there is already a relationship"
          >
            Replied to your team
          </button>
          <button
            type="button"
            aria-pressed={filters.added === "365"}
            onClick={() => setFilter("added", filters.added === "365" ? undefined : "365")}
            className={cn(
              "inline-flex h-11 items-center rounded-lg border px-3.5 text-sm md:h-10",
              filters.added === "365" ? "border-sky-400/30 bg-sky-400/10 text-sky-100" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
            )}
            title="Inquired in the last 12 months: their work email is most likely still good"
          >
            Active in the last year
          </button>
          <PopoverMenu
            label={`Sort: ${sortLabel}`}
            align="end"
            triggerClassName="inline-flex h-11 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3.5 text-sm hover:bg-white/[0.06] md:h-10 sm:ml-auto"
            triggerContent={
              <>
                {sortLabel}
                <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
              </>
            }
            items={SORT_OPTIONS.map((o) => ({ key: o.key, text: o.label, label: o.label, checked: o.key === sort }))}
            onSelect={(k) => setSort(k as CrmSort)}
          />
        </div>
        {filtered && (
          <button
            type="button"
            onClick={() => {
              setFilters({});
              setSearch("");
            }}
            className="text-sm font-medium text-foreground/80 hover:text-foreground"
          >
            Clear filters
          </button>
        )}
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          {notice}
        </div>
      )}

      <section aria-label="Agents" className="overflow-clip rounded-xl border border-white/[0.08] bg-white/[0.02]">
        <div className="flex min-h-[52px] items-center justify-between gap-3 border-b border-white/[0.06] px-4 sm:px-5">
          <label className="-m-2 flex cursor-pointer items-center gap-3 p-2">
            <input
              type="checkbox"
              checked={allOnPage}
              disabled={contacts.length === 0}
              onChange={(e) => {
                setSelected(e.target.checked ? new Set(pageIds) : new Set());
                setAllMatching(false);
              }}
              aria-label="Select everyone on this page"
              className="h-4 w-4 cursor-pointer accent-white"
            />
            <span className="text-sm font-semibold">
              <span className="tabular-nums">{total.toLocaleString()}</span> {total === 1 ? "agent" : "agents"}
            </span>
          </label>
          {loading && (
            <span role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              Updating
            </span>
          )}
        </div>

        {allOnPage && total > contacts.length && (
          <div className="border-b border-white/[0.06] bg-sky-400/[0.06] px-4 py-2 text-center text-sm">
            {allMatching ? (
              <>
                All {total.toLocaleString()} selected.{" "}
                <button type="button" onClick={() => setAllMatching(false)} className="font-medium text-sky-300">
                  Just this page
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setAllMatching(true)} className="font-medium text-sky-300">
                Select all {total.toLocaleString()}
              </button>
            )}
          </div>
        )}

        {contacts.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <Users className="mb-3 h-6 w-6 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-semibold">{filtered ? "No agents match" : "No agents yet"}</p>
          </div>
        ) : (
          <ul className={cn("divide-y divide-white/[0.06] transition-opacity", loading && "opacity-60")}>
            {contacts.map((c, i) => {
              const name = displayName(c);
              const named = !!(c.first_name || c.last_name);
              const guessed = !!c.extra?.["Name guessed from email"];
              const email = c.emails[0];
              const phone = c.phones[0];
              const works = worksIn(c);
              const isSelected = allMatching || selected.has(c.id);
              return (
                <li key={c.id} className={cn(ROW_GRID, "group relative px-4 py-3.5 sm:px-5", isSelected ? "bg-sky-400/[0.06]" : "hover:bg-white/[0.025]")}>
                  <label className="relative z-10 -m-3 flex cursor-pointer items-center justify-center self-start p-3 pt-[1.375rem] lg:self-center lg:pt-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        setAllMatching(false);
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(c.id);
                          else next.delete(c.id);
                          return next;
                        });
                      }}
                      aria-label={`Select ${name}`}
                      className="h-4 w-4 cursor-pointer accent-white"
                    />
                  </label>
                  <div aria-hidden="true" className={cn("flex h-9 w-9 items-center justify-center self-start rounded-full text-xs font-semibold ring-1 lg:self-center", avatarTone(email || c.id))}>
                    {initials(named ? name : null, email ?? null)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <Link
                        href={contactHref(c.id, work(i))}
                        className="min-w-0 truncate text-sm font-semibold after:absolute after:inset-0 after:content-[''] hover:underline"
                      >
                        {named ? name : "Name unknown"}
                      </Link>
                      {guessed && (
                        <span className="text-[11px] text-muted-foreground" title={`Guessed from ${c.extra["Name guessed from email"]}`}>
                          (name from email)
                        </span>
                      )}
                      {c.company && <span className="text-[13px] text-foreground/80">· {c.company}</span>}
                    </div>
                    <div className="mt-0.5 flex min-w-0 flex-wrap gap-x-3 text-[13px] text-muted-foreground">
                      {email && <span className="min-w-0 truncate">{email}</span>}
                      {phone && <span className="whitespace-nowrap tabular-nums">{formatPhone(phone)}</span>}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {works && <span>Works {works}</span>}
                      {c.last_inbound_at && (
                        <span className="rounded-md bg-sky-400/10 px-1.5 py-0.5 text-sky-200">Replied to your team</span>
                      )}
                      {c.company === "Mayell Real Estate" && (
                        <span className="rounded-md bg-emerald-400/10 px-1.5 py-0.5 text-emerald-200">Your former agent</span>
                      )}
                    </div>
                  </div>
                  <div className="col-span-full mt-3 flex flex-wrap items-center justify-between gap-2 lg:contents">
                    <div className="relative z-10">
                      <PartnerStatusMenu status={c.partner_status} who={name} onChange={(s) => setStatus([c.id], s)} />
                    </div>
                    <span className="text-xs text-muted-foreground lg:text-right">
                      {now === null ? "" : c.added_at ? `Inquired ${ageLabel(c.added_at, now)}` : ""}
                    </span>
                    <div className="flex items-center gap-1 lg:justify-end">
                      {phone && !c.do_not_contact && (
                        <a href={`tel:${telHref(phone)}`} onClick={() => reach(c.id, i, "call")} className={iconButton} aria-label={`Call ${name}`} title="Call">
                          <PhoneCall className="h-4 w-4" />
                        </a>
                      )}
                      {email && c.has_real_email && !c.do_not_contact && (
                        <a href={`mailto:${email}`} onClick={() => reach(c.id, i, "email")} className={iconButton} aria-label={`Email ${name}`} title="Email">
                          <Mail className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-4 py-2.5 sm:px-5">
            <p className="text-xs tabular-nums text-muted-foreground">
              {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total.toLocaleString()}
            </p>
            <div className="flex gap-1">
              <button type="button" disabled={offset === 0 || loading} onClick={() => fetchPage(Math.max(0, offset - PAGE_SIZE))} className="inline-flex h-9 items-center gap-1 rounded-lg px-3 text-sm hover:bg-white/[0.06] disabled:opacity-40">
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                Previous
              </button>
              <button type="button" disabled={offset + PAGE_SIZE >= total || loading} onClick={() => fetchPage(offset + PAGE_SIZE)} className="inline-flex h-9 items-center gap-1 rounded-lg px-3 text-sm hover:bg-white/[0.06] disabled:opacity-40">
                Next
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </section>

      {bulkCount > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-[max(1rem,env(safe-area-inset-bottom))] lg:left-64">
          <div role="region" aria-label="Bulk actions" className="pointer-events-auto flex items-center gap-1 rounded-2xl border border-white/[0.12] bg-zinc-900/90 p-1.5 shadow-2xl shadow-black/60 backdrop-blur-xl">
            <span className="px-3 text-sm font-semibold tabular-nums">{bulkCount.toLocaleString()} selected</span>
            <PopoverMenu
              label="Set recruiting status"
              triggerClassName="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium hover:bg-white/[0.08] sm:h-9"
              triggerContent={
                <>
                  Set status
                  <ChevronDown className="h-3.5 w-3.5 opacity-50" aria-hidden="true" />
                </>
              }
              items={PARTNER_STATUSES.map((s) => ({
                key: s.value,
                text: s.label,
                label: s.label,
                icon: <span className={cn("h-2 w-2 rounded-full", s.dot)} aria-hidden="true" />,
              }))}
              onSelect={(status) => setStatus(allMatching ? null : Array.from(selected), status)}
            />
            <button
              type="button"
              onClick={() => {
                setSelected(new Set());
                setAllMatching(false);
              }}
              aria-label="Clear selection"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-white/[0.08] sm:h-9 sm:w-9"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
