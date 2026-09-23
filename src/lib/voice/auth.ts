import { timingSafeEqual } from "node:crypto";

/**
 * The phone agent runs on LiveKit Cloud, outside Vercel, and calls the
 * /api/voice/* routes with a shared bearer secret. Those routes can create
 * leads and read transcripts' worth of renter PII, so an unset secret means
 * the routes are closed, never open.
 */
export function isVoiceAgentRequest(req: Request): boolean {
  const secret = process.env.VOICE_AGENT_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface CallInfo {
  /** LiveKit room name; one room per call. */
  id: string;
  /** Caller's number, E.164, when the carrier passed it. */
  caller: string | null;
  /** The Staycio number they dialed, E.164. */
  dialed: string | null;
}

const E164_RE = /^\+[1-9]\d{6,14}$/;

function e164(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let cleaned = value.replace(/[^\d+]/g, "");
  // LiveKit reports the dialed number without the plus ("13059521558").
  if (/^1\d{10}$/.test(cleaned)) cleaned = `+${cleaned}`;
  else if (/^\d{10}$/.test(cleaned)) cleaned = `+1${cleaned}`;
  return E164_RE.test(cleaned) ? cleaned : null;
}

export function parseCallInfo(raw: unknown): CallInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !r.id.trim() || r.id.length > 200) return null;
  return { id: r.id, caller: e164(r.caller), dialed: e164(r.dialed) };
}

/**
 * chat_sessions.session_key for a call. Room names carry the caller's number
 * ("call-_+13055551234_abcd"), and session keys allow only [A-Za-z0-9_-].
 */
export function callSessionKey(callId: string): string {
  return `voice_${callId.replace(/[^A-Za-z0-9_-]/g, "")}`.slice(0, 128);
}
