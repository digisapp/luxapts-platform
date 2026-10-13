// Follow Up Boss puts a person's whole history into three export columns:
//
//   Texts:  "Alex Rivera texted Dana Whitfield on 7/16/2023 11:44am\n<body>\n\n..."
//   Calls:  "Alex Rivera called Sam O on 9/15/2024 2:03pm (6 min 18 sec)\n\n..."
//   Notes:  "<body>\n-Chris Park 03/27/2025\n<body>\n-Taylor Reed 04/24/2025"
//
// These parse them back into timeline entries. Times are the account's wall
// clock, read as New York time (every agent in the export works NYC/Miami).

import { fromLocal } from "@/lib/email/send-window";
import { nameKey } from "./normalize";

export interface HistoryEntry {
  kind: "text" | "call" | "note";
  direction: "inbound" | "outbound" | null;
  outcome: "talked" | "no_answer" | "bad_number" | null;
  occurred_at: string | null;
  actor: string | null;
  body: string | null;
  meta: Record<string, string | number>;
}

const TEXT_HEADER =
  /^(.+?) texted (.+?) on (\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2})\s?([ap]m)$/i;
const CALL_HEADER =
  /^(.+?) called (.+?) on (\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2})\s?([ap]m)(?: \((.*)\))?$/i;
const NOTE_SIGNATURE = /^-\s?(.+?)\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/;

/** A talk shorter than this is more likely a voicemail greeting than a conversation. */
const TALKED_MIN_SECONDS = 45;

function localIso(
  month: string,
  day: string,
  year: string,
  hour = "12",
  minute = "00",
  meridiem?: string
): string | null {
  let h = Number(hour);
  if (meridiem) {
    const pm = meridiem.toLowerCase() === "pm";
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
  }
  const parts = { year: Number(year), month: Number(month), day: Number(day), hour: h, minute: Number(minute) };
  if (parts.month < 1 || parts.month > 12 || parts.day < 1 || parts.day > 31 || h > 23) return null;
  const d = fromLocal(parts);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Who sent it, relative to the contact. The sender named in the export is
 * the contact (inbound) or anyone else (an agent, outbound). When neither
 * side matches the contact's current name (renamed since), the agent list
 * decides: a known agent sending means outbound.
 */
function directionOf(
  sender: string,
  recipient: string,
  contactName: string,
  agentKeys: Set<string>
): "inbound" | "outbound" {
  const contact = nameKey(contactName);
  if (contact && nameKey(sender) === contact) return "inbound";
  if (contact && nameKey(recipient) === contact) return "outbound";
  return agentKeys.has(nameKey(sender)) ? "outbound" : "inbound";
}

function lines(cell: string): string[] {
  return cell.replace(/\r\n?/g, "\n").split("\n");
}

function cleanBody(bodyLines: string[]): string | null {
  const body = bodyLines.join("\n").trim();
  return body ? body.slice(0, 5000) : null;
}

export function parseTexts(cell: string, contactName: string, agentKeys: Set<string>): HistoryEntry[] {
  const out: HistoryEntry[] = [];
  let current: { header: RegExpExecArray; body: string[] } | null = null;
  const flush = () => {
    if (!current) return;
    const [, sender, recipient, mo, d, y, h, mi, ap] = current.header;
    out.push({
      kind: "text",
      direction: directionOf(sender, recipient, contactName, agentKeys),
      outcome: null,
      occurred_at: localIso(mo, d, y, h, mi, ap),
      actor: sender.trim(),
      body: cleanBody(current.body),
      meta: {},
    });
  };
  for (const line of lines(cell)) {
    const header = TEXT_HEADER.exec(line.trim());
    if (header) {
      flush();
      current = { header, body: [] };
    } else if (current) {
      current.body.push(line);
    }
  }
  flush();
  return out;
}

function durationSeconds(detail: string): number | null {
  const min = /(\d+)\s*min/.exec(detail);
  const sec = /(\d+)\s*sec/.exec(detail);
  if (!min && !sec) return null;
  return (min ? Number(min[1]) * 60 : 0) + (sec ? Number(sec[1]) : 0);
}

export function parseCalls(cell: string, contactName: string, agentKeys: Set<string>): HistoryEntry[] {
  const out: HistoryEntry[] = [];
  let current: { header: RegExpExecArray; body: string[] } | null = null;
  const flush = () => {
    if (!current) return;
    const [, caller, callee, mo, d, y, h, mi, ap, rawDetail] = current.header;
    const detail = (rawDetail ?? "").toLowerCase();
    let body = cleanBody(current.body);
    let outcome: HistoryEntry["outcome"] = null;
    // Agents also typed the outcome on the line under the call.
    const typed = (body ?? "").toLowerCase();
    if (detail.includes("bad number") || typed === "bad number") outcome = "bad_number";
    else if (detail.includes("no answer") || typed === "no answer") outcome = "no_answer";
    if (typed === "bad number" || typed === "no answer") body = null;
    const seconds = durationSeconds(detail);
    if (!outcome && seconds !== null && seconds >= TALKED_MIN_SECONDS) outcome = "talked";
    const meta: Record<string, number> = {};
    if (seconds !== null) meta.duration_sec = seconds;
    out.push({
      kind: "call",
      direction: directionOf(caller, callee, contactName, agentKeys),
      outcome,
      occurred_at: localIso(mo, d, y, h, mi, ap),
      actor: caller.trim(),
      body,
      meta,
    });
  };
  for (const line of lines(cell)) {
    const header = CALL_HEADER.exec(line.trim());
    if (header) {
      flush();
      current = { header, body: [] };
    } else if (current) {
      current.body.push(line);
    }
  }
  flush();
  return out;
}

/**
 * Each note ends with its author's signature line ("-Chris Park 03/27/2025").
 * Text after the last signature is kept as an undated note.
 */
export function parseNotes(cell: string): HistoryEntry[] {
  const out: HistoryEntry[] = [];
  let body: string[] = [];
  for (const line of lines(cell)) {
    const sig = NOTE_SIGNATURE.exec(line.trim());
    if (sig) {
      const [, author, mo, d, y] = sig;
      const text = cleanBody(body);
      if (text) {
        out.push({
          kind: "note",
          direction: null,
          outcome: null,
          occurred_at: localIso(mo, d, y),
          actor: author.trim(),
          body: text,
          meta: {},
        });
      }
      body = [];
    } else {
      body.push(line);
    }
  }
  const rest = cleanBody(body);
  if (rest) {
    out.push({ kind: "note", direction: null, outcome: null, occurred_at: null, actor: null, body: rest, meta: {} });
  }
  return out;
}

/** A short stable hash for import keys (djb2, hex). */
export function shortHash(value: string): string {
  let h = 5381;
  for (let i = 0; i < value.length; i++) h = ((h << 5) + h + value.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}
