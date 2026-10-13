// Two-way texting through Twilio, for when the brokerage's number is
// approved. Everything here is inert until TWILIO_ACCOUNT_SID,
// TWILIO_AUTH_TOKEN and TWILIO_MESSAGING_SERVICE_SID (or TWILIO_FROM_NUMBER)
// are set. Plain fetch, no SDK. Server only.

import { createHmac, timingSafeEqual } from "node:crypto";

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  /** A2P 10DLC numbers send through a Messaging Service; a bare number also works. */
  messagingServiceSid: string | null;
  from: string | null;
}

export function twilioConfig(env: Record<string, string | undefined> = process.env): TwilioConfig | null {
  const accountSid = env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = env.TWILIO_AUTH_TOKEN?.trim();
  const messagingServiceSid = env.TWILIO_MESSAGING_SERVICE_SID?.trim() || null;
  const from = env.TWILIO_FROM_NUMBER?.trim() || null;
  if (!accountSid || !authToken || (!messagingServiceSid && !from)) return null;
  return { accountSid, authToken, messagingServiceSid, from };
}

export class TwilioError extends Error {
  constructor(message: string, readonly code: number | null, readonly status: number) {
    super(message);
  }
}

/** Twilio error 21610: the recipient texted STOP; carriers will not deliver. */
export const TWILIO_OPTED_OUT = 21610;

export async function sendSms(
  config: TwilioConfig,
  to: string,
  body: string,
  statusCallback?: string
): Promise<{ sid: string; status: string }> {
  const form = new URLSearchParams({ To: to, Body: body });
  if (config.messagingServiceSid) form.set("MessagingServiceSid", config.messagingServiceSid);
  else if (config.from) form.set("From", config.from);
  if (statusCallback) form.set("StatusCallback", statusCallback);

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });
  const data = (await res.json().catch(() => ({}))) as { sid?: string; status?: string; code?: number; message?: string };
  if (!res.ok || !data.sid) {
    throw new TwilioError(data.message || `Twilio said ${res.status}`, data.code ?? null, res.status);
  }
  return { sid: data.sid, status: data.status ?? "queued" };
}

/**
 * Twilio's request signature: HMAC-SHA1 (base64) of the full URL it called
 * followed by every POST parameter, sorted by name, as name + value.
 */
export function twilioSignature(url: string, params: Record<string, string>, authToken: string): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  return createHmac("sha1", authToken).update(data, "utf8").digest("base64");
}

export function validTwilioSignature(
  urls: string[],
  params: Record<string, string>,
  signature: string | null,
  authToken: string
): boolean {
  if (!signature) return false;
  const given = Buffer.from(signature);
  return urls.some((url) => {
    const expected = Buffer.from(twilioSignature(url, params, authToken));
    return expected.length === given.length && timingSafeEqual(expected, given);
  });
}

/** Carrier opt-out and opt-in keywords, as Twilio handles them. */
const STOP_WORDS = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit", "revoke", "optout"]);
const START_WORDS = new Set(["start", "unstop", "yes"]);

export function optKeyword(body: string): "stop" | "start" | null {
  const word = body.trim().toLowerCase().replace(/[^a-z]/g, "");
  if (STOP_WORDS.has(word)) return "stop";
  if (START_WORDS.has(word)) return "start";
  return null;
}

export const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
