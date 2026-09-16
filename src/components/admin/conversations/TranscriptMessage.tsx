import { AlertTriangle, Bot, SearchX, User, Wrench } from "lucide-react";
import { formatToolArgs } from "./helpers";

export interface TranscriptMessageRow {
  id: string;
  seq: number;
  role: string;
  content: string | null;
  tool_name: string | null;
  tool_args: unknown;
  result_count: number | null;
  error: string | null;
  created_at: string;
}

const ROLE_STYLES: Record<string, { label: string; icon: typeof User; frame: string; chip: string }> = {
  user: {
    label: "Renter",
    icon: User,
    frame: "border-cyan-500/25 bg-cyan-500/[0.06]",
    chip: "text-cyan-300",
  },
  assistant: {
    label: "Stacy",
    icon: Bot,
    frame: "border-white/10 bg-white/[0.03]",
    chip: "text-white/70",
  },
  tool: {
    label: "Tool call",
    icon: Wrench,
    frame: "border-violet-500/25 bg-violet-500/[0.05]",
    chip: "text-violet-300",
  },
};

/** HH:MM for the message gutter. Deterministic given the timestamp. */
function clock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * One transcript row. Message text is rendered as plain text with pre-wrap —
 * never dangerouslySetInnerHTML, because a transcript can contain whatever a
 * renter typed, including their name, email and phone number.
 */
export function TranscriptMessage({ message }: { message: TranscriptMessageRow }) {
  const style = ROLE_STYLES[message.role] ?? ROLE_STYLES.assistant;
  const Icon = style.icon;
  const isTool = message.role === "tool";
  const args = isTool ? formatToolArgs(message.tool_args) : "";
  // 0 results is the clearest signal of Stacy failing the user, so it is
  // styled as a warning rather than just another number.
  const emptyResult = isTool && message.result_count === 0;

  return (
    <div className={`rounded-lg border p-4 ${style.frame}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <span className={`inline-flex items-center gap-1.5 font-medium ${style.chip}`}>
          <Icon className="h-3.5 w-3.5" />
          {isTool && message.tool_name ? message.tool_name : style.label}
        </span>
        <span className="text-muted-foreground/60">#{message.seq}</span>
        <span className="text-muted-foreground/60">{clock(message.created_at)}</span>

        {isTool && message.result_count !== null && (
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold ${
              emptyResult
                ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
            }`}
          >
            {emptyResult && <SearchX className="h-3 w-3" />}
            {message.result_count} {message.result_count === 1 ? "result" : "results"}
          </span>
        )}
      </div>

      {message.content && (
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
          {message.content}
        </p>
      )}

      {isTool && !message.content && !args && !message.error && (
        <p className="text-sm text-muted-foreground">No arguments recorded.</p>
      )}

      {args && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Arguments
          </summary>
          <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-black/30 p-3 text-[11px] leading-relaxed text-white/70">
            {args}
          </pre>
        </details>
      )}

      {message.error && (
        <p className="mt-2 flex items-start gap-1.5 whitespace-pre-wrap break-words text-xs text-red-400">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {message.error}
        </p>
      )}
    </div>
  );
}
