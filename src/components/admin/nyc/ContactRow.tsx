"use client";

import Link from "next/link";
import { ChevronRight, Mail, MessageSquare, PhoneCall, Ban } from "lucide-react";
import { cn, telHref } from "@/lib/utils";
import { avatarTone, initials } from "@/components/admin/leads/lead-format";
import { displayName, formatPhone, isRelayEmail } from "@/lib/crm/normalize";
import { dueLabel } from "@/lib/crm/dates";
import type { CrmContactListRow } from "@/lib/crm/types";
import { StageMenu } from "./StageMenu";
import { inquirySummary, leaseUpSoon, TONE_TEXT, touchSummary } from "./nyc-format";

/** Column template, shared with the list's loading skeleton. */
export const CONTACT_GRID =
  "grid grid-cols-[1.25rem_2.25rem_minmax(0,1fr)] gap-x-3 lg:grid-cols-[1.25rem_2.25rem_minmax(0,1fr)_8.75rem_9.5rem_7.25rem] lg:items-center lg:gap-x-4";

const iconButton =
  "relative z-10 inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 lg:h-8 lg:w-8";

interface ContactRowProps {
  contact: CrmContactListRow;
  href: string;
  selected: boolean;
  now: number | null;
  today: string;
  stages: string[];
  onSelect: (id: string, checked: boolean) => void;
  onStageChange: (id: string, stage: string) => void;
  /**
   * Called as a call/text/email link is tapped. The link still opens the
   * phone or mail app; the list also opens the contact with "How did it
   * go?" ready, so the touch gets logged.
   */
  onReach: (id: string, kind: "call" | "text" | "email") => void;
}

