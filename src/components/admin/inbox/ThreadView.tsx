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
  Bot,
  Zap,
  Pencil,
  X,
  ShieldAlert,
} from "lucide-react";
import { ComposeModal } from "./ComposeModal";
import { SandboxedEmail } from "./SandboxedEmail";

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
  body_text: string | null;
  lead_id: string | null;
  is_starred: boolean;
  created_at: string;
  read_at: string | null;
  replied_at: string | null;
  ai_category: string | null;
  ai_confidence: number | null;
  ai_summary: string | null;
  ai_draft_html: string | null;
  ai_draft_text: string | null;
  metadata: Record<string, unknown> | null;
}

function DeliveryBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; icon: React.ReactNode; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    sent: { label: "Sent", icon: <Clock className="h-3 w-3" />, variant: "secondary" },
    delivered: { label: "Delivered", icon: <CheckCircle2 className="h-3 w-3" />, variant: "default" },
    bounced: { label: "Bounced", icon: <XCircle className="h-3 w-3" />, variant: "destructive" },
    failed: { label: "Failed", icon: <XCircle className="h-3 w-3" />, variant: "destructive" },
  };
  const c = config[status] || config.sent;
  return (
    <Badge variant={c.variant} className="gap-1 text-xs">
      {c.icon}
      {c.label}
    </Badge>
  );
}

export function ThreadView({ emailId, onBack, onRefresh }: {
  emailId: string;
  onBack: () => void;
  onRefresh: () => void;
}) {
  const [thread, setThread] = useState<Email[]>([]);
  const [email, setEmail] = useState<Email | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyOpen, setReplyOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Inline reply state
  const [inlineReply, setInlineReply] = useState("");
  const [inlineSending, setInlineSending] = useState(false);
  const replyRef = useRef<HTMLTextAreaElement>(null);
  // AI draft state
  const [draftDismissed, setDraftDismissed] = useState(false);
  const [composeDraftBody, setComposeDraftBody] = useState("");

  useEffect(() => {
    fetchThread();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailId]);

  async function fetchThread() {
    setLoading(true);
    setDraftDismissed(false);
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

  function useAiDraft() {
    if (!email?.ai_draft_text) return;
    setInlineReply(email.ai_draft_text);
    setDraftDismissed(true);
    replyRef.current?.focus();
  }

  function editAiDraft() {
    if (!email?.ai_draft_text) return;
    setComposeDraftBody(email.ai_draft_text);
    setReplyOpen(true);
    setDraftDismissed(true);
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
  const hasAiDraft = email.ai_draft_html && !draftDismissed && email.status !== "replied";

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
          {/* AI category + confidence */}
          {email.ai_category && (
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${CATEGORY_COLORS[email.ai_category] || CATEGORY_COLORS.other}`}>
              {email.ai_category === "spam" && <ShieldAlert className="h-3 w-3" />}
              {email.ai_category.replace(/_/g, " ")}
              {email.ai_confidence != null && (
                <span className="opacity-60 ml-0.5">
                  {Math.round(email.ai_confidence * 100)}%
                </span>
              )}
            </span>
          )}
          <Button variant="ghost" size="icon" onClick={toggleStar}>
            <Star
              className={`h-4 w-4 ${email.is_starred ? "fill-yellow-400 text-yellow-400" : ""}`}
            />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setReplyOpen(true)}>
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

      {/* AI Summary */}
      {email.ai_summary && (
        <div className="flex items-start gap-2 rounded-lg border bg-muted/20 px-4 py-3">
          <Bot className="h-4 w-4 text-violet-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-medium text-violet-400 mb-0.5">AI Summary</p>
            <p className="text-sm text-muted-foreground">{email.ai_summary}</p>
          </div>
        </div>
      )}

      {/* AI Draft suggestion */}
      {hasAiDraft && (
        <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-violet-400" />
              <span className="text-sm font-medium text-violet-400">AI Draft Reply</span>
              {email.ai_confidence != null && (
                <span className="text-xs text-muted-foreground">
                  ({Math.round(email.ai_confidence * 100)}% confidence)
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setDraftDismissed(true)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="rounded border border-border/50 bg-background/50 p-3 max-h-48 overflow-auto">
            <SandboxedEmail html={email.ai_draft_html!} />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={useAiDraft}>
              <Zap className="mr-1 h-3.5 w-3.5" />
              Use Draft
            </Button>
            <Button size="sm" variant="outline" onClick={editAiDraft}>
              <Pencil className="mr-1 h-3.5 w-3.5" />
              Edit in Composer
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDraftDismissed(true)}
            >
              Ignore
            </Button>
          </div>
        </div>
      )}

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
                {/* Auto-sent badge */}
                {msg.metadata && (msg.metadata as Record<string, unknown>).auto_sent ? (
                  <Badge variant="outline" className="gap-1 text-xs bg-violet-500/10 text-violet-400 border-violet-500/20">
                    <Zap className="h-3 w-3" />
                    Auto-sent
                  </Badge>
                ) : null}
                <Badge variant={msg.direction === "inbound" ? "default" : "secondary"}>
                  {msg.direction === "inbound" ? "Received" : "Sent"}
                </Badge>
                {msg.direction === "outbound" && (
                  <DeliveryBadge status={msg.status} />
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

            <SandboxedEmail html={msg.body_html} />
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

      {/* Full reply modal */}
      <ComposeModal
        open={replyOpen}
        onClose={() => {
          setReplyOpen(false);
          setComposeDraftBody("");
        }}
        onSent={() => {
          fetchThread();
          onRefresh();
          setComposeDraftBody("");
        }}
        replyTo={{
          threadId: email.thread_id,
          to: replyAddress,
          subject: email.subject,
          leadId: email.lead_id || undefined,
          quotedHtml: lastMsg?.body_html || "",
        }}
        defaultBody={composeDraftBody}
      />
    </div>
  );
}
