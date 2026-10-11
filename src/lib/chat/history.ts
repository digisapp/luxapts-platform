/**
 * The history the chat widget sends with each message, kept inside what
 * /api/chat/stream accepts (chatRequestSchema and the route's total cap).
 * Anything over a limit used to 400 that turn and, because it stayed in the
 * history, every turn after it.
 */

// Max messages to send to the API to prevent unbounded context growth
export const MAX_HISTORY_MESSAGES = 20;
/** chatRequestSchema's per-message limit; also the input's maxLength. */
export const MAX_MESSAGE_CHARS = 10_000;
/** The stream route's cap on the whole history. */
export const MAX_HISTORY_CHARS = 50_000;

export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
  /** Shown in the widget but never sent back (error bubbles, rejected messages). */
  excluded?: boolean;
}

/** The most recent messages that fit, oldest dropped first. */
export function historyForApi(messages: HistoryMessage[]): { role: HistoryMessage["role"]; content: string }[] {
  const history = messages
    .filter((m) => !m.excluded && m.content.trim())
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }));
  let total = history.reduce((sum, m) => sum + m.content.length, 0);
  while (history.length > 1 && total > MAX_HISTORY_CHARS) {
    total -= history.shift()!.content.length;
  }
  return history;
}
