"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { LeadRow, type LeadRowData } from "./LeadRow";
import { BulkActionBar } from "./BulkActionBar";
import { SendEmailDialog } from "./SendEmailDialog";

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
  const [loading, setLoading] = useState(false);

  // Email dialog state
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailTarget, setEmailTarget] = useState<LeadRowData | null>(null);

  const requestIdRef = useRef(0);

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
      const data = await res.json();

      // Ignore stale responses
      if (requestId !== requestIdRef.current) return;

      setLeads(data.leads || []);
      setTotal(data.total || 0);
      setStatusCounts(data.status_counts || {});
      setOffset(newOffset);
      setSelectedIds(new Set());
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      console.error("Fetch leads error:", err);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [statusFilter, sourceFilter, searchDebounced]);

  // Refetch when filters change
  useEffect(() => {
    fetchLeads(0);
  }, [fetchLeads]);

  function handleSelect(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function handleInlineStatusChange(leadId: string, newStatus: string) {
    try {
      await fetch("/api/admin/leads/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_ids: [leadId], action: "status", value: newStatus }),
      });
      // Update locally
      setLeads((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, status: newStatus } : l))
      );
      // Refresh counts
      fetchLeads(offset);
    } catch (err) {
      console.error("Status change error:", err);
    }
  }

  async function handleBulkAction(action: "status" | "assign", value: string) {
    const ids = Array.from(selectedIds);
    try {
      await fetch("/api/admin/leads/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_ids: ids, action, value }),
      });
      fetchLeads(offset);
    } catch (err) {
      console.error("Bulk action error:", err);
    }
  }

  function handleOpenEmail(lead: LeadRowData) {
    setEmailTarget(lead);
    setEmailDialogOpen(true);
  }

  const totalAll = Object.values(statusCounts).reduce((a, b) => a + b, 0);
  const showingStart = total > 0 ? offset + 1 : 0;
  const showingEnd = Math.min(offset + LIMIT, total);

  return (
    <div className="space-y-6">
      {/* Status Tabs */}
      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => {
          const count = tab.key ? (statusCounts[tab.key] || 0) : totalAll;
          const active = statusFilter === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80"
              }`}
            >
              {tab.label}
              <Badge variant={active ? "secondary" : "outline"} className="ml-1 text-xs">
                {count}
              </Badge>
            </button>
          );
        })}
      </div>

      {/* Search + Source Filter */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or phone..."
            className="pl-9"
          />
        </div>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="rounded-md border px-3 py-2 text-sm bg-background"
        >
          <option value="">All Sources</option>
          <option value="web_form">Web Form</option>
          <option value="chat">Chat</option>
          <option value="voice">Voice</option>
        </select>
      </div>

      {/* Leads List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Leads</span>
            {loading && <span className="text-sm font-normal text-muted-foreground">Loading...</span>}
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
        <div className="flex items-center justify-between">
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
        onClear={() => setSelectedIds(new Set())}
      />

      {/* Email Dialog */}
      {emailTarget && (
        <SendEmailDialog
          open={emailDialogOpen}
          onOpenChange={setEmailDialogOpen}
          leadId={emailTarget.id}
          leadName={emailTarget.name}
          leadEmail={emailTarget.user_email}
        />
      )}
    </div>
  );
}
