/**
 * Is an inbound message really from the address in its From header?
 *
 * From is trivially forged. Anything automated that answers a message (the
 * AI auto-reply) must only answer a sender that proved the address: a reply
 * to a forged From lands on a third party, which is how an inbox gets turned
 * into a relay for mail to people who never wrote to us.
 *
 * Resend's receiving servers (Amazon SES) stamp an Authentication-Results
 * header with their SPF / DKIM / DMARC verdicts. A sender can put their own
 * Authentication-Results header in a message too, so only one that starts
 * with the receiving server's authserv-id counts, and a value carrying more
 * than one DMARC verdict (two headers folded together) is refused outright.
 * Only an aligned DMARC pass proves the From address: SPF alone authenticates
 * the envelope sender, not the From a reply would go to.
 *
 * Pure, so unit tested. (Same rule as the Axleyard inbox.)
 */

export const TRUSTED_AUTHSERV_ID = "amazonses.com";

export interface SenderAuth {
  spf: string | null;
  dkim: string | null;
  dmarc: string | null;
}

export function parseAuthResults(header: string | null | undefined): SenderAuth | null {
  const value = (header || "").trim();
  if (!value) return null;
  if (!value.toLowerCase().startsWith(`${TRUSTED_AUTHSERV_ID};`)) return null;
  if ((value.match(/(?:^|[;\s])dmarc=/gi) || []).length > 1) return null;
  const pick = (key: string) => value.match(new RegExp(`(?:^|[;\\s])${key}=([a-z]+)`, "i"))?.[1]?.toLowerCase() ?? null;
  const auth = { spf: pick("spf"), dkim: pick("dkim"), dmarc: pick("dmarc") };
  return auth.spf || auth.dkim || auth.dmarc ? auth : null;
}

export function senderAuthenticated(auth: SenderAuth | null | undefined): boolean {
  return auth?.dmarc === "pass";
}
