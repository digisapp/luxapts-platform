import type {
  BulkAction,
  EmailAttachmentMeta,
  EmailDetail,
  EmailDirection,
  EmailListItem,
  EmailStatus,
  FolderCounts,
  InboxFolder,
} from "@/lib/email/admin-inbox";
import type { InboxStatus } from "@/lib/email/inbox-status";

export type {
  BulkAction,
  EmailAttachmentMeta,
  EmailDetail,
  EmailDirection,
  EmailListItem,
  EmailStatus,
  FolderCounts,
  InboxFolder,
  InboxStatus,
};

export type BadgeTone = "neutral" | "accent" | "amber" | "green" | "red" | "dark";

export const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "border-white/10 bg-white/[0.06] text-white/70",
  accent: "border-violet-500/20 bg-violet-500/10 text-violet-300",
  amber: "border-amber-500/20 bg-amber-500/10 text-amber-300",
  green: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  red: "border-red-500/20 bg-red-500/10 text-red-300",
  dark: "border-white/20 bg-white text-black",
};

export const FOLDERS: ReadonlyArray<{ value: InboxFolder; label: string }> = [
  { value: "inbox", label: "Inbox" },
  { value: "unread", label: "Unread" },
  { value: "starred", label: "Starred" },
  { value: "sent", label: "Sent" },
  { value: "spam", label: "Spam" },
];

export const AI_CATEGORY_LABELS: Record<string, { label: string; tone: BadgeTone }> = {
  tour_request: { label: "Tour", tone: "accent" },
  lease_inquiry: { label: "Lease", tone: "accent" },
  pricing_inquiry: { label: "Pricing", tone: "accent" },
  application_status: { label: "Application", tone: "amber" },
  move_in_question: { label: "Move-in", tone: "neutral" },
  maintenance_request: { label: "Maintenance", tone: "amber" },
  amenity_question: { label: "Amenities", tone: "neutral" },
  scheduling: { label: "Scheduling", tone: "neutral" },
  general_inquiry: { label: "General", tone: "neutral" },
  feedback: { label: "Feedback", tone: "neutral" },
  partnership: { label: "Partnership", tone: "amber" },
  support: { label: "Support", tone: "neutral" },
  personal: { label: "Personal", tone: "neutral" },
  spam: { label: "Spam", tone: "red" },
  other: { label: "Other", tone: "neutral" },
};

export const STATUS_LABELS: Record<EmailStatus, { label: string; tone: BadgeTone }> = {
  received: { label: "New", tone: "accent" },
  read: { label: "Read", tone: "neutral" },
  replied: { label: "Replied", tone: "green" },
  sent: { label: "Sent", tone: "neutral" },
  delivered: { label: "Delivered", tone: "green" },
  bounced: { label: "Bounced", tone: "red" },
  failed: { label: "Failed", tone: "red" },
};

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatListDate(dateStr: string) {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  const days = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (days < 7) return date.toLocaleDateString("en-US", { weekday: "short" });
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== now.getFullYear() && { year: "numeric" }),
  });
}

export function formatFullDate(dateStr: string) {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Display name for a counterpart: name if we have one, else the address. */
export function counterpart(e: Pick<EmailListItem, "direction" | "fromAddress" | "fromName" | "toAddress" | "toName">) {
  return e.direction === "inbound"
    ? { name: e.fromName || e.fromAddress, address: e.fromAddress }
    : { name: e.toName || e.toAddress, address: e.toAddress };
}

export function replySubject(subject: string) {
  return /^re:/i.test(subject) ? subject : `Re: ${subject}`;
}

export function quoteText(email: Pick<EmailDetail, "bodyText" | "bodyHtml" | "createdAt" | "fromName" | "fromAddress">) {
  const original = (email.bodyText || "").trim();
  if (!original) return undefined;
  return `--- On ${new Date(email.createdAt).toLocaleString("en-US")}, ${email.fromName || email.fromAddress} wrote: ---\n${original}`;
}
