import { STACY_MAIN_LINE } from "@/lib/constants/stacy";
import { htmlToText } from "./branded";

/**
 * Pull a phone number out of a lead's email reply.
 *
 * The follow-up to email-only leads asks "What's your phone number?", so the
 * answer arrives as free text: "305-555-0142", "(786) 555 0142",
 * "+57 300 123 4567", or only in the signature. The first plausible number in
 * the sender's own words wins; the quoted original (our message) is cut off
 * first so Stacy's own number is never picked up.
 *
 * Deliberately conservative: a wrong number on a lead is worse than none.
 * US/Canada numbers are accepted with or without +1; anything else only when
 * written with a leading +.
 */

/** The message minus the quoted original. The signature is kept: numbers live there. */
export function stripQuotedHistory(text: string | null | undefined, html?: string | null): string {
  let body = (text && text.trim() ? text : html ? htmlToText(html) : "").replace(/\r\n/g, "\n");
  const cuts = [
    body.search(/^\s*On .{5,200}wrote:\s*$/m),
    body.search(/^\s*El .{5,200}escribi[oó]:\s*$/m),
    body.search(/^\s*-{2,}\s*Original Message\s*-{2,}/im),
    body.search(/^\s*From: .+\n\s*Sent: /m),
    body.search(/^\s*De: .+\n\s*Enviado: /m),
  ].filter((i) => i >= 0);
  if (cuts.length > 0) body = body.slice(0, Math.min(...cuts));
  return body
    .split("\n")
    .filter((line) => !/^\s*>/.test(line))
    .join("\n");
}

const OUR_NUMBERS = new Set([STACY_MAIN_LINE.e164.replace(/\D/g, "")]);

/** E.164 ("+13055550142") for the first plausible phone number, or null. */
export function extractPhone(text: string | null | undefined): string | null {
  const body = text ?? "";
  const candidates = body.matchAll(/(\+?\(?\d[\d\s().\-]{7,20}\d)/g);
  for (const m of candidates) {
    const raw = m[1];
    const before = body.slice(Math.max(0, (m.index ?? 0) - 1), m.index ?? 0);
    if (before === "$" || before === "#") continue; // a price or an order number
    const digits = raw.replace(/\D/g, "");
    let e164: string | null = null;
    if (raw.trim().startsWith("+")) {
      if (digits.length >= 10 && digits.length <= 15) e164 = `+${digits}`;
    } else if (digits.length === 10 && /^[2-9]\d{2}[2-9]/.test(digits)) {
      e164 = `+1${digits}`;
    } else if (digits.length === 11 && /^1[2-9]\d{2}[2-9]/.test(digits)) {
      e164 = `+${digits}`;
    }
    if (!e164) continue;
    if (/^\+?(\d)\1+$/.test(e164.replace("+", ""))) continue; // 0000000000
    if (OUR_NUMBERS.has(e164.replace(/\D/g, ""))) continue;
    return e164;
  }
  return null;
}

/** "+13055550142" -> "(305) 555-0142"; other countries keep the E.164 form. */
export function formatPhone(e164: string): string {
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}
