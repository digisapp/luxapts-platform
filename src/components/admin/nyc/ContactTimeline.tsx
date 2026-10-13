"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Home,
  Mail,
  Merge,
  MessageCircle,
  MessageSquare,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  StickyNote,
  Trash2,
} from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";
import { CRM_TIME_ZONE } from "@/lib/crm/dates";
import { stageMeta } from "@/lib/crm/stages";
import type { ActivityKind, CrmActivity } from "@/lib/crm/types";
import { callSummary, safeHttpUrl } from "./nyc-format";

const when = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: CRM_TIME_ZONE,
});

/** Twilio delivery states worth showing on a sent text. */
const DELIVERY: Record<string, { label: string; className: string } | undefined> = {
  queued: { label: "Sending", className: "text-muted-foreground" },
  sent: { label: "Sent", className: "text-muted-foreground" },
  delivered: { label: "Delivered", className: "text-emerald-300" },
  undelivered: { label: "Not delivered", className: "text-red-300" },
  failed: { label: "Failed", className: "text-red-300" },
};

const FILTERS: { key: "all" | ActivityKind; label: string }[] = [
  { key: "all", label: "Everything" },
  { key: "text", label: "Texts" },
  { key: "call", label: "Calls" },
  { key: "note", label: "Notes" },
];

interface ContactTimelineProps {
  activities: CrmActivity[];
  firstName: string;
  onDeleteNote: (id: string) => void;
  /** Records merged into this contact, by id, to label their history. */
  mergedNames?: Record<string, string>;
  onUndoMerge?: (mergeId: string) => void;
}

