// Pure display helpers for the admin leads list. No React, so they are unit
// tested directly (lead-format.test.ts).

import { formatPrice } from "@/lib/utils";
import { MICROSITE_BUILDINGS } from "@/lib/microsites";

export const STATUS_META: Record<
  string,
  { label: string; dot: string; pill: string; bar: string; text: string }
> = {
  new: {
    label: "New",
    dot: "bg-emerald-400",
    pill: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
    bar: "bg-emerald-400",
    text: "text-emerald-300",
  },
  contacted: {
    label: "Contacted",
    dot: "bg-sky-400",
    pill: "border-sky-400/25 bg-sky-400/10 text-sky-200",
    bar: "bg-sky-400",
    text: "text-sky-300",
  },
  touring: {
    label: "Touring",
    dot: "bg-violet-400",
    pill: "border-violet-400/25 bg-violet-400/10 text-violet-200",
    bar: "bg-violet-400",
    text: "text-violet-300",
  },
  applied: {
    label: "Applied",
    dot: "bg-amber-400",
    pill: "border-amber-400/25 bg-amber-400/10 text-amber-200",
    bar: "bg-amber-400",
    text: "text-amber-300",
  },
  leased: {
    label: "Leased",
    dot: "bg-teal-300",
    pill: "border-teal-300/25 bg-teal-300/10 text-teal-100",
    bar: "bg-teal-300",
    text: "text-teal-200",
  },
  lost: {
    label: "Lost",
    dot: "bg-zinc-500",
    pill: "border-white/10 bg-white/[0.04] text-zinc-400",
    bar: "bg-zinc-600",
    text: "text-zinc-400",
  },
};

export const STATUS_ORDER = ["new", "contacted", "touring", "applied", "leased", "lost"] as const;

export function statusMeta(status: string) {
  return STATUS_META[status] ?? STATUS_META.new;
}

const SOURCE_LABELS: Record<string, string> = {
  web_form: "Web form",
  chat: "Chat",
  voice: "Phone call",
  microsite: "Microsite",
};

/** Microsite leads name the building they asked about, not just "Microsite". */
export function sourceLabel(source: string, sourceDetail?: string | null): string {
  if (sourceDetail) return MICROSITE_BUILDINGS[sourceDetail] ?? sourceDetail;
  return SOURCE_LABELS[source] ?? source;
}

export function budgetLabel(min: number | null, max: number | null): string | null {
  if (min && max) return `${formatPrice(min)}–${formatPrice(max)}`;
  if (max) return `Up to ${formatPrice(max)}`;
  if (min) return `${formatPrice(min)}+`;
  return null;
}

export function bedsLabel(beds: number | null | undefined): string | null {
  if (beds === null || beds === undefined) return null;
  return beds === 0 ? "Studio" : `${beds} bed`;
}

export function moveInLabel(date: string | null, now: Date = new Date()): string | null {
  if (!date) return null;
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  if (isNaN(d.getTime())) return null;
  const sameYear = d.getUTCFullYear() === now.getUTCFullYear();
  return `Move-in ${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  }).format(d)}`;
}

/**
 * How long ago something happened. Reply speed decides most rentals, so the
 * first week reads as an age ("3h ago") rather than a date.
 */
export function ageLabel(iso: string, now: number): string {
  const d = new Date(iso);
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

/** Compact duration for "oldest waiting 6d". */
export function durationLabel(iso: string, now: number): string {
  const hours = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 3_600_000));
  if (hours < 1) return "under an hour";
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function fullTimestamp(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(iso)
  );
}

export type DayGroup = "Today" | "Yesterday" | "This week" | "Earlier";

/** Calendar-day buckets in the viewer's own timezone. */
export function dayGroup(iso: string, now: number): DayGroup {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const t = new Date(iso).getTime();
  const today = startOfToday.getTime();
  if (t >= today) return "Today";
  if (t >= today - 86_400_000) return "Yesterday";
  if (t >= today - 6 * 86_400_000) return "This week";
  return "Earlier";
}

export function initials(name: string | null, email: string | null): string {
  const source = (name || "").replace(/[^\p{L}\p{N}\s&]/gu, " ").trim();
  if (source) {
    const words = source.split(/\s+/).filter((w) => w !== "&");
    const first = words[0]?.[0] ?? "";
    const last = words.length > 1 ? words[words.length - 1][0] : "";
    return (first + last).toUpperCase();
  }
  if (email) return email[0].toUpperCase();
  return "?";
}

// Static strings so Tailwind generates every class.
const AVATAR_TONES = [
  "bg-sky-400/15 text-sky-200 ring-sky-400/25",
  "bg-violet-400/15 text-violet-200 ring-violet-400/25",
  "bg-amber-400/15 text-amber-200 ring-amber-400/25",
  "bg-rose-400/15 text-rose-200 ring-rose-400/25",
  "bg-emerald-400/15 text-emerald-200 ring-emerald-400/25",
  "bg-cyan-400/15 text-cyan-200 ring-cyan-400/25",
  "bg-fuchsia-400/15 text-fuchsia-200 ring-fuchsia-400/25",
  "bg-orange-400/15 text-orange-200 ring-orange-400/25",
];

/** Same person, same colour, on every visit. */
export function avatarTone(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_TONES[Math.abs(h) % AVATAR_TONES.length];
}
