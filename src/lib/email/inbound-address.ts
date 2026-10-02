/**
 * Admin-inbox addressing helpers. Pure (no DB, no network) so they are unit
 * testable and shared by the Resend webhook, the manual send path and the
 * AI auto-reply.
 *
 * Threading model
 * ---------------
 * Every outbound admin email sets Reply-To to a per-thread plus-address,
 * `<replies>+<threadId>@<inbound domain>`. Resend delivers mail for ANY local
 * part on a receiving domain, so a reply comes back already tagged with the
 * thread it belongs to. That is exact, independent of whether the
 * recipient's mail client preserves In-Reply-To (we never learn our own
 * outbound Message-ID from Resend), and needs no subject matching.
 *
 * Which domain receives
 * ---------------------
 * `REPLY_TO_EMAIL` names the mailbox (default replies@inbound.staycio.com).
 * Its domain is the one that needs Resend receiving + an MX record. Mail for
 * staycio.com itself or any *.staycio.com subdomain is also treated as ours,
 * so the apex can be pointed at Resend later without a code change. Replies
 * must never go to FROM_EMAIL: staycio.com has no MX record, so they bounce.
 *
 * Resend webhooks are account-wide: every receiving domain on the account
 * (Digis, EXA, Mayells, Cannes Swim Week…) fires `email.received` at every
 * endpoint. The webhook keeps only mail with at least one recipient on our
 * domains.
 */

export const DEFAULT_INBOUND_ADDRESS = "replies@inbound.staycio.com";
export const PRIMARY_DOMAIN = "staycio.com";

/** Who admin replies go out as. The address people see on staycio.com pages. */
export const DEFAULT_ADMIN_FROM_ADDRESS = "hello@staycio.com";
export const ADMIN_FROM_NAME = "Staycio";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

function cleanEnv(name: string): string {
  return (process.env[name] || "").trim().replace(/^['"]|['"]$/g, "");
}

/** The bare receiving mailbox (`REPLY_TO_EMAIL` override, defaults to the inbound subdomain). */
export function getInboundAddress(): string {
  const { email } = parseEmailAddress(cleanEnv("REPLY_TO_EMAIL"));
  return isValidEmail(email) ? email : DEFAULT_INBOUND_ADDRESS;
}

/** Domain part of the inbound address — the domain that must receive in Resend. */
export function getInboundDomain(inboundAddress: string = getInboundAddress()): string {
  return inboundAddress.slice(inboundAddress.lastIndexOf("@") + 1).toLowerCase();
}

/** Bare sender address for admin replies (`FROM_EMAIL`). */
export function getAdminFromAddress(): string {
  const { email } = parseEmailAddress(cleanEnv("FROM_EMAIL"));
  return isValidEmail(email) ? email : DEFAULT_ADMIN_FROM_ADDRESS;
}

/** `Staycio <hello@staycio.com>` — the From header on admin replies. */
export function getAdminFrom(): string {
  const { name, email } = parseEmailAddress(cleanEnv("FROM_EMAIL"));
  return `${name || ADMIN_FROM_NAME} <${isValidEmail(email) ? email : DEFAULT_ADMIN_FROM_ADDRESS}>`;
}

/** Display name part of the admin From (`Staycio`). */
export function getAdminFromName(): string {
  const { name } = parseEmailAddress(cleanEnv("FROM_EMAIL"));
  return name || ADMIN_FROM_NAME;
}

export function isValidEmail(value: string | null | undefined): value is string {
  return !!value && value.length <= 254 && EMAIL_RE.test(value);
}

/** `replies@x` + thread `t` → `replies+t@x`. Falls back to the bare address for a non-UUID. */
export function threadReplyAddress(threadId: string, inboundAddress: string = getInboundAddress()): string {
  const at = inboundAddress.lastIndexOf("@");
  if (at < 0 || !UUID_RE.test(threadId)) return inboundAddress;
  return `${inboundAddress.slice(0, at)}+${threadId.toLowerCase()}@${inboundAddress.slice(at + 1)}`;
}

/** Bare address (+ display name) from `"Name" <a@b>`, `Name <a@b>`, `<a@b>` or `a@b`. */
export function parseEmailAddress(raw: string | null | undefined): { name: string | null; email: string } {
  const s = decodeEncodedWords((raw || "").trim());
  const m = s.match(/^"?([^"<]*?)"?\s*<([^<>\s]+@[^<>\s]+)>$/);
  if (m) return { name: m[1].trim() || null, email: m[2].trim().toLowerCase() };
  return { name: null, email: s.replace(/^<|>$/g, "").trim().toLowerCase() };
}

/**
 * RFC 2047 encoded words (`=?UTF-8?B?...?=`), how non-ASCII names like
 * "José" arrive in raw headers. Adjacent encoded words join without the
 * whitespace between them. Anything undecodable is left as-is.
 */
export function decodeEncodedWords(value: string): string {
  if (!value.includes("=?")) return value;
  return value
    .replace(/\?=\s+=\?/g, "?==?")
    .replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (whole, charset: string, enc: string, text: string) => {
      try {
        const bytes =
          enc.toUpperCase() === "B"
            ? Buffer.from(text, "base64")
            : Buffer.from(
                text
                  .replace(/_/g, " ")
                  .replace(/=([0-9A-Fa-f]{2})/g, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16))),
                "latin1"
              );
        return new TextDecoder(charset).decode(bytes);
      } catch {
        return whole;
      }
    });
}

