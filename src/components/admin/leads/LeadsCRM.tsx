"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Globe,
  Layers,
  Loader2,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";
import type { LeadStats } from "@/lib/leads/stats";
import { LEAD_GRID, LeadRow, type LeadRowData } from "./LeadRow";
import { BulkActionBar } from "./BulkActionBar";
import { BulkEmailDialog } from "./BulkEmailDialog";
import { SendEmailDialog } from "./SendEmailDialog";
import { DeleteLeadsDialog } from "./DeleteLeadsDialog";
import { PipelineStrip } from "./PipelineStrip";
import { PopoverMenu } from "./PopoverMenu";
import { dayGroup, durationLabel, statusMeta, type DayGroup } from "./lead-format";

interface Agent {
  user_id: string;
  full_name: string | null;
}

interface LeadsCRMProps {
  initialLeads: LeadRowData[];
  initialTotal: number;
  initialStats: LeadStats;
  agents: Agent[];
}

const SOURCES = [
  { key: "", label: "All sources", icon: Layers },
  { key: "microsite", label: "Microsite", icon: Globe },
  { key: "web_form", label: "Web form", icon: FileText },
  { key: "chat", label: "Chat", icon: MessageCircle },
  { key: "voice", label: "Phone call", icon: Phone },
];

const LIMIT = 25;

