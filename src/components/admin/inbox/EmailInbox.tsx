"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Inbox,
  Send,
  Star,
  Search,
  Plus,
  RefreshCw,
  Mail,
  MailOpen,
  ArrowDownLeft,
  ArrowUpRight,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Trash2,
  CheckSquare,
  Square,
  Bot,
  ShieldAlert,
  Zap,
} from "lucide-react";
import { ComposeModal } from "./ComposeModal";
import { ThreadView } from "./ThreadView";

type View = "inbox" | "sent" | "starred";

const PAGE_SIZE = 30;

const CATEGORY_COLORS: Record<string, string> = {
  tour_request: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  lease_inquiry: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  pricing_inquiry: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  application_status: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  move_in_question: "bg-teal-500/10 text-teal-400 border-teal-500/20",
  maintenance_request: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  amenity_question: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  scheduling: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  general_inquiry: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  feedback: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  partnership: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  support: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  personal: "bg-pink-500/10 text-pink-400 border-pink-500/20",
  spam: "bg-red-500/10 text-red-400 border-red-500/20",
  other: "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

interface Email {
  id: string;
  thread_id: string;
  direction: "inbound" | "outbound";
  status: string;
  from_email: string;
  from_name: string | null;
  to_email: string;
  to_name: string | null;
  subject: string;
  body_html: string;
  lead_id: string | null;
  is_starred: boolean;
  created_at: string;
  read_at: string | null;
  replied_at: string | null;
  ai_category: string | null;
  ai_confidence: number | null;
  ai_summary: string | null;
  ai_draft_html: string | null;
  metadata: Record<string, unknown> | null;
}

function StatusBadge({ email }: { email: Email }) {
  if (email.direction === "outbound") {
    const colors: Record<string, string> = {
      sent: "bg-muted text-muted-foreground",
      delivered: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      bounced: "bg-destructive/10 text-destructive border-destructive/20",
      failed: "bg-destructive/10 text-destructive border-destructive/20",
    };
    const icons: Record<string, React.ReactNode> = {
      sent: <Clock className="h-3 w-3" />,
      delivered: <CheckCircle2 className="h-3 w-3" />,
      bounced: <XCircle className="h-3 w-3" />,
      failed: <XCircle className="h-3 w-3" />,
    };
    return (
      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${colors[email.status] || colors.sent}`}>
        {icons[email.status] || icons.sent}
        {email.status.charAt(0).toUpperCase() + email.status.slice(1)}
      </span>
    );
  }
  const colors: Record<string, string> = {
    received: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    read: "bg-muted text-muted-foreground",
    replied: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${colors[email.status] || ""}`}>
      {email.status}
    </span>
  );
}

function CategoryBadge({ category }: { category: string | null }) {
  if (!category) return null;
  const label = category.replace(/_/g, " ");
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${CATEGORY_COLORS[category] || CATEGORY_COLORS.other}`}>
      {category === "spam" && <ShieldAlert className="h-3 w-3" />}
      {label}
    </span>
  );
}

export function EmailInbox() {
  const [view, setView] = useState<View>("inbox");
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [composeOpen, setComposeOpen] = useState(false);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  // Auto-reply toggle
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);
  const [autoReplyLoading, setAutoReplyLoading] = useState(false);

  // Fetch settings on mount
  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    try {
      const res = await fetch("/api/admin/settings");
      if (res.ok) {
        const data = await res.json();
        setAutoReplyEnabled(data.settings?.ai_auto_reply_enabled === true);
      }
    } catch {
      // ignore
    }
  }

  async function toggleAutoReply() {
    setAutoReplyLoading(true);
    try {
      const newValue = !autoReplyEnabled;
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "ai_auto_reply_enabled", value: newValue }),
      });
      if (res.ok) {
        setAutoReplyEnabled(newValue);
      }
    } catch {
      // ignore
    } finally {
      setAutoReplyLoading(false);
    }
  }

  // Guards against out-of-order responses when view/search/page change
  // while a previous fetch is still in flight.
  const fetchRequestIdRef = useRef(0);

  const fetchEmails = useCallback(async () => {
    const requestId = ++fetchRequestIdRef.current;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (view === "inbox") params.set("view", "inbox");
      else if (view === "sent") params.set("view", "sent");
      else params.set("view", "all");
      if (view === "starred") params.set("starred", "true");
      if (search) params.set("search", search);
      params.set("page", String(page));

      const res = await fetch(`/api/admin/emails?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();

      // A newer fetch started while this one was in flight — discard.
      if (requestId !== fetchRequestIdRef.current) return;

      setEmails(data.emails);
      setTotal(data.total);
      setUnreadCount(data.unread);
      setSelectedIds(new Set());
    } catch (err) {
      if (requestId === fetchRequestIdRef.current) {
        console.error("Fetch emails error:", err);
      }
    } finally {
      if (requestId === fetchRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [view, search, page]);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  useEffect(() => {
    setPage(1);
  }, [view, search]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Only when not in an input/textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      if (e.key === "c" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setComposeOpen(true);
      }
      if (e.key === "r" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        fetchEmails();
      }
      if (e.key === "Escape" && selectedEmailId) {
        setSelectedEmailId(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [fetchEmails, selectedEmailId]);

  function formatDate(dateStr: string) {
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    }
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function getDisplayName(email: Email) {
    if (email.direction === "inbound") {
      return email.from_name || email.from_email;
    }
    return `To: ${email.to_email}`;
  }

  function isRead(email: Email) {
    return email.status !== "received";
  }

  async function toggleStar(e: React.MouseEvent, emailItem: Email) {
    e.stopPropagation();
    const res = await fetch(`/api/admin/emails/${emailItem.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_starred: !emailItem.is_starred }),
    });
    if (res.ok) {
      setEmails((prev) =>
        prev.map((em) =>
          em.id === emailItem.id ? { ...em, is_starred: !em.is_starred } : em
        )
      );
    }
  }

  function toggleSelect(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === emails.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(emails.map((e) => e.id)));
    }
  }

  async function bulkAction(action: "mark_read" | "mark_unread" | "star" | "unstar" | "delete") {
    if (selectedIds.size === 0) return;
    if (action === "delete" && !confirm(`Delete ${selectedIds.size} email(s)?`)) return;
    setBulkLoading(true);
    try {
      await fetch("/api/admin/emails", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), action }),
      });
      fetchEmails();
    } catch (err) {
      console.error("Bulk action error:", err);
    } finally {
      setBulkLoading(false);
    }
  }

  // Thread view
  if (selectedEmailId) {
    return (
      <ThreadView
        emailId={selectedEmailId}
        onBack={() => setSelectedEmailId(null)}
        onRefresh={fetchEmails}
      />
    );
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const allSelected = emails.length > 0 && selectedIds.size === emails.length;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant={view === "inbox" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("inbox")}
          >
            <Inbox className="mr-2 h-4 w-4" />
            Inbox
            {unreadCount > 0 && (
              <Badge variant="destructive" className="ml-2 px-1.5 py-0">
                {unreadCount}
              </Badge>
            )}
          </Button>
          <Button
            variant={view === "sent" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("sent")}
          >
            <Send className="mr-2 h-4 w-4" />
            Sent
          </Button>
          <Button
            variant={view === "starred" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("starred")}
          >
            <Star className="mr-2 h-4 w-4" />
            Starred
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {/* Auto-reply toggle */}
          <div className="flex items-center gap-2 mr-2 border-r pr-3 border-border/50">
            <Bot className="h-4 w-4 text-muted-foreground" />
            <Label htmlFor="auto-reply" className="text-xs text-muted-foreground cursor-pointer">
              Auto-reply
            </Label>
            <Switch
              id="auto-reply"
              checked={autoReplyEnabled}
              onCheckedChange={toggleAutoReply}
              disabled={autoReplyLoading}
            />
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search emails..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-64"
            />
          </div>
          <Button variant="outline" size="icon" onClick={fetchEmails} title="Refresh (R)">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button onClick={() => setComposeOpen(true)} title="Compose (C)">
            <Plus className="mr-2 h-4 w-4" />
            Compose
          </Button>
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-2">
          <span className="text-sm font-medium mr-2">
            {selectedIds.size} selected
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => bulkAction("mark_read")}
            disabled={bulkLoading}
          >
            <MailOpen className="mr-1 h-3.5 w-3.5" />
            Mark Read
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => bulkAction("mark_unread")}
            disabled={bulkLoading}
          >
            <Mail className="mr-1 h-3.5 w-3.5" />
            Unread
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => bulkAction("star")}
            disabled={bulkLoading}
          >
            <Star className="mr-1 h-3.5 w-3.5" />
            Star
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => bulkAction("delete")}
            disabled={bulkLoading}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            Delete
          </Button>
          {bulkLoading && <Loader2 className="h-4 w-4 animate-spin" />}
        </div>
      )}

      {/* Email list */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : emails.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Mail className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-lg font-medium">No emails</p>
              <p className="text-sm">
                {view === "inbox"
                  ? "Your inbox is empty"
                  : view === "sent"
                    ? "No sent emails yet"
                    : "No starred emails"}
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {/* Select all header */}
              <div className="flex items-center gap-3 px-4 py-2 bg-muted/20 border-b">
                <button onClick={toggleSelectAll} className="shrink-0">
                  {allSelected ? (
                    <CheckSquare className="h-4 w-4 text-primary" />
                  ) : (
                    <Square className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
                <span className="text-xs text-muted-foreground">
                  {allSelected ? "Deselect all" : "Select all"}
                </span>
              </div>

              {emails.map((emailItem) => (
                <div
                  key={emailItem.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedEmailId(emailItem.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedEmailId(emailItem.id);
                    }
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 cursor-pointer ${
                    !isRead(emailItem) ? "bg-muted/20" : ""
                  } ${selectedIds.has(emailItem.id) ? "bg-primary/5" : ""}`}
                >
                  {/* Checkbox */}
                  <div
                    role="checkbox"
                    aria-checked={selectedIds.has(emailItem.id)}
                    tabIndex={0}
                    onClick={(e) => toggleSelect(e, emailItem.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleSelect(e as unknown as React.MouseEvent, emailItem.id);
                      }
                    }}
                    className="shrink-0 cursor-pointer"
                  >
                    {selectedIds.has(emailItem.id) ? (
                      <CheckSquare className="h-4 w-4 text-primary" />
                    ) : (
                      <Square className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>

                  {/* Direction icon */}
                  <div className="shrink-0">
                    {emailItem.direction === "inbound" ? (
                      <ArrowDownLeft className="h-4 w-4 text-blue-400" />
                    ) : (
                      <ArrowUpRight className="h-4 w-4 text-emerald-400" />
                    )}
                  </div>

                  {/* Read indicator */}
                  <div className="shrink-0">
                    {isRead(emailItem) ? (
                      <MailOpen className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Mail className="h-4 w-4 text-primary" />
                    )}
                  </div>

                  {/* Star */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={(e) => toggleStar(e, emailItem)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleStar(e as unknown as React.MouseEvent, emailItem);
                      }
                    }}
                    className="shrink-0 hover:scale-110 transition-transform cursor-pointer"
                  >
                    <Star
                      className={`h-4 w-4 ${
                        emailItem.is_starred
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-muted-foreground"
                      }`}
                    />
                  </div>

                  {/* Sender / recipient */}
                  <span
                    className={`w-40 truncate text-sm shrink-0 ${
                      !isRead(emailItem) ? "font-semibold" : ""
                    }`}
                  >
                    {getDisplayName(emailItem)}
                  </span>

                  {/* Subject + AI summary */}
                  <div className="flex-1 min-w-0">
                    <span className={`truncate text-sm block ${!isRead(emailItem) ? "font-semibold" : ""}`}>
                      {emailItem.subject || "(No Subject)"}
                    </span>
                    {emailItem.ai_summary && (
                      <span className="truncate text-xs text-muted-foreground block">
                        {emailItem.ai_summary}
                      </span>
                    )}
                  </div>

                  {/* Badges */}
                  <div className="shrink-0 flex items-center gap-1.5">
                    {/* Auto-sent badge */}
                    {emailItem.metadata && (emailItem.metadata as Record<string, unknown>).auto_sent ? (
                      <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium bg-violet-500/10 text-violet-400 border-violet-500/20">
                        <Zap className="h-3 w-3" />
                        Auto
                      </span>
                    ) : null}
                    {/* AI category badge */}
                    <CategoryBadge category={emailItem.ai_category} />
                    {/* Status badge */}
                    <StatusBadge email={emailItem} />
                  </div>

                  {/* Date */}
                  <span className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">
                    {formatDate(emailItem.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages} ({total} emails)
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Compose modal */}
      <ComposeModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onSent={fetchEmails}
      />
    </div>
  );
}
