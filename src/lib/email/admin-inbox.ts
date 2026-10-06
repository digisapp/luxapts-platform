import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { getResendClient } from "@/lib/resend/client";
import { sanitizeInboundEmailHtml } from "@/lib/html-sanitize";
import { isValidUUID } from "@/lib/utils";
import { buildEmailShell, htmlToText } from "./branded";
import { senderIdentityFor } from "@/lib/microsites";
import { toLeadContext, type LeadContext, type LeadRowForContext } from "@/lib/leads/lead-context";
import {
  getAdminFrom,
  isValidEmail,
  threadReplyAddress,
} from "./inbound-address";

/**
 * The admin inbox service: everything /admin/email reads and writes, on the
 * `emails` table through the service-role client.
 *
 * Threading: `thread_id` is the id of the thread's first email. A thread's
 * first message is inserted with `thread_id = id` (valid whether or not the
 * self-referencing FK from migration 010 is still in place), and every later
 * message copies it. Replies are addressed to a per-thread plus-address
 * (replies+<threadId>@inbound.staycio.com — see inbound-address.ts), so the
 * answer comes back tagged with the thread. The From is the verified apex
 * (hello@staycio.com) for DKIM/SPF.
 */

// ── Types ──

export type EmailDirection = "inbound" | "outbound";
export type EmailStatus = "received" | "read" | "replied" | "sent" | "delivered" | "bounced" | "failed";

export interface EmailAttachmentMeta {
  id: string;
  filename: string;
  contentType: string;
  size?: number;
  /** True on a file we sent: it has no Resend id to download it back from. */
  sent?: boolean;
}

/** A file attached to an outgoing email, base64-encoded by the browser. */
export interface OutgoingAttachment {
  filename: string;
  contentType: string;
  /** Base64, no data: prefix. */
  content: string;
}

/** Vercel caps a request at 4.5 MB; base64 adds a third. */
export const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;
export const MAX_ATTACHMENTS = 5;
const ATTACHMENT_TYPES = /^(application\/pdf|image\/(png|jpe?g|gif|webp|heic|heif)|text\/(plain|csv)|application\/(msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)|vnd\.ms-excel))$/i;

/** Decoded size of a base64 string, padding included in the reckoning. */
function base64Bytes(content: string): number {
  const padding = content.endsWith("==") ? 2 : content.endsWith("=") ? 1 : 0;
  return Math.floor((content.length * 3) / 4) - padding;
}

