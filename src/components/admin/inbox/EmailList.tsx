"use client";

import { Star, Paperclip, Inbox as InboxIcon, Zap, UserPlus, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { ToneBadge } from "./ToneBadge";
import type { EmailListItem, InboxFolder } from "./types";
import { AI_CATEGORY_LABELS, STATUS_LABELS, counterpart, formatListDate, outboundStatus } from "./types";

interface EmailListProps {
  emails: EmailListItem[];
  folder: InboxFolder;
  selectedId: string | null;
  onSelect: (_id: string) => void;
  onToggleStar: (_id: string) => void;
  selectedIds: Set<string>;
  onToggleSelect: (_id: string) => void;
  searching: boolean;
}

const EMPTY_COPY: Record<InboxFolder, { title: string; body: string }> = {
  inbox: { title: "Inbox is empty", body: "Mail to the Staycio reply address and new-lead alerts show up here." },
  unread: { title: "All caught up", body: "No unread mail." },
  starred: { title: "Nothing starred", body: "Star an email to keep it handy." },
  sent: { title: "Nothing sent yet", body: "Replies and new emails you send appear here." },
  spam: { title: "No spam", body: "Mail flagged as spam lands here instead of the inbox." },
};

export function EmailList({ emails, folder, selectedId, onSelect, onToggleStar, selectedIds, onToggleSelect, searching }: EmailListProps) {
  if (emails.length === 0) {
    const copy = searching ? { title: "No matches", body: "Try a different search." } : EMPTY_COPY[folder];
    return (
      <div className="flex flex-col items-center justify-center px-6 py-20 text-center text-muted-foreground">
        <InboxIcon className="mb-3 h-10 w-10 opacity-30" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground">{copy.title}</p>
        <p className="mt-1 text-xs">{copy.body}</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-white/[0.06]">
      {emails.map((email) => {
        const active = email.id === selectedId;
        const checked = selectedIds.has(email.id);
        const unread = email.direction === "inbound" && !email.isRead;
        const who = counterpart(email);
        const cat = email.aiCategory ? AI_CATEGORY_LABELS[email.aiCategory] : null;
        const st = email.direction === "outbound" ? outboundStatus(email) : { ...STATUS_LABELS[email.status], pending: false };
        const showStatus = email.direction === "outbound" ? email.status !== "sent" || st.pending || !!email.cancelledAt : email.status === "replied";
        // A held note is listed under the time it will leave, not the time it was queued.
        const when = st.pending && email.scheduledAt ? email.scheduledAt : email.createdAt;

        return (
          <li
            key={email.id}
            className={cn("relative flex items-start gap-3 px-3 py-3 transition-colors", active ? "bg-white/[0.06]" : "hover:bg-white/[0.03]")}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onToggleSelect(email.id)}
              aria-label={`Select email from ${who.name}`}
              className="mt-1.5 h-4 w-4 shrink-0 cursor-pointer rounded border-white/20 bg-transparent accent-white"
            />

            <button type="button" onClick={() => onSelect(email.id)} aria-current={active ? "true" : undefined} className="min-w-0 flex-1 text-left">
              <div className="flex items-center gap-2">
                <span className={cn("inline-block h-2 w-2 shrink-0 rounded-full", unread ? "bg-violet-400" : "bg-transparent")} aria-hidden="true" />
                <span className={cn("flex-1 truncate text-sm", unread ? "font-bold text-foreground" : "font-medium text-foreground/90")}>
                  {email.direction === "outbound" && <span className="font-normal text-muted-foreground">To: </span>}
                  {who.name}
                </span>
                <span className={cn("shrink-0 text-xs tabular-nums", st.pending ? "text-amber-300" : "text-muted-foreground")}>
                  {st.pending && <Clock className="mr-1 inline h-3 w-3 align-[-2px]" aria-label="Sends at" />}
                  {formatListDate(when)}
                </span>
              </div>
              <p className={cn("mt-0.5 truncate pl-4 text-sm", unread ? "font-semibold text-foreground" : "text-foreground/80")}>
                {email.subject || "(no subject)"}
              </p>
              <div className="mt-0.5 flex items-center gap-1.5 pl-4">
                <p className="flex-1 truncate text-xs text-muted-foreground">{email.preview}</p>
                {email.hasAttachments && <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Has attachments" />}
                {email.isTest && <ToneBadge>Test</ToneBadge>}
                {email.isLeadAlert && (
                  <ToneBadge tone="green">
                    <UserPlus className="h-3 w-3" /> Lead
                  </ToneBadge>
                )}
                {email.isAutoSent && (
                  <ToneBadge tone="accent">
                    <Zap className="h-3 w-3" /> Auto
                  </ToneBadge>
                )}
                {cat && <ToneBadge tone={cat.tone}>{cat.label}</ToneBadge>}
                {showStatus && <ToneBadge tone={st.tone}>{st.label}</ToneBadge>}
                {email.leadId && !email.isLeadAlert && <ToneBadge tone="dark">Lead</ToneBadge>}
              </div>
            </button>

            <button
              type="button"
              onClick={() => onToggleStar(email.id)}
              aria-label={email.isStarred ? "Unstar" : "Star"}
              aria-pressed={email.isStarred}
              className="mt-0.5 shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-amber-400"
            >
              <Star className={cn("h-4 w-4", email.isStarred && "fill-amber-400 text-amber-400")} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
