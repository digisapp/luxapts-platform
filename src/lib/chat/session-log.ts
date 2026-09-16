import { createAdminClient } from "@/lib/supabase/server";

/**
 * Persistence for Stacy's conversations.
 *
 * chat_sessions has existed since migration 001 but never had a writer, so
 * every conversation was discarded and the admin Chat Log was permanently
 * empty. Nothing here may block or fail a chat response: callers invoke it
 * from `after()`, and every function swallows its own errors.
 */

export type ChatSurface = "chat" | "voice";

export interface LoggedToolCall {
  name: string;
  args?: unknown;
  /** Rows returned, when the tool reports a count. 0 is a real signal. */
  resultCount?: number | null;
  error?: string | null;
}

export interface ChatTurn {
  /** Stable per conversation, supplied by the client. */
  sessionKey: string;
  surface?: ChatSurface;
  userId?: string | null;
  citySlug?: string | null;
  buildingId?: string | null;
  /** The message the user just sent. */
  userMessage: string;
  /** Stacy's reply. Empty when the turn errored before any text. */
  assistantMessage?: string | null;
  toolCalls?: LoggedToolCall[];
  /** Set when the turn failed outright. */
  error?: string | null;
}

// Until migration 025 is applied the table/columns do not exist. Say so once
// per process, clearly, instead of printing a raw PostgREST error on every
// single chat turn.
const MISSING_SCHEMA_CODES = new Set(["PGRST204", "PGRST205", "42703", "42P01"]);
let warnedMissingSchema = false;

function isMissingSchema(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return typeof code === "string" && MISSING_SCHEMA_CODES.has(code);
}

function reportWriteFailure(context: string, error: unknown): void {
  if (isMissingSchema(error)) {
    if (!warnedMissingSchema) {
      warnedMissingSchema = true;
      console.warn(
        "Chat transcripts are not being stored: apply supabase/migrations/025_chat_transcripts.sql. " +
          "Chat itself is unaffected."
      );
    }
    return;
  }
  console.error(context, error);
}

const MAX_CONTENT_CHARS = 8000;
const SESSION_KEY_RE = /^[A-Za-z0-9_-]{8,128}$/;

function clip(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > MAX_CONTENT_CHARS
    ? `${trimmed.slice(0, MAX_CONTENT_CHARS)}…[truncated]`
    : trimmed;
}

/** Validates the client-supplied key; anything odd gets its own session. */
export function isValidSessionKey(value: unknown): value is string {
  return typeof value === "string" && SESSION_KEY_RE.test(value);
}

/**
 * Record one complete turn: the user's message, any tools Stacy ran, and her
 * reply. Creates the session on first use. Never throws.
 */
export async function logChatTurn(turn: ChatTurn): Promise<void> {
  try {
    if (!isValidSessionKey(turn.sessionKey)) return;

    const supabase = createAdminClient();
    const now = new Date().toISOString();
    const toolCalls = turn.toolCalls ?? [];
    const userMessage = clip(turn.userMessage);

    const errorCount =
      (turn.error ? 1 : 0) + toolCalls.filter((t) => t.error).length;
    const emptyResults = toolCalls.filter((t) => t.resultCount === 0).length;

    // Find or create the session.
    const { data: existing } = await supabase
      .from("chat_sessions")
      .select("id, messages_count, tool_calls_count, error_count, empty_results_count")
      .eq("session_key", turn.sessionKey)
      .maybeSingle();

    let sessionId = existing?.id as string | undefined;

    if (!sessionId) {
      const { data: created, error: createError } = await supabase
        .from("chat_sessions")
        .insert({
          session_key: turn.sessionKey,
          surface: turn.surface ?? "chat",
          user_id: turn.userId ?? null,
          building_id: turn.buildingId ?? null,
          city_slug: turn.citySlug ?? null,
          first_question: userMessage,
          last_message_at: now,
          messages_count: 0,
          tool_calls_count: 0,
          error_count: 0,
          empty_results_count: 0,
        })
        .select("id")
        .single();

      if (createError || !created) {
        // 23505: another concurrent turn created it first — adopt that row.
        const { data: raced } = await supabase
          .from("chat_sessions")
          .select("id")
          .eq("session_key", turn.sessionKey)
          .maybeSingle();
        sessionId = raced?.id as string | undefined;
        if (!sessionId) {
          reportWriteFailure(`Chat session create failed (${turn.sessionKey}):`, createError);
          return;
        }
      } else {
        sessionId = created.id as string;
      }
    }

    // Append after whatever is already stored, so a retried request cannot
    // renumber earlier messages.
    const { count: storedCount } = await supabase
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId);

    let seq = storedCount ?? 0;
    const rows: Record<string, unknown>[] = [];

    if (userMessage) {
      rows.push({ session_id: sessionId, seq: seq++, role: "user", content: userMessage });
    }

    for (const call of toolCalls) {
      rows.push({
        session_id: sessionId,
        seq: seq++,
        role: "tool",
        tool_name: call.name.slice(0, 120),
        tool_args: call.args ?? null,
        result_count: typeof call.resultCount === "number" ? call.resultCount : null,
        error: clip(call.error),
        content: null,
      });
    }

    const assistantMessage = clip(turn.assistantMessage);
    if (assistantMessage || turn.error) {
      rows.push({
        session_id: sessionId,
        seq: seq++,
        role: "assistant",
        content: assistantMessage,
        error: clip(turn.error),
      });
    }

    if (rows.length > 0) {
      const { error: insertError } = await supabase.from("chat_messages").insert(rows);
      if (insertError) {
        reportWriteFailure(`Chat message insert failed (${sessionId}):`, insertError);
        return;
      }
    }

    const { error: counterError } = await supabase
      .from("chat_sessions")
      .update({
        messages_count: (existing?.messages_count ?? 0) + rows.length,
        tool_calls_count: (existing?.tool_calls_count ?? 0) + toolCalls.length,
        error_count: (existing?.error_count ?? 0) + errorCount,
        empty_results_count: (existing?.empty_results_count ?? 0) + emptyResults,
        last_message_at: now,
        ...(turn.buildingId ? { building_id: turn.buildingId } : {}),
        ...(turn.citySlug ? { city_slug: turn.citySlug } : {}),
        ...(turn.userId ? { user_id: turn.userId } : {}),
      })
      .eq("id", sessionId);
    // Counters drive the Needs-review filter, so a silent failure here would
    // hide exactly the sessions worth reading. The transcript is already
    // safely stored at this point; only the rollup is affected.
    if (counterError) {
      reportWriteFailure(`Chat session counter update failed (${sessionId}):`, counterError);
    }
  } catch (err) {
    reportWriteFailure("logChatTurn threw:", err);
  }
}

/**
 * Attach a session to the lead it produced, so the Chat Log can show which
 * conversations converted. Never throws.
 */
export async function linkSessionToLead(sessionKey: string, leadId: string): Promise<void> {
  try {
    if (!isValidSessionKey(sessionKey)) return;
    const supabase = createAdminClient();
    await supabase
      .from("chat_sessions")
      .update({ lead_id: leadId, resolved: true })
      .eq("session_key", sessionKey);
  } catch (err) {
    console.error("linkSessionToLead threw:", err);
  }
}
