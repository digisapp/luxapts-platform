"use client";

import { Fragment } from "react";
import Link from "next/link";
import { cn, telHref, whatsappHref } from "@/lib/utils";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Globe,
  MessageCircle,
  MessageSquare,
  Phone,
  PhoneCall,
  Send,
} from "lucide-react";
import { PopoverMenu } from "./PopoverMenu";
import {
  STATUS_ORDER,
  STATUS_META,
  ageLabel,
  avatarTone,
  bedsLabel,
  budgetLabel,
  fullTimestamp,
  initials,
  moveInLabel,
  sourceLabel,
  statusMeta,
} from "./lead-format";

export interface LeadRowData {
  id: string;
  created_at: string;
  status: string;
  name: string | null;
  user_email: string | null;
  user_phone: string | null;
  budget_min: number | null;
  budget_max: number | null;
  beds: number | null;
  move_in_date: string | null;
  source: string;
  /** Originating microsite domain, when the lead came from one. */
  source_detail?: string | null;
  notes: string | null;
  cities: { name: string; slug: string } | { name: string; slug: string }[] | null;
}

const SOURCE_ICONS: Record<string, typeof Globe> = {
  microsite: Globe,
  web_form: FileText,
  chat: MessageCircle,
  voice: Phone,
};

/** Column template, shared with the list's loading skeleton. */
export const LEAD_GRID =
  "grid grid-cols-[1.25rem_2.25rem_minmax(0,1fr)] gap-x-3 lg:grid-cols-[1.25rem_2.25rem_minmax(0,1fr)_8.75rem_10rem_5.5rem] lg:items-center lg:gap-x-4";

const iconButton =
  "relative z-10 inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 lg:h-8 lg:w-8";

interface LeadRowProps {
  lead: LeadRowData;
  selected: boolean;
  /**
   * Shared clock so every row ages alike. Null until mount: the server runs in
   * UTC and a different second, so ages rendered there would not hydrate.
   */
  now: number | null;
  onSelect: (id: string, checked: boolean) => void;
  onStatusChange: (id: string, status: string) => void;
  onEmail: (lead: LeadRowData) => void;
}