export function ContactRow({
  contact: c,
  href,
  selected,
  now,
  today,
  stages,
  onSelect,
  onStageChange,
  onReach,
}: ContactRowProps) {
  const name = displayName(c);
  const phone = c.phones[0];
  const email = c.emails[0];
  const hasName = !!(c.first_name || c.last_name);
  const inquiry = inquirySummary(c);
  const touch = now === null ? null : touchSummary(c, now);
  const due = c.next_task_on ? dueLabel(c.next_task_on, today) : null;
  const overdue = !!c.next_task_on && c.next_task_on < today;
  const dueToday = c.next_task_on === today;
  const leaseSoon = leaseUpSoon(c.added_at, today);
  const dueText = !due ? null : overdue ? due : dueToday ? "Due today" : `Follow up ${due === "Tomorrow" ? "tomorrow" : due}`;

  const status = (
    <div className="flex flex-col items-start gap-0.5 text-xs lg:items-end">
      {touch && <span className={cn("whitespace-nowrap", TONE_TEXT[touch.tone])}>{touch.label}</span>}
      {leaseSoon && (
        <span
          className="whitespace-nowrap rounded-md bg-emerald-400/15 px-1.5 py-0.5 font-medium text-emerald-100"
          title="First inquired around this time of year, 10+ months ago: their lease is likely ending"
        >
          Lease up soon
        </span>
      )}
      {dueText && (
        <span
          className={cn(
            "whitespace-nowrap rounded-md px-1.5 py-0.5 font-medium",
            overdue
              ? "bg-red-500/15 text-red-200"
              : dueToday
                ? "bg-amber-400/15 text-amber-100"
                : "bg-white/[0.05] text-foreground/75"
          )}
        >
          {dueText}
        </span>
      )}
    </div>
  );

  return (
    <li
      className={cn(
        CONTACT_GRID,
        "group relative px-4 py-3.5 transition-colors sm:px-5",
        selected ? "bg-sky-400/[0.06]" : "hover:bg-white/[0.025]",
        "has-[a[data-row-link]:focus-visible]:bg-white/[0.04]"
      )}
    >
      {selected && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-sky-400" />}

      <label className="relative z-10 -m-3 flex cursor-pointer items-center justify-center self-start p-3 pt-[1.375rem] lg:self-center lg:pt-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelect(c.id, e.target.checked)}
          aria-label={`Select ${name}`}
          className="h-4 w-4 cursor-pointer rounded border-white/20 bg-transparent accent-white"
        />
      </label>

      <div
        aria-hidden="true"
        className={cn(
          "flex h-9 w-9 items-center justify-center self-start rounded-full text-xs font-semibold ring-1 lg:self-center",
          avatarTone(email || name || c.id)
        )}
      >
        {initials(hasName ? name : null, email ?? null)}
      </div>

      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <Link
            href={href}
            data-row-link
            className="min-w-0 truncate text-sm font-semibold text-foreground after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:underline focus-visible:outline-none"
          >
            {name}
          </Link>
          {c.kind !== "renter" && (
            <span
              className={cn(
                "shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                c.kind === "buyer" ? "bg-amber-400/15 text-amber-100" : "bg-white/[0.08] text-foreground/75"
              )}
            >
              {c.kind === "buyer" ? "Buyer" : "Broker"}
            </span>
          )}
          {c.do_not_contact && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-red-500/15 px-1.5 py-0.5 text-[11px] font-medium text-red-200">
              <Ban className="h-3 w-3" aria-hidden="true" />
              DNC
            </span>
          )}
        </div>

        {(phone || (email && hasName)) && (
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-muted-foreground lg:flex-nowrap">
            {phone && <span className="shrink-0 whitespace-nowrap tabular-nums">{formatPhone(phone)}</span>}
            {email && hasName && (
              <span
                className="min-w-0 max-w-full truncate"
                title={
                  c.has_real_email
                    ? email
                    : isRelayEmail(email)
                      ? `${email}: a listing-site relay, probably no longer forwarding`
                      : `${email}: bounced before`
                }
              >
                {email}
                {!c.has_real_email && <span className="text-amber-300/80"> · {isRelayEmail(email) ? "relay" : "bounced"}</span>}
              </span>
            )}
          </div>
        )}

        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {c.source && (
            <span className="rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-0.5 font-medium text-foreground/85">
              {c.source}
            </span>
          )}
          {inquiry && <span className="min-w-0 truncate">{inquiry}</span>}
          {c.tags.slice(0, 2).map((t) => (
            <span key={t} className="max-w-[12rem] truncate rounded-md bg-violet-400/10 px-1.5 py-0.5 text-violet-200/90" title={t}>
              {t}
            </span>
          ))}
          {c.tags.length > 2 && <span>+{c.tags.length - 2}</span>}
        </div>
      </div>

      {/* Below lg: a full-width controls line under the details. At lg the
          wrapper dissolves so its children fill the stage, status and
          actions columns. */}
      <div className="col-span-full mt-3 flex flex-wrap items-center justify-between gap-2 lg:contents">
        <div className="relative z-10">
          <StageMenu stage={c.stage} present={stages} who={name} onChange={(s) => onStageChange(c.id, s)} />
        </div>

        <div className="order-last basis-full lg:order-none lg:basis-auto">{status}</div>

        <div className="flex items-center gap-1 lg:justify-end">
          {phone && !c.do_not_contact && (
            <>
              <a
                href={`tel:${telHref(phone)}`}
                onClick={() => onReach(c.id, "call")}
                className={iconButton}
                title={`Call ${formatPhone(phone)}`}
                aria-label={`Call ${name}`}
              >
                <PhoneCall className="h-4 w-4" />
              </a>
              <a
                href={`sms:${telHref(phone)}`}
                onClick={() => onReach(c.id, "text")}
                className={iconButton}
                title={`Text ${formatPhone(phone)}`}
                aria-label={`Text ${name}`}
              >
                <MessageSquare className="h-4 w-4" />
              </a>
            </>
          )}
          {email && c.has_real_email && !c.do_not_contact && (
            <a
              href={`mailto:${email}`}
              onClick={() => onReach(c.id, "email")}
              className={iconButton}
              title={`Email ${email}`}
              aria-label={`Email ${name}`}
            >
              <Mail className="h-4 w-4" />
            </a>
          )}
          <ChevronRight className="hidden h-4 w-4 text-white/20 transition-colors group-hover:text-white/50 lg:block" aria-hidden="true" />
        </div>
      </div>
    </li>
  );
}