/**
 * Display name of an inbound sender. On a fetched Resend email `from` is the
 * bare address; the name only survives in the raw From header. Null when
 * there is none (callers fall back to the address).
 */
export function senderDisplayName(fromHeader: unknown, fallbackFrom?: string | null): string | null {
  const candidates = [typeof fromHeader === "string" ? fromHeader : "", fallbackFrom || ""];
  for (const raw of candidates) {
    const { name } = parseEmailAddress(raw);
    const clean = (name || "").replace(/["<>\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
    if (clean) return clean;
  }
  return null;
}

/** Our receiving domains: the inbound address's domain, staycio.com, and any *.staycio.com. */
export function isOurInboundAddress(raw: string | null | undefined, inboundAddress: string = getInboundAddress()): boolean {
  const { email } = parseEmailAddress(raw);
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.slice(at + 1);
  return domain === getInboundDomain(inboundAddress) || domain === PRIMARY_DOMAIN || domain.endsWith(`.${PRIMARY_DOMAIN}`);
}

/**
 * The first recipient that is ours, or null when the mail was for another
 * project's domain on the same Resend account. Checks Resend's
 * `received_for` (envelope recipients — catches BCC) plus To/Cc/Bcc.
 */
export function findOurRecipient(
  addresses: Array<string | null | undefined>,
  inboundAddress: string = getInboundAddress()
): string | null {
  for (const raw of addresses) {
    if (isOurInboundAddress(raw, inboundAddress)) return parseEmailAddress(raw).email;
  }
  return null;
}

/**
 * Find our thread tag in any recipient address of an inbound mail (To, Cc,
 * and Resend's `received_for` for forwarded mail). Returns null when no
 * address is `<ourLocal>+<uuid>@<ourDomain>`.
 */
export function parseThreadIdFromAddresses(
  addresses: Array<string | null | undefined>,
  inboundAddress: string = getInboundAddress()
): string | null {
  const at = inboundAddress.lastIndexOf("@");
  if (at < 0) return null;
  const ourLocal = inboundAddress.slice(0, at).toLowerCase();
  const ourDomain = inboundAddress.slice(at + 1).toLowerCase();

  for (const raw of addresses) {
    const { email } = parseEmailAddress(raw);
    const i = email.lastIndexOf("@");
    if (i < 0 || email.slice(i + 1) !== ourDomain) continue;
    const local = email.slice(0, i);
    const plus = local.indexOf("+");
    if (plus < 0 || local.slice(0, plus) !== ourLocal) continue;
    const tag = local.slice(plus + 1);
    if (UUID_RE.test(tag)) return tag.toLowerCase();
  }
  return null;
}

/** Which of the recipient addresses is ours (prefer our domain, else the first). */
export function pickInboundRecipient(
  addresses: Array<string | null | undefined>,
  inboundAddress: string = getInboundAddress()
): string {
  const domain = inboundAddress.slice(inboundAddress.lastIndexOf("@") + 1).toLowerCase();
  const emails = addresses.map((a) => parseEmailAddress(a).email).filter((e) => e.includes("@"));
  return emails.find((e) => e.endsWith(`@${domain}`)) || emails[0] || inboundAddress;
}
