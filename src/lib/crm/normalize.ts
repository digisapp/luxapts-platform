// Pure value cleaning for the NYC contacts book. No I/O, so the importer
// (browser), the API routes and the tests all share it.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim().toLowerCase();
  return value && value.length <= 254 && EMAIL_RE.test(value) ? value : null;
}

/**
 * A phone as "+<country><number>". A bare 10-digit number, or 11 digits
 * starting with 1, is US/Canada. Excel's leading apostrophe ('+447...) is
 * dropped. Anything under 7 digits ("Extracted", "ext 12") is not a phone.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim().replace(/^'+/, "");
  const digits = value.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  if (value.startsWith("+")) return `+${digits}`;
  if (value.startsWith("00") && digits.length > 9) return `+${digits.slice(2)}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

/** "(212) 555-0123" for US/Canada numbers, the stored form otherwise. */
export function formatPhone(phone: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(phone);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : phone;
}

/** Order-preserving dedupe that drops nulls and empties. */
export function uniqueValues<T>(values: (T | null | undefined)[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const v of values) {
    if (v === null || v === undefined || v === "" || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

export function splitName(full: string): { first: string | null; last: string | null } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: null, last: null };
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

export function displayName(c: {
  first_name: string | null;
  last_name: string | null;
  emails?: string[];
  phones?: string[];
}): string {
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  if (name) return name;
  if (c.emails?.[0]) return c.emails[0];
  if (c.phones?.[0]) return formatPhone(c.phones[0]);
  return "Unnamed contact";
}

/** "$5,395", "5395.00", "5,000/mo" → 5395 / 5000. Null if absent or absurd. */
export function parseWholeNumber(
  raw: string | null | undefined,
  min = 0,
  max = 100_000_000
): number | null {
  const m = /\d[\d,]*(\.\d+)?/.exec((raw ?? "").replace(/\s/g, ""));
  if (!m) return null;
  const n = Math.round(Number(m[0].replace(/,/g, "")));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

/** Comma-separated tags, trimmed and deduped, each at most 60 characters. */
export function parseTags(raw: string | null | undefined): string[] {
  return uniqueValues(
    (raw ?? "")
      .split(",")
      .map((t) => t.trim().slice(0, 60))
  );
}

/**
 * Listing sites that hand renters a relay address. They stop forwarding once
 * the listing is gone, so these are not a way to reach anyone. Keep in step
 * with crm_contacts_before_write() in migration 034.
 */
export const RELAY_EMAIL_DOMAINS = ["renthop-mail.com", "email.rent.com"];

export function isRelayEmail(email: string): boolean {
  const domain = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
  return RELAY_EMAIL_DOMAINS.includes(domain);
}

/** Real addresses first, relays last, so emails[0] is the one worth using. */
export function realEmailsFirst(emails: string[]): string[] {
  return [...emails.filter((e) => !isRelayEmail(e)), ...emails.filter(isRelayEmail)];
}

/** "HELL'S KITCHEN" → "Hell's Kitchen", "FULTON/SEAPORT" → "Fulton/Seaport". */
export function titleCase(value: string): string {
  return value.toLowerCase().replace(/(^|[\s/-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** Lowercased letters only, for comparing names across records. */
export function nameKey(name: string | null | undefined): string {
  return (name ?? "").toLowerCase().replace(/[^\p{L}]/gu, "");
}
