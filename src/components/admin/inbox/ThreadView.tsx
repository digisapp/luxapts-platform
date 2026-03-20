"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  Reply,
  Star,
  Trash2,
  ArrowDownLeft,
  ArrowUpRight,
  Loader2,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { ComposeModal } from "./ComposeModal";

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
  body_text: string | null;
  lead_id: string | null;
  is_read: boolean;
  is_starred: boolean;
  created_at: string;
}

interface ThreadViewProps {
  emailId: string;
  onBack: () => void;
  onRefresh: () => void;
}

function DeliveryBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const config: Record<string, { label: string; icon: React.ReactNode; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    sent: { label: "Sent", icon: <Clock className="h-3 w-3" />, variant: "secondary" },
    delivered: { label: "Delivered", icon: <CheckCircle2 className="h-3 w-3" />, variant: "default" },
    bounced: { label: "Bounced", icon: <XCircle className="h-3 w-3" />, variant: "destructive" },
    complained: { label: "Complained", icon: <XCircle className="h-3 w-3" />, variant: "destructive" },
  };
  const c = config[status] || config.sent;
  return (
    <Badge variant={c.variant} className="gap-1 text-xs">
      {c.icon}
      {c.label}
    </Badge>
  );
}

export function ThreadView({ emailId, onBack, onRefresh }: ThreadViewProps) {
  const [thread, setThread] = useState<Email[]>([]);
  const [email, setEmail] = useState<Email | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyOpen, setReplyOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Inline reply state
  const [inlineReply, setInlineReply] = useState("");
  const [inlineSending, setInlineSending] = useState(false);
  const replyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetchThread();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailId]);

  async function fetchThread() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/emails/${emailId}`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setEmail(data.email);
      setThread(data.thread);
    } catch (err) {
      console.error("Failed to load thread:", err);
    } finally {
      setLoading(false);
    }
  }

  async function toggleStar() {
    if (!email) return;
    const res = await fetch(`/api/admin/emails/${email.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_starred: !email.is_starred }),
    });
    if (res.ok) {
      setEmail({ ...email, is_starred: !email.is_starred });
      onRefresh();
    }
  }

  async function handleDelete() {
    if (!email || !confirm("Delete this email?")) return;
    setDeleting(true);
    const res = await fetch(`/api/admin/emails/${email.id}`, { method: "DELETE" });
    if (res.ok) {
      onRefresh();
      onBack();
    }
    setDeleting(false);
  }

  async function handleInlineReply() {
    if (!email || !inlineReply.trim()) return;
    setInlineSending(true);

    const replyAddress =
      email.direction === "inbound" ? email.from_email : email.to_email;

    // Get the last message in thread for quoting
    const lastMsg = thread[thread.length - 1];
    const quotedHtml = lastMsg?.body_html || "";

    let fullHtml = inlineReply.replace(/\n/g, "<br>");
    if (quotedHtml) {
      fullHtml += `
        <br><br>
        <div style="border-left: 2px solid #ccc; padding-left: 12px; margin-top: 16px; color: #666;">
          ${quotedHtml}
        </div>
      `;
    }

    try {
      const res = await fetch("/api/admin/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: replyAddress,
          subject: email.subject.startsWith("Re:")
            ? email.subject
            : `Re: ${email.subject}`,
          bodyHtml: fullHtml,
          threadId: email.thread_id,
          leadId: email.lead_id,
        }),
      });
      if (res.ok) {
        setInlineReply("");
        fetchThread();
        onRefresh();
      }
    } catch (err) {
      console.error("Inline reply failed:", err);
    } finally {
      setInlineSending(false);
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!email) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        Email not found
      </div>
    );
  }

  const replyAddress =
    email.direction === "inbound" ? email.from_email : email.to_email;
  const lastMsg = thread[thread.length - 1];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-xl font-semibold truncate">{email.subject}</h2>
          <Badge variant="outline" className="text-xs">
            {thread.length} message{thread.length !== 1 ? "s" : ""}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={toggleStar}>
            <Star
              className={`h-4 w-4 ${email.is_starred ? "fill-yellow-400 text-yellow-400" : ""}`}
            />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setReplyOpen(true);
            }}
          >
            <Reply className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDelete}
            disabled={deleting}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>

      {/* Thread messages */}
      <div className="space-y-3">
        {thread.map((msg) => (
          <div
            key={msg.id}
            className="rounded-lg border bg-card p-4 space-y-3"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2 min-w-0">
                {msg.direction === "inbound" ? (
                  <ArrowDownLeft className="h-4 w-4 shrink-0 text-blue-400" />
                ) : (
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-emerald-400" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {msg.direction === "inbound"
                      ? msg.from_name || msg.from_email
                      : `To: ${msg.to_email}`}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {msg.direction === "inbound"
                      ? msg.from_email
                      : `From: ${msg.from_email}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={msg.direction === "inbound" ? "default" : "secondary"}>
                  {msg.direction === "inbound" ? "Received" : "Sent"}
                </Badge>
                {msg.direction === "outbound" && (
                  <DeliveryBadge status={msg.delivery_status} />
                )}
                {msg.direction === "inbound" && (
                  <Badge variant="outline" className="text-xs capitalize">
                    {msg.status}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatDate(msg.created_at)}
                </span>
              </div>
            </div>

            <div
              className="prose prose-sm prose-invert max-w-none text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: msg.body_html }}
            />
          </div>
        ))}
      </div>

      {/* Inline reply */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Reply className="h-4 w-4" />
          <span>Reply to {replyAddress}</span>
        </div>
        <Textarea
          ref={replyRef}
          placeholder="Type your reply..."
          value={inlineReply}
          onChange={(e) => setInlineReply(e.target.value)}
          rows={4}
          className="resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              handleInlineReply();
            }
          }}
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Cmd+Enter to send
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReplyOpen(true)}
            >
              Full reply
            </Button>
            <Button
              size="sm"
              onClick={handleInlineReply}
              disabled={inlineSending || !inlineReply.trim()}
            >
              {inlineSending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Send
            </Button>
          </div>
        </div>
      </div>

      {/* Full reply modal (with quoted original) */}
      <ComposeModal
        open={replyOpen}
        onClose={() => setReplyOpen(false)}
        onSent={() => {
          fetchThread();
          onRefresh();
        }}
        replyTo={{
          threadId: email.thread_id,
          to: replyAddress,
          subject: email.subject,
          leadId: email.lead_id || undefined,
          quotedHtml: lastMsg?.body_html || "",
        }}
      />
    </div>
  );
}
