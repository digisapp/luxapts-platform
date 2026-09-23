import type { ChatTurn, LoggedToolCall } from "@/lib/chat/session-log";

const MAX_TRANSCRIPT_ITEMS = 400;

/** One line of a phone call as the LiveKit agent reports it at hang-up. */
export interface TranscriptItem {
  role: "user" | "assistant" | "tool";
  text?: string;
  name?: string;
  args?: unknown;
  error?: string | null;
}

/** Group a flat transcript into user -> tools -> assistant turns. */
export function transcriptToTurns(sessionKey: string, items: TranscriptItem[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  let current: ChatTurn | null = null;
  const assistantText: string[] = [];

  const flush = () => {
    if (!current) return;
    current.assistantMessage = assistantText.join(" ").trim() || null;
    turns.push(current);
    assistantText.length = 0;
  };

  for (const item of items) {
    if (item.role === "user") {
      flush();
      current = { sessionKey, surface: "voice", userMessage: item.text ?? "", toolCalls: [] };
    } else {
      // Stacy's greeting arrives before the caller has said anything.
      current ??= { sessionKey, surface: "voice", userMessage: "", toolCalls: [] };
      if (item.role === "assistant" && item.text) {
        assistantText.push(item.text);
      } else if (item.role === "tool" && item.name) {
        const call: LoggedToolCall = { name: item.name, args: item.args, error: item.error ?? null };
        current.toolCalls!.push(call);
      }
    }
  }
  flush();
  return turns;
}

export function parseTranscript(raw: unknown): TranscriptItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_TRANSCRIPT_ITEMS)
    .filter(
      (i): i is TranscriptItem =>
        Boolean(i) && typeof i === "object" && ["user", "assistant", "tool"].includes(i.role)
    )
    .map((i) => ({
      role: i.role,
      text: typeof i.text === "string" ? i.text : undefined,
      name: typeof i.name === "string" ? i.name : undefined,
      args: i.args,
      error: typeof i.error === "string" ? i.error : null,
    }));
}
