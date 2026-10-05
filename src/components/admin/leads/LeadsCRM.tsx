"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { LeadRow, type LeadRowData } from "./LeadRow";
import { BulkActionBar } from "./BulkActionBar";
import { BulkEmailDialog } from "./BulkEmailDialog";
import { SendEmailDialog } from "./SendEmailDialog";
import { DeleteLeadsDialog } from "./DeleteLeadsDialog";

interface Agent {
  user_id: string;
  full_name: string | null;
}

interface LeadsCRMProps {
  initialLeads: LeadRowData[];
  initialTotal: number;
  initialStatusCounts: Record<string, number>;
  agents: Agent[];
}

const STATUS_TABS = [
  { key: "", label: "All" },
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "touring", label: "Touring" },
  { key: "applied", label: "Applied" },
  { key: "leased", label: "Leased" },
  { key: "lost", label: "Lost" },
];

const LIMIT = 25;

export function LeadsCRM({ initialLeads, initialTotal, initialStatusCounts, agents }: LeadsCRMProps) {
  const [leads, setLeads] = useState<LeadRowData[]>(initialLeads);
  const [total, setTotal] = useState(initialTotal);
  const [statusCounts, setStatusCounts] = useState(initialStatusCounts);
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
      setStatusCounts(data.status_counts || {});
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

  const totalAll = Object.values(statusCounts).reduce((a, b) => a + b, 0);
  const showingStart = total > 0 ? offset + 1 : 0;
  const showingEnd = Math.min(offset + LIMIT, total);

  return (
    // Leave room for the fixed BulkActionBar so it never covers the last rows.
    <div className={`space-y-6 ${selectedIds.size > 0 ? "pb-52 sm:pb-24" : ""}`}>
      {loadError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
        >
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => fetchLeads(offset)}
            className="shrink-0 rounded-md border border-red-500/40 px-3 py-1 text-xs font-medium hover:bg-red-500/20"
          >
            Retry
          </button>
        </div>
      )}

      {actionNotice && (
        <div
          role="status"
          className="flex items-center justify-between gap-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300"
        >
          <span>{actionNotice}</span>
          <button
            type="button"
            onClick={() => setActionNotice(null)}
            className="shrink-0 rounded-md border border-emerald-500/40 px-3 py-1 text-xs font-medium hover:bg-emerald-500/20"
          >
            Dismiss
          </button>
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
        >
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="shrink-0 rounded-md border border-red-500/40 px-3 py-1 text-xs font-medium hover:bg-red-500/20"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Status Tabs */}
      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => {
          const count = tab.key ? (statusCounts[tab.key] || 0) : totalAll;
          const active = statusFilter === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              aria-pressed={active}
              onClick={() => setStatusFilter(tab.key)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80"
              }`}
            >
              {tab.label}
              {/* The secondary badge is white text on a 6% white fill, which
                  vanished on the white active pill. */}
              <Badge
                variant="outline"
                className={`ml-1 text-xs ${active ? "border-black/15 bg-black/10 text-black" : ""}`}
              >
                {count}
              </Badge>
            </button>
          );
        })}
      </div>

      {/* Search + Source Filter */}
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-0 flex-1 basis-60">
          {/* z-10: the Input's backdrop-blur makes it a stacking context that
              paints over (and blurs) an earlier absolute sibling. */}
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or phone..."
            aria-label="Search leads"
            className="pl-9"
          />
        </div>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          aria-label="Filter by source"
          className="h-10 rounded-md border px-3 text-base md:text-sm bg-background"
        >
          <option value="">All Sources</option>
          <option value="web_form">Web Form</option>
          <option value="chat">Chat</option>
          <option value="voice">Voice</option>
          <option value="microsite">Microsite</option>
        </select>
      </div>

      {/* Leads List */}
      <Card>
        <CardHeader>
          {/* pl matches a row's border + p-4, so this box sits over theirs. */}
          <CardTitle className="flex flex-wrap items-center justify-between gap-3 pl-[17px] text-base">
            <label
              className={`-m-3 flex items-center gap-3 p-3 ${leads.length > 0 ? "cursor-pointer" : "opacity-50"}`}
            >
              <input
                ref={selectAllRef}
                type="checkbox"
                checked={allOnPageSelected}
                disabled={leads.length === 0}
                onChange={(e) => handleSelectAll(e.target.checked)}
                aria-label="Select all leads on this page"
                className="h-4 w-4 cursor-pointer rounded border-white/20"
              />
              <span>
                {total} {total === 1 ? "lead" : "leads"}
                {(statusFilter || sourceFilter || searchDebounced) && (
                  <span className="font-normal text-muted-foreground"> matching</span>
                )}
              </span>
            </label>
            {loading && (
              <span role="status" className="text-sm font-normal text-muted-foreground">
                Loading...
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {leads.length > 0 ? (
            <div className="space-y-3">
              {leads.map((lead) => (
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
            </div>
          ) : (
            <div className="py-12 text-center">
              <p className="text-muted-foreground">
                {searchDebounced || statusFilter || sourceFilter
                  ? "No leads match your filters."
                  : "No leads yet."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {total > LIMIT && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Showing {showingStart}-{showingEnd} of {total}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={offset === 0}
              onClick={() => fetchLeads(Math.max(0, offset - LIMIT))}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={offset + LIMIT >= total}
              onClick={() => fetchLeads(offset + LIMIT)}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Bulk Action Bar */}
      <BulkActionBar
        selectedCount={selectedIds.size}
        selectedIds={Array.from(selectedIds)}
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
