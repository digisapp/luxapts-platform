"use client";

import Link from "next/link";
import { Building2, ExternalLink, MessageSquare, Phone, PhoneOff } from "lucide-react";
import type { LeadStatus } from "@/types/database";
import type { LeadContext } from "./types";

const STATUS_OPTIONS: Array<{ value: LeadStatus; label: string }> = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "touring", label: "Touring" },
  { value: "applied", label: "Applied" },
  { value: "leased", label: "Leased" },
  { value: "lost", label: "Lost" },
];

/** "+13055550142" -> "(305) 555-0142"; anything else as stored. */
function displayPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const us = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits.length === 10 ? digits : null;
  return us ? `(${us.slice(0, 3)}) ${us.slice(3, 6)}-${us.slice(6)}` : phone;
}

/** sms:/tel: want E.164; a bare US number gets +1. */
function dialable(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (phone.trim().startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits;
}

interface LeadCardProps {
  lead: LeadContext;
  onSetStatus: (_status: LeadStatus) => void;
}

/**
 * Who this conversation is with, at a glance: what they want, and one tap to
 * text or call them. The phone fills in by itself when a lead sends their
 * number by email.
 */
export function LeadCard({ lead, onSetStatus }: LeadCardProps) {
  const wants = [lead.unitType, lead.moveIn && `move-in ${lead.moveIn}`].filter(Boolean).join(" · ");
  const pill =
    "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors";

  return (
    <section aria-label="Lead" className="border-b border-white/[0.06] px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{lead.name || lead.email || "Lead"}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            {lead.building && (
              <span className="inline-flex items-center gap-1">
                <Building2 className="h-3 w-3" /> {lead.building}
              </span>
            )}
            {lead.building && wants && <span aria-hidden="true">·</span>}
            {wants && <span>{wants}</span>}
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Status
          <select
            value={lead.status}
            onChange={(e) => onSetStatus(e.target.value as LeadStatus)}
            className="h-8 rounded-md border border-white/10 bg-white/[0.04] px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-white/20"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value} className="bg-neutral-900">
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {lead.phone ? (
          <>
            <a href={`sms:${dialable(lead.phone)}`} className={`${pill} border-white/20 bg-white text-black hover:bg-white/85`}>
              <MessageSquare className="h-4 w-4" /> Text
            </a>
            <a href={`tel:${dialable(lead.phone)}`} className={`${pill} border-white/10 bg-white/[0.04] text-foreground hover:bg-white/[0.08]`}>
              <Phone className="h-4 w-4" /> Call
            </a>
            <span className="text-sm tabular-nums text-foreground/90">{displayPhone(lead.phone)}</span>
          </>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <PhoneOff className="h-3.5 w-3.5" /> No phone yet. It is saved here automatically if they send one.
          </span>
        )}
        <Link
          href={`/admin/leads/${lead.id}`}
          className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ExternalLink className="h-3 w-3" /> Lead record
        </Link>
      </div>
    </section>
  );
}
