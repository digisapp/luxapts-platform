"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";
import { ComposeModal } from "./ComposeModal";
import { ThreadView } from "./ThreadView";

type View = "inbox" | "sent" | "starred";

const PAGE_SIZE = 30;

interface Email {
  id: string;
  thread_id: string;
  direction: "inbound" | "outbound";
  status: "received" | "read" | "replied";
  delivery_status: "sent" | "delivered" | "bounced" | "complained" | null;
  from_email: string;
  from_name: string | null;
  to_email: string;
  to_name: string | null;
  subject: string;
  body_html: string;
  lead_id: string | null;
  is_read: boolean;
  is_starred: boolean;
  created_at: string;
}

function DeliveryIcon({ status }: { status: string | null }) {
  if (!status || status === "sent") return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
  if (status === "delivered") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />;
  return <XCircle className="h-3.5 w-3.5 text-destructive" />;
}

function StatusBadge({ email }: { email: Email }) {
  if (email.direction === "outbound") {
    const s = email.delivery_status || "sent";
    const colors: Record<string, string> = {
      sent: "bg-muted text-muted-foreground",
      delivered: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      bounced: "bg-destructive/10 text-destructive border-destructive/20",
      complained: "bg-destructive/10 text-destructive border-destructive/20",
    };
    return (
      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${colors[s] || colors.sent}`}>
        <DeliveryIcon status={s} />
        {s.charAt(0).toUpperCase() + s.slice(1)}
      </span>
    );
  }
  // Inbound status
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

  const fetchEmails = useCallback(async () => {
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

      setEmails(data.emails);
      setTotal(data.total);
      setUnreadCount(data.unread);
    } catch (err) {
      console.error("Fetch emails error:", err);
    } finally {
      setLoading(false);
    }
  }, [view, search, page]);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  useEffect(() => {
    setPage(1);
  }, [view, search]);

  function formatDate(dateStr: string) {
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });
    }
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }

  function getDisplayName(email: Email) {
    if (email.direction === "inbound") {
      return email.from_name || email.from_email;
    }
    return `To: ${email.to_email}`;
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

  async function markRead(emailItem: Email) {
    if (emailItem.is_read) return;
    await fetch(`/api/admin/emails/${emailItem.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_read: true }),
    });
    setEmails((prev) =>
      prev.map((em) =>
        em.id === emailItem.id ? { ...em, is_read: true, status: em.status === "received" ? "read" : em.status } : em
      )
    );
    setUnreadCount((c) => Math.max(0, c - 1));
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
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search emails..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-64"
            />
          </div>
          <Button variant="outline" size="icon" onClick={fetchEmails}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button onClick={() => setComposeOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Compose
          </Button>
        </div>
      </div>

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
              {emails.map((emailItem) => (
                <button
                  key={emailItem.id}
                  onClick={() => {
                    markRead(emailItem);
                    setSelectedEmailId(emailItem.id);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 ${
                    !emailItem.is_read ? "bg-muted/20" : ""
                  }`}
                >
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
                    {emailItem.is_read ? (
                      <MailOpen className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Mail className="h-4 w-4 text-primary" />
                    )}
                  </div>

                  {/* Star */}
                  <button
                    onClick={(e) => toggleStar(e, emailItem)}
                    className="shrink-0 hover:scale-110 transition-transform"
                  >
                    <Star
                      className={`h-4 w-4 ${
                        emailItem.is_starred
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-muted-foreground"
                      }`}
                    />
                  </button>

                  {/* Sender / recipient */}
                  <span
                    className={`w-44 truncate text-sm shrink-0 ${
                      !emailItem.is_read ? "font-semibold" : ""
                    }`}
                  >
                    {getDisplayName(emailItem)}
                  </span>

                  {/* Subject */}
                  <span className="flex-1 truncate text-sm">
                    <span className={!emailItem.is_read ? "font-semibold" : ""}>
                      {emailItem.subject || "(No Subject)"}
                    </span>
                  </span>

                  {/* Status badge */}
                  <div className="shrink-0">
                    <StatusBadge email={emailItem} />
                  </div>

                  {/* Date */}
                  <span className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">
                    {formatDate(emailItem.created_at)}
                  </span>
                </button>
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