export function LeadsCRM({ initialLeads, initialTotal, initialStats, agents }: LeadsCRMProps) {
  const [leads, setLeads] = useState<LeadRowData[]>(initialLeads);
  const [total, setTotal] = useState(initialTotal);
  const [stats, setStats] = useState<LeadStats>(initialStats);
  const [offset, setOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Inline/bulk write failures used to be console-only, and the inline status
  // change was applied locally even when the API rejected it.
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Shared clock for the rows' "3h ago" ages; see LeadRow's `now` prop.
  const [now, setNow] = useState<number | null>(null);

  // Email dialog state
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailTarget, setEmailTarget] = useState<LeadRowData | null>(null);
  const [bulkEmailOpen, setBulkEmailOpen] = useState(false);

  const requestIdRef = useRef(0);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!actionNotice) return;
    const timer = setTimeout(() => setActionNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [actionNotice]);

  // "/" jumps to search, as in most list UIs.
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

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchLeads = useCallback(async (newOffset: number) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (sourceFilter) params.set("source", sourceFilter);
      if (searchDebounced) params.set("search", searchDebounced);
      params.set("limit", String(LIMIT));
      params.set("offset", String(newOffset));

      const res = await fetch(`/api/leads?${params}`);
      const data = await res.json().catch(() => ({}));

      // Ignore stale responses
      if (requestId !== requestIdRef.current) return;

      // A failed refetch used to overwrite the server-rendered leads with an
      // empty array, so an auth or query error looked exactly like "you have
      // no leads". Keep what is on screen and say what went wrong instead.
      if (!res.ok || !Array.isArray(data.leads)) {
        setLoadError(
          data.error ||
            (res.status === 401 || res.status === 403
              ? "Your session expired or this account is not an admin. Sign in again."
              : `Could not load leads (${res.status}).`)
        );
        return;
      }

      setLoadError(null);
      setLeads(data.leads);
      setTotal(data.total || 0);
      setStats({
        status_counts: data.status_counts || {},
        waiting_count: data.waiting_count ?? 0,
        oldest_new_at: data.oldest_new_at ?? null,
      });
      setOffset(newOffset);
      setSelectedIds(new Set());
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      console.error("Fetch leads error:", err);
      setLoadError("Could not reach the server. Check your connection and retry.");
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [statusFilter, sourceFilter, searchDebounced]);

  // Refetch when filters change
  useEffect(() => {
    fetchLeads(0);
  }, [fetchLeads]);

  const pageIds = leads.map((l) => l.id);
  const selectedOnPage = pageIds.filter((id) => selectedIds.has(id)).length;
  const allOnPageSelected = pageIds.length > 0 && selectedOnPage === pageIds.length;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selectedOnPage > 0 && !allOnPageSelected;
    }
  }, [selectedOnPage, allOnPageSelected]);

  // Day buckets need the viewer's clock, so the list groups after mount.
  const groups = useMemo(() => {
    if (now === null) return [{ label: null as DayGroup | null, leads }];
    const out: { label: DayGroup | null; leads: LeadRowData[] }[] = [];
    for (const lead of leads) {
      const label = dayGroup(lead.created_at, now);
      const last = out[out.length - 1];
      if (last && last.label === label) last.leads.push(lead);
      else out.push({ label, leads: [lead] });
    }
    return out;
  }, [leads, now]);

  function handleSelectAll(checked: boolean) {
    setSelectedIds(checked ? new Set(pageIds) : new Set());
  }

  function handleSelect(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function handleInlineStatusChange(leadId: string, newStatus: string) {
    setActionError(null);
    try {
      const res = await fetch("/api/admin/leads/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_ids: [leadId], action: "status", value: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setActionError(data.error || `Could not update status (${res.status}).`);
        return;
      }
      // Update locally
      setLeads((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, status: newStatus } : l))
      );
      // Refresh counts
      fetchLeads(offset);
    } catch (err) {
      console.error("Status change error:", err);
      setActionError("Could not update status. Check your connection and retry.");
    }
  }

  async function handleBulkAction(action: "status" | "assign", value: string) {
    const ids = Array.from(selectedIds);
    setActionError(null);
    try {
      const res = await fetch("/api/admin/leads/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_ids: ids, action, value }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setActionError(data.error || `Bulk update failed (${res.status}).`);
        return;
      }
      const n = ids.length;
      setActionNotice(
        action === "status"
          ? `Moved ${n} ${n === 1 ? "lead" : "leads"} to ${statusMeta(value).label}.`
          : `Assigned ${n} ${n === 1 ? "lead" : "leads"}.`
      );
      fetchLeads(offset);
    } catch (err) {
      console.error("Bulk action error:", err);
      setActionError("Bulk update failed. Check your connection and retry.");
    }
  }

  function handleDeleted(deletedCount: number) {
    const deletedIds = selectedIds;
    setSelectedIds(new Set());
    setLeads((prev) => prev.filter((l) => !deletedIds.has(l.id)));
    setActionError(null);
    setActionNotice(`Deleted ${deletedCount} ${deletedCount === 1 ? "lead" : "leads"}.`);
    // Emptying the last page would otherwise leave "No leads" on screen with
    // earlier pages still full.
    const remaining = total - deletedCount;
    fetchLeads(offset > 0 && offset >= remaining ? Math.max(0, offset - LIMIT) : offset);
  }

  function handleOpenEmail(lead: LeadRowData) {
    setEmailTarget(lead);
    setEmailDialogOpen(true);
  }

  function clearFilters() {
    setStatusFilter("");
    setSourceFilter("");
    setSearch("");
  }

  const filtered = !!(statusFilter || sourceFilter || searchDebounced);
  const showingStart = total > 0 ? offset + 1 : 0;
  const showingEnd = Math.min(offset + LIMIT, total);
  const source = SOURCES.find((s) => s.key === sourceFilter) ?? SOURCES[0];
  const SourceIcon = source.icon;
  const newCount = stats.status_counts.new || 0;

  return (
    // Leave room for the floating BulkActionBar so it never covers the last rows.
    <div className={cn("space-y-6", selectedIds.size > 0 && "pb-36 sm:pb-24")}>
      {/* Header */}
      <div>
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Leads</h1>
          <button
            type="button"
            onClick={() => fetchLeads(offset)}
            disabled={loading}
            aria-label="Refresh leads"
            title="Refresh"
            className="inline-flex h-10 w-10 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] text-sm font-medium transition-colors hover:bg-white/[0.08] disabled:opacity-60 sm:w-auto sm:px-4"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden="true" />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
        {stats.waiting_count > 0 ? (
          <button
            type="button"
            onClick={() => setStatusFilter("new")}
            className="mt-2 inline-flex max-w-full items-center gap-2 rounded-2xl border border-amber-400/25 bg-amber-400/10 py-1 pl-2 pr-3 text-left text-sm text-amber-100 transition-colors hover:bg-amber-400/15"
          >
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60 motion-reduce:hidden" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
            </span>
            <span className="min-w-0">
              <span className="font-semibold">{stats.waiting_count}</span>{" "}
              {stats.waiting_count === 1 ? "new lead has" : "new leads have"} waited over a day
              {now !== null && stats.oldest_new_at && (
                <span className="whitespace-nowrap text-amber-200/70"> · oldest {durationLabel(stats.oldest_new_at, now)}</span>
              )}
            </span>
          </button>
        ) : (
          <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            {newCount > 0
              ? `${newCount} new ${newCount === 1 ? "lead" : "leads"}, all under a day old`
              : "Every lead has been contacted"}
          </p>
        )}
      </div>

      {loadError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
        >
          <span className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {loadError}
          </span>
          <button
            type="button"
            onClick={() => fetchLeads(offset)}
            className="shrink-0 rounded-md border border-red-500/40 px-3 py-1 text-xs font-medium hover:bg-red-500/20"
          >
            Retry
          </button>
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
        >
          <span className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {actionError}
          </span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="shrink-0 rounded-md border border-red-500/40 px-3 py-1 text-xs font-medium hover:bg-red-500/20"
          >
            Dismiss
          </button>
        </div>
      )}

      {actionNotice && (
        <div
          role="status"
          className="flex items-center justify-between gap-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200"
        >
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            {actionNotice}
          </span>
          <button
            type="button"
            onClick={() => setActionNotice(null)}
            className="shrink-0 rounded-md border border-emerald-500/40 px-3 py-1 text-xs font-medium hover:bg-emerald-500/20"
          >
            Dismiss
          </button>
        </div>
      )}

      <PipelineStrip counts={stats.status_counts} active={statusFilter} onChange={setStatusFilter} />

      {/* Search + Source Filter */}
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-0 flex-1 basis-60">
          {/* z-10: the Input's backdrop-blur makes it a stacking context that
              paints over (and blurs) an earlier absolute sibling. */}
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
            placeholder="Search name, email or phone"
            aria-label="Search leads"
            aria-keyshortcuts="/"
            className="pl-9 lg:pr-10"
          />
          {!search && (
            <kbd
              aria-hidden="true"
              className="pointer-events-none absolute right-3 top-1/2 z-10 hidden -translate-y-1/2 rounded border border-white/15 bg-white/[0.04] px-1.5 font-mono text-[11px] leading-5 text-muted-foreground lg:block"
            >
              /
            </kbd>
          )}
        </div>
        <PopoverMenu
          label={`Filter by source: ${source.label}`}
          align="end"
          triggerClassName={cn(
            "inline-flex h-11 items-center gap-2 rounded-lg border px-3.5 text-sm transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 md:h-10",
            sourceFilter ? "border-sky-400/30 bg-sky-400/10 text-sky-100" : "border-white/10 bg-white/[0.03]"
          )}
          triggerContent={
            <>
              <SourceIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              {source.label}
              <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
            </>
          }
          items={SOURCES.map((s) => {
            const Icon = s.icon;
            return {
              key: s.key || "all",
              text: s.label,
              label: s.label,
              checked: s.key === sourceFilter,
              icon: <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />,
            };
          })}
          onSelect={(key) => setSourceFilter(key === "all" ? "" : key)}
        />
      </div>

      {/* Leads List */}
      <section
        aria-label="Leads"
        className="overflow-clip rounded-xl border border-white/[0.08] bg-white/[0.02] shadow-xl shadow-black/20"
      >
        <div className="flex min-h-[52px] items-center justify-between gap-3 border-b border-white/[0.06] px-4 sm:px-5">
          <label className={cn("-m-2 flex items-center gap-3 p-2", leads.length > 0 ? "cursor-pointer" : "opacity-50")}>
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allOnPageSelected}
              disabled={leads.length === 0}
              onChange={(e) => handleSelectAll(e.target.checked)}
              aria-label="Select all leads on this page"
              className="h-4 w-4 cursor-pointer rounded border-white/20 bg-transparent accent-white disabled:cursor-default"
            />
            <span className="text-sm font-semibold">
              <span className="tabular-nums">{total}</span> {total === 1 ? "lead" : "leads"}
              {filtered && <span className="font-normal text-muted-foreground"> match</span>}
            </span>
          </label>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {loading && (
              <span role="status" className="flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Updating
              </span>
            )}
            {filtered && (
              <button type="button" onClick={clearFilters} className="rounded-md px-2 py-1 font-medium text-foreground/80 hover:bg-white/[0.06] hover:text-foreground">
                Clear filters
              </button>
            )}
          </div>
        </div>

        {leads.length === 0 && loading ? (
          <ul aria-hidden="true" className="divide-y divide-white/[0.06]">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className={cn(LEAD_GRID, "px-4 py-4 sm:px-5")}>
                <span className="mt-2.5 h-4 w-4 rounded bg-white/[0.06] lg:mt-0" />
                <span className="h-9 w-9 animate-pulse rounded-full bg-white/[0.06]" />
                <span className="space-y-2">
                  <span className="block h-3.5 w-40 animate-pulse rounded bg-white/[0.08]" />
                  <span className="block h-3 w-56 animate-pulse rounded bg-white/[0.05]" />
                  <span className="block h-3 w-32 animate-pulse rounded bg-white/[0.04]" />
                </span>
                <span className="hidden h-8 w-[8.75rem] animate-pulse rounded-full bg-white/[0.05] lg:block" />
                <span className="hidden lg:block" />
                <span className="hidden h-3 w-12 animate-pulse justify-self-end rounded bg-white/[0.05] lg:block" />
              </li>
            ))}
          </ul>
        ) : leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
              <Users className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            </span>
            <p className="text-sm font-semibold">{filtered ? "No leads match" : "No leads yet"}</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              {filtered
                ? "Try another search, or clear the filters to see every lead."
                : "Leads from the site, microsites, chat and phone land here."}
            </p>
            {filtered && (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-5 inline-flex h-9 items-center rounded-lg border border-white/10 bg-white/[0.04] px-4 text-sm font-medium hover:bg-white/[0.08]"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className={cn("transition-opacity", loading && "opacity-60")}>
            {groups.map((g, gi) => (
              <div key={g.label ?? "all"} role={g.label ? "group" : undefined} aria-labelledby={g.label ? `lead-group-${gi}` : undefined}>
                {g.label && (
                  <h2
                    id={`lead-group-${gi}`}
                    className={cn(
                      "flex items-center gap-2 bg-white/[0.015] px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sm:px-5",
                      gi > 0 && "border-t border-white/[0.06]"
                    )}
                  >
                    {g.label}
                    <span className="rounded-full bg-white/[0.06] px-1.5 text-[10px] tabular-nums text-foreground/70">
                      {g.leads.length}
                    </span>
                  </h2>
                )}
                <ul className={cn("divide-y divide-white/[0.06]", g.label && "border-t border-white/[0.06]")}>
                  {g.leads.map((lead) => (
                    <LeadRow
                      key={lead.id}
                      lead={lead}
                      selected={selectedIds.has(lead.id)}
                      now={now}
                      onSelect={handleSelect}
                      onStatusChange={handleInlineStatusChange}
                      onEmail={handleOpenEmail}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {total > LIMIT && (
          <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-4 py-2.5 sm:px-5">
            <p className="text-xs tabular-nums text-muted-foreground">
              {showingStart}–{showingEnd} of {total}
            </p>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={offset === 0 || loading}
                onClick={() => fetchLeads(Math.max(0, offset - LIMIT))}
                className="inline-flex h-9 items-center gap-1 rounded-lg px-3 text-sm font-medium hover:bg-white/[0.06] disabled:pointer-events-none disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                Previous
              </button>
              <button
                type="button"
                disabled={offset + LIMIT >= total || loading}
                onClick={() => fetchLeads(offset + LIMIT)}
                className="inline-flex h-9 items-center gap-1 rounded-lg px-3 text-sm font-medium hover:bg-white/[0.06] disabled:pointer-events-none disabled:opacity-40"
              >
                Next
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </section>

      <BulkActionBar
        selectedCount={selectedIds.size}
        agents={agents}
        onApply={handleBulkAction}
        onEmail={() => setBulkEmailOpen(true)}
        onDelete={() => setDeleteOpen(true)}
        onClear={() => setSelectedIds(new Set())}
      />

      <BulkEmailDialog
        open={bulkEmailOpen}
        onOpenChange={setBulkEmailOpen}
        leadIds={Array.from(selectedIds)}
        onSent={() => {
          setSelectedIds(new Set());
          fetchLeads(offset);
        }}
      />

      <DeleteLeadsDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        leadIds={Array.from(selectedIds)}
        leadName={
          selectedIds.size === 1
            ? leads.find((l) => selectedIds.has(l.id))?.name ?? null
            : null
        }
        onDeleted={handleDeleted}
      />

      {/* Email Dialog */}
      {emailTarget && (
        <SendEmailDialog
          open={emailDialogOpen}
          onOpenChange={setEmailDialogOpen}
          leadId={emailTarget.id}
          leadName={emailTarget.name}
          leadEmail={emailTarget.user_email}
          sourceDetail={emailTarget.source_detail}
        />
      )}
    </div>
  );
}