/** Validates outgoing attachments. Returns the cleaned list or a reason it can't be sent. */
export function checkOutgoingAttachments(raw: unknown): { ok: true; files: OutgoingAttachment[] } | { ok: false; error: string } {
  if (raw == null) return { ok: true, files: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "Attachments must be a list" };
  if (raw.length > MAX_ATTACHMENTS) return { ok: false, error: `Attach at most ${MAX_ATTACHMENTS} files` };
  const files: OutgoingAttachment[] = [];
  let total = 0;
  for (const item of raw) {
    const f = item as Partial<OutgoingAttachment>;
    const filename = typeof f.filename === "string" ? f.filename.replace(/[\\/\r\n"]/g, "_").trim().slice(0, 120) : "";
    const contentType = typeof f.contentType === "string" ? f.contentType.trim() : "";
    const content = typeof f.content === "string" ? f.content.replace(/^data:[^,]*,/, "") : "";
    if (!filename || !content) return { ok: false, error: "An attachment is missing its name or content" };
    if (!ATTACHMENT_TYPES.test(contentType)) return { ok: false, error: `${filename}: only PDFs, images and Office files can be attached` };
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(content)) return { ok: false, error: `${filename}: could not read the file` };
    total += base64Bytes(content);
    files.push({ filename, contentType, content });
  }
  if (total > MAX_ATTACHMENT_BYTES) return { ok: false, error: "Attachments are over 3 MB in total" };
  return { ok: true, files };
}

/** JSON in `emails.metadata`. */
export interface EmailMetadata {
  /** Internal "new lead" alert written by recordInternalLeadAlert(). */
  kind?: "lead_alert" | string;
  source?: string;
  phone?: string | null;
  /** Outbound sent by the AI without an admin. */
  auto_sent?: boolean;
  /** Threading headers we sent (In-Reply-To / References). */
  headers?: Record<string, string>;
  cc?: string[];
  attachments?: EmailAttachmentMeta[];
  /** Set on the "Send me a test" row so the UI can label it. */
  test?: boolean;
}

/** One row of `emails` as PostgREST returns it. */
export interface EmailRow {
  id: string;
  direction: EmailDirection;
  thread_id: string | null;
  resend_message_id: string | null;
  from_email: string;
  from_name: string | null;
  to_email: string;
  to_name: string | null;
  reply_to: string | null;
  cc: string | null;
  subject: string;
  body_html: string | null;
  body_text: string | null;
  status: EmailStatus;
  sent_by: string | null;
  lead_id: string | null;
  is_starred: boolean;
  is_spam?: boolean | null;
  metadata: EmailMetadata | null;
  headers: Record<string, string | null> | null;
  created_at: string;
  read_at: string | null;
  replied_at: string | null;
  ai_draft_html: string | null;
  ai_draft_text: string | null;
  ai_category: string | null;
  ai_confidence: number | null;
  ai_processed_at: string | null;
  ai_summary: string | null;
}

/** What the list endpoint returns per email: a preview, not whole bodies. */
export interface EmailListItem {
  id: string;
  direction: EmailDirection;
  status: EmailStatus;
  threadId: string;
  fromAddress: string;
  fromName: string | null;
  toAddress: string;
  toName: string | null;
  subject: string;
  /** One-line preview (server-trimmed). */
  preview: string;
  isRead: boolean;
  isSpam: boolean;
  isStarred: boolean;
  leadId: string | null;
  isLeadAlert: boolean;
  isAutoSent: boolean;
  isTest: boolean;
  hasAttachments: boolean;
  createdAt: string;
  aiCategory: string | null;
  aiConfidence: number | null;
  aiSummary: string | null;
}

export interface EmailDetail extends Omit<EmailListItem, "preview"> {
  resendEmailId: string | null;
  messageId: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  cc: string[];
  attachments: EmailAttachmentMeta[];
  readAt: string | null;
  repliedAt: string | null;
  aiDraftText: string | null;
  aiDraftHtml: string | null;
  aiProcessedAt: string | null;
}

export interface FolderCounts {
  unread: number;
  starred: number;
  spam: number;
}

// ── Folders / actions / settings ──

export const INBOX_FOLDERS = ["inbox", "unread", "starred", "sent", "spam"] as const;
export type InboxFolder = (typeof INBOX_FOLDERS)[number];

export function isInboxFolder(v: unknown): v is InboxFolder {
  return typeof v === "string" && (INBOX_FOLDERS as readonly string[]).includes(v);
}

export const BULK_ACTIONS = ["markRead", "markUnread", "star", "unstar", "spam", "notSpam", "delete"] as const;
export type BulkAction = (typeof BULK_ACTIONS)[number];

export function isBulkAction(v: unknown): v is BulkAction {
  return typeof v === "string" && (BULK_ACTIONS as readonly string[]).includes(v);
}

/** Only keys the inbox UI may read or write through /api/admin/inbox/settings. */
export const INBOX_SETTING_KEYS = ["ai_auto_reply_enabled"] as const;
export type InboxSettingKey = (typeof INBOX_SETTING_KEYS)[number];

export function isInboxSettingKey(v: unknown): v is InboxSettingKey {
  return typeof v === "string" && (INBOX_SETTING_KEYS as readonly string[]).includes(v);
}

// ── Spam filter ──

const SPAM_PATTERNS = [
  /\b(viagra|cialis|pharmacy|casino|lottery|inheritance)\b/i,
  /\bunsubscribe\b.*\bclick\s*here\b/i,
  /\bact\s+now\b.*\blimited\s+time\b/i,
  /\bcongratulations.*you('ve| have)\s+won\b/i,
  /\bnigerian?\s+prince\b/i,
  /\b(bitcoin|btc|ethereum|crypto)\s*(giveaway|doubl|invest|guaranteed)/i,
  /\b(wire transfer|western union|free money)\b/i,
];

const SPAM_TLDS = [".xyz", ".top", ".click", ".bid", ".win", ".loan", ".buzz", ".icu", ".gdn"];

export function isLikelySpam(email: { from: string; subject: string; text?: string | null }): boolean {
  const body = email.text || "";
  const content = `${email.subject} ${body}`;
  const matchCount = SPAM_PATTERNS.filter((p) => p.test(content)).length;
  const fromDomain = email.from.split("@")[1]?.toLowerCase() || "";
  const isSpamTld = SPAM_TLDS.some((tld) => fromDomain.endsWith(tld));
  const linkCount = (body.match(/https?:\/\//gi) || []).length;
  const wordCount = body.split(/\s+/).filter(Boolean).length;
  const linkFarm = linkCount > 10 && wordCount < 200;
  return matchCount >= 2 || isSpamTld || linkFarm;
}

// ── Row → DTO ──

export function readMetadata(raw: EmailMetadata | string | null | undefined): EmailMetadata {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      const v = JSON.parse(raw);
      return v && typeof v === "object" ? (v as EmailMetadata) : {};
    } catch {
      return {};
    }
  }
  return typeof raw === "object" ? raw : {};
}

function preview(row: Pick<EmailRow, "body_text" | "body_html">): string {
  const text = row.body_text?.trim() ? row.body_text : row.body_html ? htmlToText(row.body_html) : "";
  // Our own designed emails (lead alerts) open with the "Staycio" wordmark;
  // the preview should start with what the email says.
  return text.replace(/\s+/g, " ").trim().replace(/^Staycio\b\s*/, "").slice(0, 160);
}

function threadKeyOf(row: Pick<EmailRow, "id" | "thread_id">): string {
  return row.thread_id || row.id;
}

export function toListItem(row: EmailRow): EmailListItem {
  const meta = readMetadata(row.metadata);
  return {
    id: row.id,
    direction: row.direction,
    status: row.status,
    threadId: threadKeyOf(row),
    fromAddress: row.from_email,
    fromName: row.from_name,
    toAddress: row.to_email,
    toName: row.to_name,
    subject: row.subject,
    preview: preview(row),
    isRead: row.direction === "outbound" || row.status !== "received",
    isSpam: row.is_spam === true,
    isStarred: row.is_starred === true,
    leadId: row.lead_id,
    isLeadAlert: meta.kind === "lead_alert",
    isAutoSent: meta.auto_sent === true,
    isTest: meta.test === true,
    hasAttachments: (meta.attachments?.length ?? 0) > 0,
    createdAt: row.created_at,
    aiCategory: row.ai_category,
    aiConfidence: row.ai_confidence,
    aiSummary: row.ai_summary,
  };
}

export function toDetail(row: EmailRow): EmailDetail {
  const meta = readMetadata(row.metadata);
  const item = toListItem(row);
  const ccFromMeta = Array.isArray(meta.cc) ? meta.cc.filter((c): c is string => typeof c === "string") : [];
  const ccFromColumn = row.cc ? row.cc.split(",").map((c) => c.trim()).filter(Boolean) : [];
  return {
    ...item,
    resendEmailId: row.resend_message_id,
    messageId: row.headers?.["message-id"] ?? null,
    bodyText: row.body_text,
    bodyHtml: row.body_html,
    cc: ccFromMeta.length ? ccFromMeta : ccFromColumn,
    attachments: Array.isArray(meta.attachments) ? meta.attachments : [],
    readAt: row.read_at,
    repliedAt: row.replied_at,
    aiDraftText: row.ai_draft_text,
    aiDraftHtml: row.ai_draft_html,
    aiProcessedAt: row.ai_processed_at,
  };
}

// ── Schema probe ──
//
// `is_spam` arrives with migration 029. Deployed ahead of it, every query
// that names the column answers 42703 and the inbox would be empty, so the
// column is probed once per process and the Spam folder is switched off
// until the migration is applied.

let spamColumnKnown: boolean | null = null;

export async function hasSpamColumn(supabase: SupabaseClient): Promise<boolean> {
  if (spamColumnKnown !== null) return spamColumnKnown;
  const probe = await supabase.from("emails").select("id").eq("is_spam", false).limit(1);
  const missing = probe.error?.code === "42703";
  if (missing) {
    console.error("emails.is_spam is missing — apply migration 029; the Spam folder is off until then");
  }
  // Cache only a definitive answer; a transient error must not pin the probe.
  if (!probe.error || missing) spamColumnKnown = !missing;
  return !missing;
}

/** Test hook. */
export function _resetInboxSchemaCache() {
  spamColumnKnown = null;
}

// ── Query helpers ──

const PAGE_LIMIT_MAX = 50;

function escapeLike(q: string): string {
  // `%`, `_` and `\` are LIKE wildcards; `,` `(` `)` `"` are PostgREST filter grammar.
  return q.replace(/[%_\\,()"]/g, " ").replace(/\s+/g, " ").trim();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQuery = any;

function applyFolder(q: AnyQuery, folder: InboxFolder, spamColumn: boolean): AnyQuery | null {
  switch (folder) {
    case "inbox":
      q = q.eq("direction", "inbound");
      return spamColumn ? q.eq("is_spam", false) : q;
    case "unread":
      q = q.eq("direction", "inbound").eq("status", "received");
      return spamColumn ? q.eq("is_spam", false) : q;
    case "starred":
      q = q.eq("is_starred", true);
      return spamColumn ? q.eq("is_spam", false) : q;
    case "sent":
      return q.eq("direction", "outbound");
    case "spam":
      return spamColumn ? q.eq("is_spam", true) : null;
  }
}

function nowIso() {
  return new Date().toISOString();
}

// ── Service ──

export function createAdminInboxService(supabase: SupabaseClient = createAdminClient()) {
  const service = {
    async listEmails({
      folder = "inbox",
      search,
      page = 1,
      limit = 25,
    }: {
      folder?: InboxFolder;
      search?: string;
      page?: number;
      limit?: number;
    }) {
      const safeLimit = Math.min(PAGE_LIMIT_MAX, Math.max(1, limit));
      const safePage = Math.max(1, page);
      const offset = (safePage - 1) * safeLimit;
      const spamColumn = await hasSpamColumn(supabase);

      let q = applyFolder(
        supabase.from("emails").select("*", { count: "exact" }),
        folder,
        spamColumn
      );
      if (!q) {
        return { emails: [] as EmailListItem[], total: 0, page: safePage, limit: safeLimit, totalPages: 1 };
      }

      const term = escapeLike((search || "").slice(0, 200));
      if (term) {
        q = q.or(
          [
            `subject.ilike.%${term}%`,
            `from_email.ilike.%${term}%`,
            `from_name.ilike.%${term}%`,
            `to_email.ilike.%${term}%`,
            `body_text.ilike.%${term}%`,
          ].join(",")
        );
      }

      const { data, count, error } = await q
        .order("created_at", { ascending: false })
        .range(offset, offset + safeLimit - 1);
      if (error) throw new Error(`List emails failed: ${error.message}`);

      const total = count ?? 0;
      return {
        emails: ((data ?? []) as EmailRow[]).map(toListItem),
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.max(1, Math.ceil(total / safeLimit)),
      };
    },

    /** Badge numbers for the folder pills. */
    async getFolderCounts(): Promise<FolderCounts> {
      const spamColumn = await hasSpamColumn(supabase);
      const head = () => supabase.from("emails").select("id", { count: "exact", head: true });
      let unreadQ = head().eq("direction", "inbound").eq("status", "received");
      let starredQ = head().eq("is_starred", true);
      if (spamColumn) {
        unreadQ = unreadQ.eq("is_spam", false);
        starredQ = starredQ.eq("is_spam", false);
      }
      const [unread, starred, spam] = await Promise.all([
        unreadQ,
        starredQ,
        spamColumn ? head().eq("is_spam", true) : Promise.resolve({ count: 0 }),
      ]);
      return { unread: unread.count ?? 0, starred: starred.count ?? 0, spam: spam.count ?? 0 };
    },

    async getUnreadCount(): Promise<number> {
      const spamColumn = await hasSpamColumn(supabase);
      let q = supabase
        .from("emails")
        .select("id", { count: "exact", head: true })
        .eq("direction", "inbound")
        .eq("status", "received");
      if (spamColumn) q = q.eq("is_spam", false);
      const { count } = await q;
      return count ?? 0;
    },

    async getEmailRow(id: string): Promise<EmailRow | null> {
      if (!isValidUUID(id)) return null;
      const { data } = await supabase.from("emails").select("*").eq("id", id).maybeSingle();
      return (data as EmailRow | null) ?? null;
    },

    async getEmail(id: string): Promise<EmailDetail | null> {
      const row = await service.getEmailRow(id);
      return row ? toDetail(row) : null;
    },

    /** Every message in a thread, oldest first. Rows that predate migration 029 have no thread_id; the root row's id is the key. */
    async getThread(threadId: string): Promise<EmailDetail[]> {
      if (!isValidUUID(threadId)) return [];
      const { data, error } = await supabase
        .from("emails")
        .select("*")
        .or(`thread_id.eq.${threadId},id.eq.${threadId}`)
        .order("created_at", { ascending: true });
      if (error) throw new Error(`Load thread failed: ${error.message}`);
      return ((data ?? []) as EmailRow[]).map(toDetail);
    },

    /**
     * A "New lead" alert is a to-do: it stays unread until the lead is worked.
     * Once a lead moves past "new" (emailed, texted, called), its alerts are
     * marked read, so Unread holds only leads still waiting and real replies.
     */
    async markLeadAlertsRead(leadIds: string[]) {
      const ids = leadIds.filter((id) => isValidUUID(id));
      if (ids.length === 0) return;
      const { error } = await supabase
        .from("emails")
        .update({ status: "read", read_at: nowIso() })
        .in("lead_id", ids)
        .eq("direction", "inbound")
        .eq("status", "received")
        .eq("metadata->>kind", "lead_alert");
      if (error) throw new Error(error.message);
    },

    async markRead(id: string, isRead: boolean) {
      if (isRead) {
        // 'read' only replaces the initial 'received'; never clobber 'replied'.
        const { error } = await supabase
          .from("emails")
          .update({ status: "read", read_at: nowIso() })
          .eq("id", id)
          .eq("direction", "inbound")
          .eq("status", "received");
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase
          .from("emails")
          .update({ status: "received", read_at: null })
          .eq("id", id)
          .eq("direction", "inbound")
          .eq("status", "read");
        if (error) throw new Error(error.message);
      }
    },

    async setStar(id: string, isStarred: boolean) {
      const { error } = await supabase.from("emails").update({ is_starred: isStarred }).eq("id", id);
      if (error) throw new Error(error.message);
    },

    async markSpam(id: string, isSpam: boolean) {
      await service.bulk(isSpam ? "spam" : "notSpam", [id]);
    },

    async deleteEmail(id: string) {
      await service.bulk("delete", [id]);
    },

    async bulk(action: BulkAction, ids: string[]) {
      if (ids.length === 0) return;
      const t = supabase.from("emails");
      let res: { error: { message: string } | null };
      switch (action) {
        case "markRead":
          res = await t
            .update({ status: "read", read_at: nowIso() })
            .in("id", ids)
            .eq("direction", "inbound")
            .eq("status", "received");
          break;
        case "markUnread":
          res = await t
            .update({ status: "received", read_at: null })
            .in("id", ids)
            .eq("direction", "inbound")
            .eq("status", "read");
          break;
        case "star":
          res = await t.update({ is_starred: true }).in("id", ids);
          break;
        case "unstar":
          res = await t.update({ is_starred: false }).in("id", ids);
          break;
        case "spam":
        case "notSpam": {
          if (!(await hasSpamColumn(supabase))) {
            throw new Error("The Spam folder needs migration 029 (emails.is_spam)");
          }
          res = await t.update({ is_spam: action === "spam" }).in("id", ids);
          break;
        }
        case "delete":
          res = await t.delete().in("id", ids);
          break;
      }
      if (res.error) throw new Error(`Bulk ${action} failed: ${res.error.message}`);
    },

    /**
     * Who mail to this lead goes out as. A microsite lead (leads.source_detail
     * = the site's domain) hears from the building; everyone else from Staycio.
     */
    async senderForLead(leadId: string | null): Promise<{ from: string; email: string; name: string | null }> {
      let sourceDetail: string | null = null;
      if (leadId) {
        const { data } = await supabase.from("leads").select("source_detail").eq("id", leadId).maybeSingle();
        sourceDetail = (data as { source_detail?: string | null } | null)?.source_detail ?? null;
      }
      const identity = senderIdentityFor(sourceDetail, getAdminFrom());
      const m = identity.from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
      return m
        ? { from: identity.from, email: m[2].trim().toLowerCase(), name: m[1].trim() || null }
        : { from: identity.from, email: identity.from.trim().toLowerCase(), name: null };
    },

    /**
     * Compose or reply. Sends through Resend from the verified apex with a
     * per-thread Reply-To, then stores the outbound row.
     */
    async sendNewEmail({
      to,
      subject,
      bodyHtml,
      bodyText,
      replyToEmailId,
      sentBy,
      leadId: knownLeadId,
      extraHeaders,
      attachments = [],
      test = false,
    }: {
      to: string;
      subject: string;
      /** Body paragraphs only; the plain shell is wrapped around it on send. */
      bodyHtml: string;
      bodyText: string;
      replyToEmailId?: string | null;
      sentBy?: string | null;
      /** The lead this mail belongs to, when the caller already knows it. */
      leadId?: string | null;
      /** Extra SMTP headers, e.g. List-Unsubscribe on a first-contact note. */
      extraHeaders?: Record<string, string>;
      /** Already validated with checkOutgoingAttachments. */
      attachments?: OutgoingAttachment[];
      test?: boolean;
    }): Promise<
      | { success: true; id: string; threadId: string; resendId: string | null }
      | { success: false; error: string; status?: number }
    > {
      const recipient = to.trim().toLowerCase();
      if (!isValidEmail(recipient)) {
        return { success: false, error: "Enter a valid email address", status: 400 };
      }
      const cleanSubject = subject.trim();
      if (!cleanSubject) return { success: false, error: "Subject is required", status: 400 };
      if (!bodyText.trim() && !bodyHtml.trim()) {
        return { success: false, error: "Message is required", status: 400 };
      }

      let threadId: string | null = null;
      let toName: string | null = null;
      let leadId: string | null = knownLeadId ?? null;
      let headers: Record<string, string> = { ...(extraHeaders ?? {}) };

      if (replyToEmailId) {
        const original = await service.getEmailRow(replyToEmailId);
        if (original) {
          threadId = threadKeyOf(original);
          leadId = original.lead_id;
          if (original.direction === "inbound" && original.from_email.toLowerCase() === recipient) {
            toName = original.from_name;
          } else if (original.direction === "outbound" && original.to_email.toLowerCase() === recipient) {
            toName = original.to_name;
          }
          const messageId = original.headers?.["message-id"];
          if (messageId) {
            // Carry the References chain forward so long threads keep
            // grouping in the recipient's client.
            const prior = original.headers?.references || readMetadata(original.metadata).headers?.References;
            headers = {
              ...headers,
              "In-Reply-To": messageId,
              References: [prior, messageId].filter(Boolean).join(" "),
            };
          }
        }
      }

      if (!leadId) {
        const { data: lead } = await supabase
          .from("leads")
          .select("id")
          .eq("user_email", recipient)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        leadId = lead?.id ?? null;
      }

      // A thread's first email is its own thread key.
      const id = randomUUID();
      if (!threadId) threadId = id;

      // Sent as the building when the lead came from a microsite ("Downtown 6"
      // <downtown6miami@staycio.com>), as Staycio otherwise: the person wrote
      // to the name they know, and the answer must come from the same name.
      const sender = await service.senderForLead(leadId);
      const resend = getResendClient();
      const { data: sent, error: sendError } = await resend.emails.send(
        {
          from: sender.from,
          to: [recipient],
          subject: cleanSubject,
          html: buildEmailShell(bodyHtml, null, cleanSubject),
          text: bodyText,
          // Per-thread plus-address: the reply comes back tagged with this thread.
          replyTo: threadReplyAddress(threadId),
          ...(Object.keys(headers).length > 0 && { headers }),
          ...(attachments.length > 0 && {
            attachments: attachments.map((a) => ({
              filename: a.filename,
              content: Buffer.from(a.content, "base64"),
              contentType: a.contentType,
            })),
          }),
        },
        { idempotencyKey: `admin-inbox-${id}` }
      );
      if (sendError) {
        console.error("[Inbox] Resend send failed:", sendError);
        return { success: false, error: sendError.message || "Failed to send email", status: 502 };
      }

      const meta: EmailMetadata = {};
      if (Object.keys(headers).length > 0) meta.headers = headers;
      if (test) meta.test = true;
      if (attachments.length > 0) {
        meta.attachments = attachments.map((a, i) => ({
          id: `sent-${i}`,
          filename: a.filename,
          contentType: a.contentType,
          size: base64Bytes(a.content),
          sent: true,
        }));
      }

      const { error: insertError } = await supabase.from("emails").insert({
        id,
        thread_id: threadId,
        direction: "outbound",
        status: "sent",
        resend_message_id: sent?.id ?? null,
        from_email: sender.email,
        from_name: sender.name,
        to_email: recipient,
        to_name: toName,
        subject: cleanSubject,
        body_html: bodyHtml,
        body_text: bodyText,
        lead_id: leadId,
        is_starred: false,
        sent_by: sentBy ?? null,
        metadata: meta,
        headers: {},
      });
      if (insertError) {
        console.error("[Inbox] Email sent but failed to store:", insertError);
        return { success: false, error: "Email sent but failed to save record", status: 500 };
      }

      if (replyToEmailId) await service.markReplied(replyToEmailId);
      // Writing to a lead is contacting them: move "new" to "contacted" so
      // the leads list shows who has been worked. Later stages are kept.
      if (leadId && !test) {
        await supabase.from("leads").update({ status: "contacted" }).eq("id", leadId).eq("status", "new");
        await service.markLeadAlertsRead([leadId]).catch((err) => console.error("[Inbox] Could not clear lead alert:", err));
      }

      return { success: true, id, threadId, resendId: sent?.id ?? null };
    },

    /**
     * Store a received email (from the Resend webhook). Returns the stored
     * row, or null when it was a duplicate delivery.
     */
    async storeInboundEmail({
      from,
      fromName,
      to,
      subject,
      text,
      html,
      messageId,
      inReplyToHeader,
      referencesHeader,
      threadIdHint,
      resendEmailId,
      replyTo,
      cc,
      attachments,
    }: {
      from: string;
      fromName?: string | null;
      to: string;
      subject: string;
      text?: string | null;
      html?: string | null;
      messageId?: string | null;
      inReplyToHeader?: string | null;
      referencesHeader?: string | null;
      /** Thread id parsed from our plus-addressed Reply-To (replies+<id>@…). */
      threadIdHint?: string | null;
      /** Resend's received-email id (lets us fetch attachments later). */
      resendEmailId?: string | null;
      replyTo?: string | null;
      cc?: string[];
      attachments?: EmailAttachmentMeta[];
    }): Promise<EmailRow | null> {
      // Deduplicate: Svix delivers at least once.
      if (messageId) {
        const { data: existing } = await supabase
          .from("emails")
          .select("id")
          .eq("headers->>message-id", messageId)
          .limit(1)
          .maybeSingle();
        if (existing) {
          console.log(`[Inbox] Skipping duplicate email messageId=${messageId}`);
          return null;
        }
      }
      if (resendEmailId) {
        const { data: existing } = await supabase
          .from("emails")
          .select("id")
          .eq("resend_message_id", resendEmailId)
          .eq("direction", "inbound")
          .limit(1)
          .maybeSingle();
        if (existing) {
          console.log(`[Inbox] Skipping duplicate email resendEmailId=${resendEmailId}`);
          return null;
        }
      }

      const spam = isLikelySpam({ from, subject, text: text || (html ? htmlToText(html) : "") });
      const spamColumn = await hasSpamColumn(supabase);
      if (spam && !spamColumn) {
        // No Spam folder yet (migration 029): drop it, as the old webhook did.
        console.log(`[Inbox] Spam dropped (no is_spam column yet): from=${from} subject="${subject}"`);
        return null;
      }

      let threadId: string | null = null;
      let leadId: string | null = null;

      const threadOf = (rows: Array<Pick<EmailRow, "id" | "thread_id" | "lead_id">> | null) => {
        const row = rows?.[0];
        if (!row) return;
        threadId = threadKeyOf(row);
        leadId = row.lead_id;
      };

      // A thread is a conversation with one person. Mail only joins it when it
      // comes from that person (the thread's counterpart), however the thread
      // was found. Otherwise anyone who learns a plus tag or a Message-ID could
      // attach mail to someone else's conversation, take over its lead link
      // (and, through phone capture, write a number onto that lead), and draw
      // replies that quote the other person's messages.
      const me = from.trim().toLowerCase();
      const fromCounterpart = async (rows: Array<Pick<EmailRow, "id" | "thread_id" | "lead_id">> | null) => {
        const row = rows?.[0];
        if (!row) return false;
        const key = threadKeyOf(row);
        const { data: members } = await supabase
          .from("emails")
          .select("direction, from_email, to_email")
          .or(`thread_id.eq.${key},id.eq.${key}`)
          .limit(500);
        return (members ?? []).some((m) =>
          (m.direction === "inbound" ? m.from_email : m.to_email)?.trim().toLowerCase() === me
        );
      };

      // 1. Plus-address tag — we set it on every outbound Reply-To, so this
      //    is exact. Verify the thread exists so a guessed or forged tag
      //    can't attach mail to nothing.
      if (threadIdHint && isValidUUID(threadIdHint)) {
        const { data } = await supabase
          .from("emails")
          .select("id, thread_id, lead_id")
          .or(`thread_id.eq.${threadIdHint},id.eq.${threadIdHint}`)
          .order("created_at", { ascending: false })
          .limit(1);
        if (await fromCounterpart(data as EmailRow[] | null)) threadOf(data as EmailRow[] | null);
      }

      // 2. In-Reply-To header → a message we have stored.
      if (!threadId && inReplyToHeader) {
        const { data } = await supabase
          .from("emails")
          .select("id, thread_id, lead_id")
          .eq("headers->>message-id", inReplyToHeader)
          .limit(1);
        if (await fromCounterpart(data as EmailRow[] | null)) threadOf(data as EmailRow[] | null);
      }

      // 3. Last resort: subject with the Re: prefix stripped + the counterpart.
      if (!threadId) {
        const cleanSubject = subject.replace(/^((re|fwd|fw)\s*:\s*)+/i, "").trim();
        const counterpart = escapeLike(from);
        if (cleanSubject && cleanSubject !== subject.trim() && counterpart) {
          const { data } = await supabase
            .from("emails")
            .select("id, thread_id, lead_id")
            .or(`from_email.eq.${counterpart},to_email.eq.${counterpart}`)
            .eq("subject", cleanSubject)
            .order("created_at", { ascending: false })
            .limit(1);
          threadOf(data as EmailRow[] | null);
        }
      }

      // Link the sender to a lead by email.
      if (!leadId) {
        const { data: lead } = await supabase
          .from("leads")
          .select("id")
          .eq("user_email", from.toLowerCase())
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        leadId = lead?.id ?? null;
      }

      const meta: EmailMetadata = {};
      if (cc?.length) meta.cc = cc;
      if (attachments?.length) meta.attachments = attachments;

      const id = randomUUID();
      const row: Record<string, unknown> = {
        id,
        thread_id: threadId ?? id,
        direction: "inbound",
        status: "received",
        resend_message_id: resendEmailId ?? null,
        from_email: from,
        from_name: fromName || null,
        to_email: to,
        subject,
        // Sanitized before storing so a hostile sender cannot plant stored
        // XSS in a page an admin opens.
        body_html: html ? sanitizeInboundEmailHtml(html) : null,
        body_text: text || null,
        reply_to: replyTo ?? null,
        cc: cc?.length ? cc.join(", ") : null,
        lead_id: leadId,
        is_starred: false,
        metadata: meta,
        headers: {
          "message-id": messageId || null,
          "in-reply-to": inReplyToHeader || null,
          references: referencesHeader || null,
        },
      };
      if (spamColumn) row.is_spam = spam;

      const { data: stored, error } = await supabase.from("emails").insert(row).select("*").single();
      if (error) throw new Error(`Store inbound email failed: ${error.message}`);
      return stored as EmailRow;
    },

    async markReplied(id: string) {
      const { error } = await supabase
        .from("emails")
        .update({ status: "replied", replied_at: nowIso() })
        .eq("id", id)
        .eq("direction", "inbound");
      if (error) throw new Error(error.message);
    },

    async updateDeliveryStatus(resendEmailId: string, status: "delivered" | "bounced" | "failed") {
      // Only outbound rows carry a delivery status; inbound rows also store a
      // Resend id (the received-email id) and must not be touched.
      const { error } = await supabase
        .from("emails")
        .update({ status })
        .eq("resend_message_id", resendEmailId)
        .eq("direction", "outbound");
      if (error) throw new Error(error.message);
    },

    async updateAiFields(
      id: string,
      fields: {
        aiCategory?: string;
        aiConfidence?: number;
        aiSummary?: string;
        aiDraftText?: string;
        aiDraftHtml?: string;
      }
    ) {
      const { error } = await supabase
        .from("emails")
        .update({
          ai_category: fields.aiCategory,
          ai_confidence: fields.aiConfidence,
          ai_summary: fields.aiSummary,
          ai_draft_text: fields.aiDraftText,
          ai_draft_html: fields.aiDraftHtml,
          ai_processed_at: nowIso(),
        })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },

    /** The lead behind a conversation, for the inbox's lead card and the AI draft. */
    async getLeadContext(leadId: string | null | undefined): Promise<LeadContext | null> {
      if (!leadId || !isValidUUID(leadId)) return null;
      const { data, error } = await supabase
        .from("leads")
        .select("id, name, user_email, user_phone, status, source_detail, notes, created_at, city:city_id(name)")
        .eq("id", leadId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toLeadContext(data as unknown as LeadRowForContext, getAdminFrom()) : null;
    },

    /**
     * Save a phone number a lead sent by email onto the lead, only when the
     * lead has none yet: a number typed into the form is never overwritten.
     * Returns the number when it was saved.
     */
    async captureLeadPhone(leadId: string | null, phone: string | null): Promise<string | null> {
      if (!leadId || !phone) return null;
      const { data, error } = await supabase
        .from("leads")
        .update({ user_phone: phone })
        .eq("id", leadId)
        .or("user_phone.is.null,user_phone.eq.")
        .select("id");
      if (error) throw new Error(error.message);
      return (data as unknown[] | null)?.length ? phone : null;
    },

    /** platform_settings.value is JSONB; the inbox keys hold a boolean. */
    async getSetting(key: InboxSettingKey): Promise<boolean> {
      const { data } = await supabase.from("platform_settings").select("value").eq("key", key).maybeSingle();
      return data?.value === true;
    },

    async setSetting(key: InboxSettingKey, value: boolean) {
      const { error } = await supabase
        .from("platform_settings")
        .upsert({ key, value, updated_at: nowIso() }, { onConflict: "key" });
      if (error) throw new Error(error.message);
    },
  };

  return service;
}

export type AdminInboxService = ReturnType<typeof createAdminInboxService>;

let defaultService: AdminInboxService | null = null;

/** The service on the service-role client (lazy, so importing never touches env). */
export function getAdminInboxService(): AdminInboxService {
  if (!defaultService) defaultService = createAdminInboxService();
  return defaultService;
}