export function LeadRow({ lead, selected, now, onSelect, onStatusChange, onEmail }: LeadRowProps) {
  const city = Array.isArray(lead.cities) ? lead.cities[0] : lead.cities;
  const displayName = lead.name || lead.user_email || "Unnamed lead";
  // Without a name the email is already the title; don't repeat it below.
  const showEmail = !!lead.user_email && !!lead.name;
  const noContact = !lead.user_email && !lead.user_phone;
  const status = statusMeta(lead.status);
  const SourceIcon = SOURCE_ICONS[lead.source] ?? Globe;
  // A lead still "new" a day after it arrived has not been answered.
  const waiting =
    now !== null && lead.status === "new" && now - new Date(lead.created_at).getTime() > 86_400_000;

  const details = [
    city?.name,
    bedsLabel(lead.beds),
    budgetLabel(lead.budget_min, lead.budget_max),
    moveInLabel(lead.move_in_date),
  ].filter(Boolean) as string[];

  const age =
    now === null ? null : (
      <time
        dateTime={lead.created_at}
        title={`${fullTimestamp(lead.created_at)}${waiting ? " · not contacted yet" : ""}`}
        className={cn(
          "whitespace-nowrap text-xs tabular-nums",
          waiting ? "font-medium text-amber-300" : "text-muted-foreground"
        )}
      >
        {ageLabel(lead.created_at, now)}
      </time>
    );

  return (
    <li
      className={cn(
        LEAD_GRID,
        "group relative px-4 py-3.5 transition-colors sm:px-5",
        selected ? "bg-sky-400/[0.06]" : "hover:bg-white/[0.025]",
        "has-[a[data-row-link]:focus-visible]:bg-white/[0.04]"
      )}
    >
      {selected && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-sky-400" />}

      {/* The label's padding is a 40px tap target around the 16px box; the
          negative margin cancels it so the layout is unchanged. */}
      <label className="relative z-10 -m-3 flex cursor-pointer items-center justify-center self-start p-3 pt-[1.375rem] lg:self-center lg:pt-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelect(lead.id, e.target.checked)}
          aria-label={`Select ${displayName}`}
          className="h-4 w-4 cursor-pointer rounded border-white/20 bg-transparent accent-white"
        />
      </label>

      <div className="relative self-start lg:self-center" aria-hidden="true">
        <div
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold ring-1",
            avatarTone(lead.user_email || lead.name || lead.id)
          )}
        >
          {initials(lead.name, lead.user_email)}
        </div>
        {waiting && (
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-[#0a0a0a]" />
        )}
      </div>

      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          {/* Stretched link: the whole row opens the lead, while the
              checkbox, status menu and contact buttons sit above it (z-10). */}
          <Link
            href={`/admin/leads/${lead.id}`}
            data-row-link
            className="min-w-0 truncate text-sm font-semibold text-foreground after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:underline focus-visible:outline-none"
          >
            {displayName}
          </Link>
          {/* Small screens: age beside the name; lg shows it in its column. */}
          <span className="shrink-0 lg:hidden">{age}</span>
        </div>

        {(showEmail || lead.user_phone || noContact) && (
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-muted-foreground lg:flex-nowrap">
            {showEmail && (
              <span className="min-w-0 max-w-full truncate" title={lead.user_email ?? undefined}>
                {lead.user_email}
              </span>
            )}
            {lead.user_phone && (
              <span className="shrink-0 whitespace-nowrap tabular-nums">{lead.user_phone}</span>
            )}
            {noContact && <span>No contact details</span>}
          </div>
        )}

        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-0.5 font-medium text-foreground/85">
            <SourceIcon className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
            {sourceLabel(lead.source, lead.source_detail)}
          </span>
          {/* Lines break only between items, with the dot ending its line,
              so "Move-in Nov 1" never splits. */}
          {details.length > 0 && (
            <span>
              {details.map((d, i) => (
                <Fragment key={i}>
                  <span className="whitespace-nowrap">
                    {d}
                    {i < details.length - 1 && " ·"}
                  </span>{" "}
                </Fragment>
              ))}
            </span>
          )}
        </div>
      </div>

      {/* Below lg this wrapper is a full-width controls line under the
          details (the text column alone is too narrow for the status pill
          plus four contact buttons on a phone); at lg it dissolves
          (display: contents) so its children fill the grid's status,
          actions and age columns. */}
      <div className="col-span-full mt-3 flex items-center justify-between gap-2 lg:contents">
        <div className="relative z-10">
          <PopoverMenu
            label={`Status for ${displayName}: ${status.label}`}
            triggerTitle="Change status"
            triggerClassName={cn(
              "inline-flex h-9 w-[8.75rem] items-center gap-2 rounded-full border pl-3 pr-2 text-xs font-medium transition-[filter] hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 lg:h-8",
              status.pill
            )}
            triggerContent={
              <>
                <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", status.dot)} aria-hidden="true" />
                <span className="flex-1 text-left">{status.label}</span>
                <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
              </>
            }
            items={STATUS_ORDER.map((key) => ({
              key,
              text: STATUS_META[key].label,
              label: STATUS_META[key].label,
              checked: key === lead.status,
              icon: (
                <span className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_META[key].dot)} aria-hidden="true" />
              ),
            }))}
            onSelect={(key) => {
              if (key !== lead.status) onStatusChange(lead.id, key);
            }}
          />
        </div>

        <div className="flex items-center gap-1 lg:justify-end">
          {lead.user_phone && (
            <>
              <a href={`tel:${telHref(lead.user_phone)}`} className={iconButton} title={`Call ${lead.user_phone}`} aria-label={`Call ${lead.user_phone}`}>
                <PhoneCall className="h-4 w-4" />
              </a>
              <a href={`sms:${telHref(lead.user_phone)}`} className={iconButton} title={`Text ${lead.user_phone}`} aria-label={`Text ${lead.user_phone}`}>
                <MessageSquare className="h-4 w-4" />
              </a>
              {/* Much of Miami's renter pool is Latin American, where WhatsApp is
                  the default channel and an SMS or voicemail often goes unread. */}
              <a
                href={whatsappHref(lead.user_phone)}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(iconButton, "text-emerald-400/80 hover:text-emerald-300")}
                title={`WhatsApp ${lead.user_phone}`}
                aria-label={`WhatsApp ${lead.user_phone}`}
              >
                <MessageCircle className="h-4 w-4" />
              </a>
            </>
          )}
          {lead.user_email && (
            <button
              type="button"
              onClick={() => onEmail(lead)}
              className={iconButton}
              title={`Email ${lead.user_email}`}
              aria-label={`Email ${lead.name || lead.user_email}`}
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="hidden items-center justify-end gap-1.5 lg:flex">
          {age}
          <ChevronRight className="h-4 w-4 text-white/20 transition-colors group-hover:text-white/50" aria-hidden="true" />
        </div>
      </div>
    </li>
  );
}
