"use client";

import Link from "next/link";
import { ArrowLeft, Reply, Star, Trash2, ShieldAlert, ShieldCheck, MailOpen, Bot, Send, PenLine, Paperclip, ExternalLink, Loader2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SandboxedEmail } from "./SandboxedEmail";
import { ToneBadge } from "./ToneBadge";
import type { EmailDetail } from "./types";
import { AI_CATEGORY_LABELS, STATUS_LABELS, formatBytes, formatFullDate } from "./types";

interface EmailDetailViewProps {
  email: EmailDetail | null;
  thread: EmailDetail[];
  loading: boolean;
  error: string | null;
  sending: boolean;
  onBack: () => void;
  onRetry: () => void;
  onReply: () => void;
  onToggleStar: (_id: string) => void;
  onMarkUnread: (_id: string) => void;
  onSetSpam: (_id: string, _isSpam: boolean) => void;
  onDelete: (_id: string) => void;
  onUseAiDraft: (_id: string) => void;
  onEditAiDraft: (_email: EmailDetail) => void;
}

function Message({ msg, isLast }: { msg: EmailDetail; isLast: boolean }) {
  const outbound = msg.direction === "outbound";
  const st = STATUS_LABELS[msg.status];

  return (
    <article className={cn("px-4 py-4 sm:px-5", !isLast && "border-b border-white/[0.06]")}>
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={cn(
              "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold",
              outbound ? "bg-white text-black" : "bg-violet-500/15 text-violet-200"
            )}
          >
            {outbound ? "S" : (msg.fromName || msg.fromAddress)[0]?.toUpperCase() || "?"}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="truncate text-sm font-semibold text-foreground">{msg.fromName || msg.fromAddress}</span>
              {msg.fromName && <span className="truncate text-xs text-muted-foreground">{msg.fromAddress}</span>}
              {outbound && <ToneBadge tone={st.tone}>{st.label}</ToneBadge>}
              {msg.isAutoSent && (
                <ToneBadge tone="accent">
                  <Zap className="h-3 w-3" /> Auto-sent
                </ToneBadge>
              )}
              {msg.isTest && <ToneBadge>Test</ToneBadge>}
              {!outbound && msg.leadId && (
                <Link
                  href={`/admin/leads/${msg.leadId}`}
                  className="inline-flex items-center gap-0.5 rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-black transition-colors hover:bg-white/80"
                >
                  <ExternalLink className="h-3 w-3" /> Open lead
                </Link>
              )}
            </div>
            <p className="truncate text-xs text-muted-foreground">
              To: {msg.toName ? `${msg.toName} <${msg.toAddress}>` : msg.toAddress}
              {msg.cc.length > 0 && ` · Cc: ${msg.cc.join(", ")}`}
            </p>
          </div>
        </div>
        <time dateTime={msg.createdAt} className="shrink-0 text-xs text-muted-foreground">
          {formatFullDate(msg.createdAt)}
        </time>
      </header>

      {msg.bodyHtml ? (
        <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.02] p-2">
          <SandboxedEmail html={msg.bodyHtml} />
        </div>
      ) : (
        <div className="whitespace-pre-wrap rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 text-sm leading-relaxed text-foreground/90">
          {msg.bodyText || <span className="text-muted-foreground">(no content)</span>}
        </div>
      )}

      {msg.attachments.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {msg.attachments.map((a) => (
            <li key={a.id}>
              <a
                href={`/api/admin/inbox/${msg.id}/attachments/${a.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs text-foreground/90 transition-colors hover:bg-white/[0.08]"
              >
                <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="max-w-[220px] truncate">{a.filename}</span>
                {a.size ? <span className="text-muted-foreground">{formatBytes(a.size)}</span> : null}
              </a>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export function EmailDetailView({
  email, thread, loading, error, sending,
  onBack, onRetry, onReply, onToggleStar, onMarkUnread, onSetSpam, onDelete, onUseAiDraft, onEditAiDraft,
}: EmailDetailViewProps) {
  if (loading && !email) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error && !email) {
    return (
      <div className="flex-1 p-4">
        <button onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground lg:hidden">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <span>{error}</span>
          <Button size="sm" variant="outline" onClick={onRetry}>Retry</Button>
        </div>
      </div>
    );
  }
  if (!email) return null;

  const messages = thread.length > 0 ? thread : [email];
  const cat = email.aiCategory ? AI_CATEGORY_LABELS[email.aiCategory] : null;
  const inbound = email.direction === "inbound";
  const hasDraft = !!(email.aiDraftText && email.aiDraftHtml);
  const canUseDraft = inbound && hasDraft && email.status !== "replied";
  const iconBtn = "rounded-lg p-2 text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground";

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2.5 sm:px-4">
        <button onClick={onBack} className={cn(iconBtn, "lg:hidden")} aria-label="Back to list">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-bold text-foreground">{email.subject || "(no subject)"}</h2>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {inbound && <ToneBadge tone={STATUS_LABELS[email.status].tone}>{STATUS_LABELS[email.status].label}</ToneBadge>}
            {email.isLeadAlert && <ToneBadge tone="green">New lead</ToneBadge>}
            {cat && (
              <ToneBadge tone={cat.tone}>
                {cat.label}
                {email.aiConfidence != null && ` · ${Math.round(email.aiConfidence * 100)}%`}
              </ToneBadge>
            )}
            {email.isSpam && <ToneBadge tone="red">Spam</ToneBadge>}
            {messages.length > 1 && <span className="text-xs text-muted-foreground">{messages.length} messages</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button onClick={() => onToggleStar(email.id)} aria-label={email.isStarred ? "Unstar" : "Star"} aria-pressed={email.isStarred} className={iconBtn}>
            <Star className={cn("h-4 w-4", email.isStarred && "fill-amber-400 text-amber-400")} />
          </button>
          {inbound && (
            <button onClick={() => onMarkUnread(email.id)} aria-label="Mark as unread" title="Mark as unread" className={iconBtn}>
              <MailOpen className="h-4 w-4" />
            </button>
          )}
          {inbound && (
            <button
              onClick={() => onSetSpam(email.id, !email.isSpam)}
              aria-label={email.isSpam ? "Not spam" : "Mark as spam"}
              title={email.isSpam ? "Not spam" : "Mark as spam"}
              className={iconBtn}
            >
              {email.isSpam ? <ShieldCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
            </button>
          )}
          <button onClick={() => onDelete(email.id)} aria-label="Delete" title="Delete" className={cn(iconBtn, "hover:bg-red-500/10 hover:text-red-300")}>
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* AI summary + draft */}
        {inbound && (email.aiSummary || canUseDraft) && (
          <div className="space-y-3 border-b border-white/[0.06] bg-white/[0.02] px-4 py-3 sm:px-5">
            {email.aiSummary && (
              <div className="flex items-start gap-2 text-sm text-foreground/90">
                <Bot className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
                <p>
                  <span className="font-semibold text-foreground">Summary.</span> {email.aiSummary}
                </p>
              </div>
            )}
            {canUseDraft && (
              <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-violet-300">
                    <Bot className="h-3.5 w-3.5" /> Suggested reply
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => onEditAiDraft(email)} disabled={sending}>
                      <PenLine className="h-3.5 w-3.5" /> Edit
                    </Button>
                    <Button size="sm" onClick={() => onUseAiDraft(email.id)} disabled={sending}>
                      <Send className="h-3.5 w-3.5" /> {sending ? "Sending…" : "Send as is"}
                    </Button>
                  </div>
                </div>
                <p className="line-clamp-5 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{email.aiDraftText}</p>
              </div>
            )}
          </div>
        )}

        {messages.map((msg, i) => (
          <Message key={msg.id} msg={msg} isLast={i === messages.length - 1} />
        ))}
      </div>

      <div className="border-t border-white/[0.06] px-4 py-3 sm:px-5">
        <Button onClick={onReply} className="w-full sm:w-auto">
          <Reply className="h-4 w-4" /> Reply
        </Button>
      </div>
    </div>
  );
}
