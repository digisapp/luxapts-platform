"use client";

import { Fragment } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatPrice, telHref, whatsappHref } from "@/lib/utils";
import { MICROSITE_BUILDINGS } from "@/lib/microsites";
import { Eye, Mail, MessageCircle, MessageSquare, Phone, PhoneCall, Send } from "lucide-react";


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

// The status select carries the colour that a separate pill next to the name
// used to, so the status shows once instead of twice per row.
const statusColors: Record<string, string> = {
  new: "border-green-500/30 bg-green-500/15 text-green-300",
  contacted: "border-blue-500/30 bg-blue-500/15 text-blue-300",
  touring: "border-purple-500/30 bg-purple-500/15 text-purple-300",
  applied: "border-yellow-500/30 bg-yellow-500/15 text-yellow-300",
  leased: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
  lost: "border-white/15 bg-white/10 text-white/80",
};

const sourceLabels: Record<string, string> = {
  web_form: "Web Form",
  chat: "Chat",
  voice: "Voice",
  microsite: "Microsite",
};

/** Microsite leads name the building they asked about, not just "Microsite". */
function sourceLabel(lead: LeadRowData): string {
  if (lead.source_detail) {
    return MICROSITE_BUILDINGS[lead.source_detail] ?? lead.source_detail;
  }
  return sourceLabels[lead.source] || lead.source;
}

function budgetLabel(min: number | null, max: number | null): string | null {
  if (min && max) return `${formatPrice(min)}–${formatPrice(max)}`;
  if (max) return `Up to ${formatPrice(max)}`;
  if (min) return `${formatPrice(min)}+`;
  return null;
}

function bedsLabel(beds: number | null): string | null {
  if (beds === null || beds === undefined) return null;
  return beds === 0 ? "Studio" : `${beds} bd`;
}

function moveInLabel(date: string | null): string | null {
  if (!date) return null;
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  if (isNaN(d.getTime())) return null;
  const sameYear = d.getUTCFullYear() === new Date().getUTCFullYear();
  return `Move-in ${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  }).format(d)}`;
}

/**
 * How long ago the lead came in. Reply speed decides most rentals, so the
 * first week reads as an age ("3h ago") rather than a date.
 */
function ageLabel(createdAt: string, now: number): string {
  const d = new Date(createdAt);
  const mins = Math.floor((now - d.getTime()) / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(d);
}

function fullTimestamp(createdAt: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(createdAt));
}

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
  const displayName = lead.name || "Unnamed lead";
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
        className={`whitespace-nowrap text-xs ${waiting ? "font-medium text-amber-300" : "text-muted-foreground"}`}
      >
        {ageLabel(lead.created_at, now)}
      </time>
    );

  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border p-4 transition-colors hover:bg-muted/50 ${
        selected ? "border-white/25 bg-white/[0.04]" : ""
      }`}
    >
      {/* The label's padding is a 40x40 tap target around the 16px box; the
          negative margin cancels it so the row layout is unchanged. Pinned to
          the name line (-mt-2 centres 16px on its 24px) so it stays put when
          the controls wrap below. */}
      <label className="-m-3 -mt-2 flex shrink-0 cursor-pointer items-center justify-center self-start p-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelect(lead.id, e.target.checked)}
          aria-label={`Select ${displayName}`}
          className="h-4 w-4 cursor-pointer rounded border-white/20"
        />
      </label>

      <div className="min-w-[200px] flex-1 basis-60">
        <div className="flex items-baseline justify-between gap-3">
          <Link
            href={`/admin/leads/${lead.id}`}
            className="min-w-0 break-words font-medium hover:underline"
          >
            {displayName}
          </Link>
          {/* Small screens: age sits beside the name; lg shows it in its column. */}
          <span className="shrink-0 lg:hidden">{age}</span>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {lead.user_email && (
            <span className="flex min-w-0 items-center gap-1 break-all">
              <Mail className="h-3 w-3 shrink-0" aria-hidden="true" />
              {lead.user_email}
            </span>
          )}
          {lead.user_phone && (
            <a
              href={`tel:${telHref(lead.user_phone)}`}
              className="-my-2.5 flex items-center gap-1 whitespace-nowrap py-2.5 hover:text-foreground hover:underline"
            >
              <Phone className="h-3 w-3" aria-hidden="true" />
              {lead.user_phone}
            </a>
          )}
          {!lead.user_email && !lead.user_phone && <span>No contact details</span>}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="rounded-md border border-white/10 bg-white/[0.06] px-2 py-0.5 font-medium text-foreground">
            {sourceLabel(lead)}
          </span>
          {/* Lines break only between items, with the dot ending its line,
              so "Move-in Nov 1" never splits. */}
          {details.length > 0 && (
            <span>
              {details.map((d, i) => (
                <Fragment key={i}>
                  <span className="whitespace-nowrap">
                    {d}
                    {i < details.length - 1 && "\u00a0·"}
                  </span>{" "}
                </Fragment>
              ))}
            </span>
          )}
        </div>
      </div>

      {/* Fixed widths on lg keep every row's controls in the same columns
          whether or not the lead left a phone number. */}
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        <select
          value={lead.status}
          onChange={(e) => onStatusChange(lead.id, e.target.value)}
          aria-label={`Status for ${displayName}`}
          className={`h-10 w-32 rounded-md border px-2 text-base font-medium md:text-xs md:pointer-fine:h-8 ${statusColors[lead.status] || statusColors.new}`}
        >
          <option value="new">New</option>
          <option value="contacted">Contacted</option>
          <option value="touring">Touring</option>
          <option value="applied">Applied</option>
          <option value="leased">Leased</option>
          <option value="lost">Lost</option>
        </select>

        {/* Four 40px icon buttons plus gaps. */}
        <div className="flex items-center gap-1 lg:w-44 lg:justify-end">
          {lead.user_phone && (
            <>
              <Button size="sm" variant="ghost" asChild title={`Call ${lead.user_phone}`} aria-label={`Call ${lead.user_phone}`}>
                <a href={`tel:${telHref(lead.user_phone)}`}>
                  <PhoneCall className="h-3 w-3" />
                </a>
              </Button>
              <Button size="sm" variant="ghost" asChild title={`Text ${lead.user_phone}`} aria-label={`Text ${lead.user_phone}`}>
                <a href={`sms:${telHref(lead.user_phone)}`}>
                  <MessageSquare className="h-3 w-3" />
                </a>
              </Button>
              {/* Much of Miami's renter pool is Latin American, where WhatsApp is
                  the default channel and an SMS or voicemail often goes unread. */}
              <Button
                size="sm"
                variant="ghost"
                asChild
                title={`WhatsApp ${lead.user_phone}`}
                aria-label={`WhatsApp ${lead.user_phone}`}
                className="text-emerald-400 hover:text-emerald-300"
              >
                <a
                  href={whatsappHref(lead.user_phone)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle className="h-3 w-3" />
                </a>
              </Button>
            </>
          )}

          {lead.user_email && (
            <Button size="sm" variant="ghost" onClick={() => onEmail(lead)} title="Send email" aria-label={`Email ${lead.name || lead.user_email}`}>
              <Send className="h-3 w-3" />
            </Button>
          )}
        </div>

        <Button size="sm" variant="outline" asChild>
          <Link href={`/admin/leads/${lead.id}`} aria-label={`View ${displayName}`}>
            <Eye className="mr-1 h-3 w-3" />
            View
          </Link>
        </Button>

        <span className="hidden w-16 text-right lg:block">{age}</span>
      </div>
    </div>
  );
}
