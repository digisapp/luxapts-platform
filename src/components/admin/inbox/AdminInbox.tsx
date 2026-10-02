"use client";

import { useState } from "react";
import {
  Bot, ChevronLeft, ChevronRight, Info, Inbox as InboxIcon, Loader2, MailOpen, Mail, Plus, RefreshCw, Search, ShieldAlert, ShieldCheck, Star, StarOff, Trash2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useAdminInbox } from "@/hooks/useAdminInbox";
import { EmailList } from "./EmailList";
import { EmailDetailView } from "./EmailDetailView";
import { ComposeModal } from "./ComposeModal";
import { InboxSetupCard } from "./InboxSetupCard";
import { FOLDERS } from "./types";

export function AdminInbox() {
  const d = useAdminInbox();
  const [showAutoReplyInfo, setShowAutoReplyInfo] = useState(false);
  const [confirmEnable, setConfirmEnable] = useState(false);

  const selectionCount = d.selectedIds.size;
  const allOnPageSelected = d.emails.length > 0 && selectionCount === d.emails.length;
  const inSpam = d.folder === "spam";
  const from = d.status?.from ?? "Staycio <hello@staycio.com>";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Email inbox</h1>
          <p className="text-sm text-muted-foreground">
            Mail to <span className="font-mono">{d.status?.inboundAddress ?? "the reply address"}</span> and every new lead lands here; replies go out as {from}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!d.autoReplyLoading && (
            <div
              className={cn(
                "flex items-stretch overflow-hidden rounded-lg border text-xs font-medium",
                d.autoReplyEnabled ? "border-violet-500/30 bg-violet-500/10 text-violet-200" : "border-white/10 bg-white/[0.03] text-muted-foreground"
              )}
            >
              <label className="flex cursor-pointer items-center gap-2 px-3 py-2">
                <Bot className="h-3.5 w-3.5" />
                <span>Auto-reply</span>
                <Switch
                  checked={d.autoReplyEnabled}
                  onCheckedChange={(v) => (v ? setConfirmEnable(true) : d.setAutoReply(false))}
                  aria-label="AI auto-reply"
                />
              </label>
              <button type="button" onClick={() => setShowAutoReplyInfo(true)} className="border-l border-inherit px-2 hover:bg-white/[0.06]" aria-label="About AI auto-reply">
                <Info className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={d.refresh} disabled={d.loading} aria-label="Refresh">
            <RefreshCw className={cn("h-4 w-4", d.loading && "animate-spin")} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button size="sm" onClick={() => d.openCompose()}>
            <Plus className="h-4 w-4" /> Compose
          </Button>
        </div>
      </div>

      {d.status && <InboxSetupCard status={d.status} loading={d.statusLoading} onRecheck={d.refreshStatus} onSendTest={d.sendTest} sendingTest={d.sendingTest} />}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Folders">
          {FOLDERS.map((f) => {
            const count = f.value === "unread" ? d.counts.unread : f.value === "starred" ? d.counts.starred : f.value === "spam" ? d.counts.spam : undefined;
            const active = d.folder === f.value;
            return (
              <button
                key={f.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => d.setFolder(f.value)}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors",
                  active ? "border-white/20 bg-white text-black" : "border-white/10 bg-white/[0.03] text-muted-foreground hover:bg-white/[0.08] hover:text-foreground"
                )}
              >
                {f.label}
                {count != null && count > 0 && (
                  <span className={cn("rounded-full px-1.5 text-[11px] tabular-nums", active ? "bg-black/10" : "bg-white/10")}>{count}</span>
                )}
              </button>
            );
          })}
        </div>
        <div className="relative lg:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input type="search" value={d.search} onChange={(e) => d.setSearch(e.target.value)} placeholder="Search subject, sender, text…" aria-label="Search emails" className="pl-9" />
        </div>
      </div>

      {d.error && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <span>{d.error}</span>
          <Button size="sm" variant="outline" onClick={d.refresh}>Retry</Button>
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="flex lg:h-[calc(100vh-21rem)] lg:min-h-[520px]">
          {/* List pane */}
          <div className={cn("w-full shrink-0 lg:w-[400px] lg:overflow-y-auto lg:border-r lg:border-white/[0.06]", d.selectedId && "hidden lg:block")}>
            <div className="sticky top-0 z-10 flex min-h-[44px] items-center gap-2 border-b border-white/[0.06] bg-background/95 px-3 py-1.5 text-xs backdrop-blur">
              <input
                type="checkbox"
                checked={allOnPageSelected}
                onChange={d.selectAllOnPage}
                disabled={d.emails.length === 0}
                aria-label="Select all on this page"
                className="h-4 w-4 cursor-pointer rounded border-white/20 bg-transparent accent-white disabled:cursor-default"
              />
              {selectionCount > 0 ? (
                <div className="flex flex-1 flex-wrap items-center gap-1">
                  <span className="mr-1 font-medium tabular-nums text-foreground">{selectionCount} selected</span>
                  {!inSpam && d.folder !== "sent" && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => d.bulk("markRead")} disabled={d.bulkActing}><MailOpen className="h-3.5 w-3.5" /> Read</Button>
                      <Button size="sm" variant="ghost" onClick={() => d.bulk("markUnread")} disabled={d.bulkActing}><Mail className="h-3.5 w-3.5" /> Unread</Button>
                    </>
                  )}
                  {d.folder === "starred" ? (
                    <Button size="sm" variant="ghost" onClick={() => d.bulk("unstar")} disabled={d.bulkActing}><StarOff className="h-3.5 w-3.5" /> Unstar</Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => d.bulk("star")} disabled={d.bulkActing}><Star className="h-3.5 w-3.5" /> Star</Button>
                  )}
                  {d.folder !== "sent" &&
                    (inSpam ? (
                      <Button size="sm" variant="ghost" onClick={() => d.bulk("notSpam")} disabled={d.bulkActing}><ShieldCheck className="h-3.5 w-3.5" /> Not spam</Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => d.bulk("spam")} disabled={d.bulkActing}><ShieldAlert className="h-3.5 w-3.5" /> Spam</Button>
                    ))}
                  <Button size="sm" variant="ghost" onClick={() => d.bulk("delete")} disabled={d.bulkActing} className="text-red-300 hover:bg-red-500/10"><Trash2 className="h-3.5 w-3.5" /> Delete</Button>
                  <button type="button" onClick={d.clearSelection} className="ml-auto rounded p-1 text-muted-foreground hover:text-foreground" aria-label="Clear selection"><X className="h-4 w-4" /></button>
                </div>
              ) : (
                <span className="tabular-nums text-muted-foreground">
                  {d.loading ? "Loading…" : `${d.total.toLocaleString()} ${d.total === 1 ? "email" : "emails"}`}
                </span>
              )}
            </div>

            {d.loading && d.emails.length === 0 ? (
              <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <>
                <EmailList
                  emails={d.emails}
                  folder={d.folder}
                  selectedId={d.selectedId}
                  onSelect={d.selectEmail}
                  onToggleStar={d.toggleStar}
                  selectedIds={d.selectedIds}
                  onToggleSelect={d.toggleSelect}
                  searching={!!d.search.trim()}
                />
                {d.totalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-white/[0.06] px-3 py-2">
                    <Button size="sm" variant="ghost" onClick={() => d.setPage(Math.max(1, d.page - 1))} disabled={d.page <= 1} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
                    <span className="text-xs tabular-nums text-muted-foreground">Page {d.page} of {d.totalPages}</span>
                    <Button size="sm" variant="ghost" onClick={() => d.setPage(Math.min(d.totalPages, d.page + 1))} disabled={d.page >= d.totalPages} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Detail pane */}
          <div className={cn("min-w-0 flex-1", d.selectedId ? "flex" : "hidden lg:flex")}>
            {d.selectedId ? (
              <EmailDetailView
                email={d.selectedEmail}
                thread={d.thread}
                loading={d.detailLoading}
                error={d.detailError}
                sending={d.sending}
                onBack={d.closeDetail}
                onRetry={() => d.selectedId && d.selectEmail(d.selectedId)}
                onReply={() => d.openCompose(d.selectedEmail)}
                onToggleStar={d.toggleStar}
                onMarkUnread={d.markUnread}
                onSetSpam={d.setSpam}
                onDelete={(id) => d.requestDelete([id])}
                onUseAiDraft={d.useAiDraft}
                onEditAiDraft={d.editAiDraft}
              />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-muted-foreground">
                <InboxIcon className="mb-3 h-10 w-10 opacity-30" />
                <p className="text-sm font-medium text-foreground">Pick an email to read it</p>
                <p className="mt-1 text-xs">The whole conversation shows on the right.</p>
              </div>
            )}
          </div>
        </div>
      </Card>

      <ComposeModal compose={d.compose} from={from} sending={d.sending} onField={d.setComposeField} onSend={d.handleSend} onClose={d.closeCompose} onDiscard={d.discardCompose} />

      {/* Confirm delete */}
      <Dialog open={!!d.pendingDelete} onOpenChange={(v) => !v && d.cancelDelete()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{d.pendingDelete && d.pendingDelete.length > 1 ? `Delete ${d.pendingDelete.length} emails?` : "Delete this email?"}</DialogTitle>
            <DialogDescription>It is removed from this inbox for good. The copy in the other person&apos;s mailbox is not affected.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={d.cancelDelete} disabled={d.bulkActing}>Cancel</Button>
            <Button variant="destructive" onClick={d.confirmDelete} disabled={d.bulkActing}>{d.bulkActing ? "Deleting…" : "Delete"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm enabling auto-reply */}
      <Dialog open={confirmEnable} onOpenChange={(v) => !v && setConfirmEnable(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Turn on AI auto-reply?</DialogTitle>
            <DialogDescription>
              Incoming mail the AI is at least 85% sure is a tour request, lease, pricing, application, move-in, amenity, scheduling or general question gets an AI-written reply sent automatically as {from}. Everything else still waits for you. You can turn this off at any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmEnable(false)}>Not now</Button>
            <Button
              onClick={async () => {
                await d.setAutoReply(true);
                setConfirmEnable(false);
              }}
            >
              Turn it on
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* About auto-reply */}
      <Dialog open={showAutoReplyInfo} onOpenChange={setShowAutoReplyInfo}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>About AI auto-reply</DialogTitle>
            <DialogDescription>How Stacy handles incoming mail.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm leading-relaxed text-foreground/90">
            <p>
              Every incoming email is read by the AI, which writes a one-line summary and a suggested reply you can send or edit. With{" "}
              <strong className="text-foreground">Auto-reply</strong> off, nothing is sent without you.
            </p>
            <div>
              <p className="mb-1 font-semibold text-foreground">With auto-reply on, the AI answers by itself for:</p>
              <ul className="ml-4 list-disc space-y-0.5 marker:text-violet-400">
                <li>Tour requests</li>
                <li>Lease and pricing inquiries</li>
                <li>Application status and move-in questions</li>
                <li>Amenity and scheduling questions</li>
                <li>General inquiries</li>
              </ul>
              <p className="mt-1.5 text-xs text-muted-foreground">Only when it is at least 85% confident, never twice in 24 hours on one thread, and never to automated senders.</p>
            </div>
            <div>
              <p className="mb-1 font-semibold text-foreground">Always waits for you:</p>
              <ul className="ml-4 list-disc space-y-0.5 marker:text-amber-400">
                <li>Maintenance requests</li>
                <li>Partnerships and vendor outreach</li>
                <li>Support, feedback and personal mail</li>
                <li>Spam and anything unclear</li>
              </ul>
            </div>
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">Auto-replies are real emails to real people, sent as {from}.</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