export function ContactTimeline({ activities, firstName, onDeleteNote, mergedNames = {}, onUndoMerge }: ContactTimelineProps) {
  const [filter, setFilter] = useState<"all" | ActivityKind>("all");
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const a of activities) c[a.kind] = (c[a.kind] ?? 0) + 1;
    return c;
  }, [activities]);
  const shown = filter === "all" ? activities : activities.filter((a) => a.kind === filter);

  return (
    <section aria-label="Timeline" className="rounded-xl border border-white/[0.08] bg-white/[0.02]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-3 sm:px-5">
        <h2 className="text-sm font-semibold">Timeline</h2>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Show">
          {FILTERS.filter((f) => f.key === "all" || counts[f.key]).map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "h-8 rounded-md px-2.5 text-xs font-medium transition-colors",
                filter === f.key ? "bg-white/[0.1] text-foreground" : "text-muted-foreground hover:bg-white/[0.05]"
              )}
            >
              {f.label}
              {f.key !== "all" && <span className="ml-1 tabular-nums opacity-70">{counts[f.key]}</span>}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">Nothing here yet.</p>
      ) : (
        <ol className="divide-y divide-white/[0.05]">
          {shown.map((a) => (
            <TimelineItem
              key={a.id}
              activity={a}
              firstName={firstName}
              onDeleteNote={onDeleteNote}
              fromRecord={mergedNames[a.contact_id]}
              onUndoMerge={onUndoMerge}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function TimelineItem({
  activity: a,
  firstName,
  onDeleteNote,
  fromRecord,
  onUndoMerge,
}: {
  activity: CrmActivity;
  firstName: string;
  onDeleteNote: (id: string) => void;
  /** Set when this entry belongs to a record merged into the contact. */
  fromRecord?: string;
  onUndoMerge?: (mergeId: string) => void;
}) {
  const mergeId = typeof a.meta.merge_id === "string" ? a.meta.merge_id : null;
  const inbound = a.direction === "inbound";
  const actor = a.actor || (inbound ? firstName : "You");
  let Icon = StickyNote;
  let tone = "bg-white/[0.06] text-white/70";
  let title: React.ReactNode;

  switch (a.kind) {
    case "inquiry": {
      Icon = Home;
      tone = "bg-emerald-400/10 text-emerald-300";
      const m = a.meta as { address?: string; price?: number; beds?: number; source?: string };
      const details = [m.address, m.price ? formatPrice(m.price) : null, m.beds === undefined ? null : m.beds === 0 ? "Studio" : `${m.beds} bd`]
        .filter(Boolean)
        .join(" · ");
      title = (
        <>
          Inquired{m.source ? ` via ${m.source}` : ""}
          {details && <span className="text-muted-foreground"> about {details}</span>}
        </>
      );
      break;
    }
    case "text": {
      Icon = MessageSquare;
      tone = inbound ? "bg-sky-400/15 text-sky-300" : "bg-white/[0.06] text-white/70";
      const status = typeof a.meta.status === "string" ? DELIVERY[a.meta.status] : undefined;
      title = (
        <>
          {inbound ? `${actor} replied` : `${actor} texted`}
          {status && <span className={status.className}> · {status.label}</span>}
        </>
      );
      break;
    }
    case "whatsapp":
      Icon = MessageCircle;
      tone = "bg-emerald-400/10 text-emerald-300";
      title = inbound ? `${actor} on WhatsApp` : `${actor} sent a WhatsApp`;
      break;
    case "email":
      Icon = Mail;
      tone = inbound ? "bg-sky-400/15 text-sky-300" : "bg-amber-400/10 text-amber-300";
      title = inbound ? `${actor} emailed` : `${actor} sent an email`;
      break;
    case "call": {
      // They called and nobody picked up: worth a call back, so it stands out.
      const missed = inbound && a.outcome === "no_answer";
      Icon = missed ? PhoneMissed : inbound ? PhoneIncoming : PhoneOutgoing;
      tone = missed
        ? "bg-red-500/15 text-red-300"
        : inbound
          ? "bg-sky-400/15 text-sky-300"
          : a.outcome === "talked"
            ? "bg-emerald-400/10 text-emerald-300"
            : "bg-white/[0.06] text-white/70";
      const summary = missed ? callSummary(null, a.meta.duration_sec) : callSummary(a.outcome, a.meta.duration_sec);
      title = (
        <>
          {missed ? `Missed call from ${actor}` : `${actor} called`}
          {summary && <span className="text-muted-foreground"> · {summary}</span>}
        </>
      );
      break;
    }
    case "stage": {
      Icon = ArrowRight;
      tone = "bg-violet-400/10 text-violet-300";
      const from = typeof a.meta.from === "string" ? stageMeta(a.meta.from).label : null;
      title = (
        <>
          {actor} moved to <span className="font-semibold">{stageMeta(a.body ?? "").label}</span>
          {from && <span className="text-muted-foreground"> from {from}</span>}
        </>
      );
      break;
    }
    case "task":
      Icon = CheckCircle2;
      tone = "bg-emerald-400/10 text-emerald-300";
      title = (
        <>
          {actor} completed <span className="font-semibold">{a.body}</span>
        </>
      );
      break;
    default:
      if (mergeId) {
        Icon = Merge;
        tone = "bg-sky-400/15 text-sky-300";
        title = (
          <>
            {a.body}
            {onUndoMerge && (
              <button type="button" onClick={() => onUndoMerge(mergeId)} className="ml-2 text-xs font-medium text-sky-300 hover:text-sky-200">
                Undo merge
              </button>
            )}
          </>
        );
      } else {
        title = `${actor} wrote a note`;
      }
  }

  const showBody = a.body && a.kind !== "stage" && a.kind !== "task" && !mergeId;
  const link = a.kind === "inquiry" && typeof a.meta.link === "string" ? safeHttpUrl(a.meta.link) : null;

  return (
    <li className="group flex gap-3 px-4 py-3.5 sm:px-5">
      <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full", tone)} aria-hidden="true">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <p className="min-w-0 text-sm">{title}</p>
          <span className="flex items-center gap-2">
            {fromRecord && (
              <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-muted-foreground" title="From a record merged into this contact">
                {fromRecord}&apos;s record
              </span>
            )}
            <time dateTime={a.occurred_at} className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
              {when.format(new Date(a.occurred_at))}
            </time>
            {a.kind === "note" && !a.import_key && (
              <button
                type="button"
                onClick={() => onDeleteNote(a.id)}
                className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-red-300 focus-visible:opacity-100 group-hover:opacity-100"
                aria-label="Delete note"
                title="Delete note"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
        </div>
        {showBody && (
          <p
            className={cn(
              "mt-1.5 whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm",
              inbound ? "bg-sky-400/[0.08] text-sky-50" : "bg-white/[0.03] text-foreground/90"
            )}
          >
            {a.body}
          </p>
        )}
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-sky-300 hover:text-sky-200"
          >
            Open the listing
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        )}
      </div>
    </li>
  );
}
