import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(price: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

export function formatDate(date: string | Date): string {
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return "Invalid date";
    // Date-only strings (e.g. "2026-05-01") are parsed as UTC midnight,
    // so format them in UTC to avoid shifting a day in western timezones.
    const isDateOnly = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date);
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      ...(isDateOnly && { timeZone: "UTC" }),
    }).format(d);
  } catch {
    return "Invalid date";
  }
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();
}

/**
 * Escape HTML special characters to prevent XSS in emails/popups
 */
export function escapeHtml(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/**
 * Validate UUID format
 */
export function isValidUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

/**
 * Safely parse integer with bounds checking
 */
export function safeParseInt(value: string | null, defaultValue: number, min?: number, max?: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) return defaultValue;
  if (min !== undefined && parsed < min) return min;
  if (max !== undefined && parsed > max) return max;
  return parsed;
}

/**
 * Normalises a phone number for a tel: or sms: href. A dialer cannot parse
 * "(305) 555-0123", so strip to digits, keeping a leading + for international.
 * Display the original string as the link text.
 */
export function telHref(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, "");
  return cleaned.startsWith("+") ? cleaned : cleaned.replace(/\+/g, "");
}

/**
 * Builds a wa.me link. WhatsApp wants a full international number with no "+",
 * spaces or trunk prefix. A bare 10-digit entry on a Miami form is almost
 * certainly US/Canada, so assume +1 rather than producing a dead link — anyone
 * outside NANP will have typed their country code.
 */
export function whatsappHref(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const withCountry =
    !phone.trim().startsWith("+") && digits.length === 10 ? `1${digits}` : digits;
  return `https://wa.me/${withCountry}`;
}

/** Digits only — used to sanity-check a number without caring about format. */
export function phoneDigitCount(phone: string): number {
  return phone.replace(/\D/g, "").length;
}
