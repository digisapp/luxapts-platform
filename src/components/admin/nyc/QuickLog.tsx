"use client";

import { useState } from "react";
import { CalendarPlus, Check, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { followUpPresets } from "@/lib/crm/dates";
import type { CallOutcome } from "@/lib/crm/types";
import type { ReachKind } from "./work";

export type LogKind = ReachKind | "whatsapp";

const OUTCOMES: { key: CallOutcome; label: string }[] = [
  { key: "talked", label: "Talked" },
  { key: "voicemail", label: "Left voicemail" },
  { key: "no_answer", label: "No answer" },
  { key: "bad_number", label: "Bad number" },
];

const NOUN: Record<LogKind, string> = { call: "call", text: "text", email: "email", whatsapp: "WhatsApp" };

interface QuickLogProps {
  kind: LogKind;
  firstName: string;
  onLog: (outcome: CallOutcome | null, body: string) => Promise<boolean>;
  onDismiss: () => void;
}

/**
 * Shown right after Call / Text / Email is tapped: the phone or mail app
 * opened, and this records what happened. Nothing is logged until a button
 * here is pressed, so an abandoned text never counts as contact.
 */
export function QuickLog({ kind, firstName, onLog, onDismiss }: QuickLogProps) {
  const [outcome, setOutcome] = useState<CallOutcome | null>(null);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(chosen: CallOutcome | null) {
    setSaving(true);
    const ok = await onLog(chosen, body.trim());
    setSaving(false);
    if (ok) setBody("");
  }

  return (
    <section
      aria-label={`Log the ${NOUN[kind]}`}
      className="animate-rise-in rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] p-4 sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold">
          {kind === "call" ? `How did the call with ${firstName} go?` : `Did you send the ${NOUN[kind]}?`}
        </h2>
        <button
          type="button"
          onClick={onDismiss}
          className="-m-1.5 rounded-md p-1.5 text-muted-foreground hover:bg-white/[0.08] hover:text-foreground"
          aria-label="Close without logging"
          title={kind === "call" ? "Didn't call" : "Didn't send"}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {kind === "call" && (
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Call outcome">
          {OUTCOMES.map((o) => (
            <button
              key={o.key}
              type="button"
              aria-pressed={outcome === o.key}
              onClick={() => setOutcome(o.key)}
              className={cn(
                "h-10 rounded-lg border px-3.5 text-sm font-medium transition-colors",
                outcome === o.key
                  ? "border-emerald-300/50 bg-emerald-300/20 text-emerald-50"
                  : "border-white/10 bg-white/[0.04] hover:bg-white/[0.08]"
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        maxLength={5000}
        placeholder={kind === "call" ? "Notes from the call (optional)" : `What you said (optional)`}
        aria-label={kind === "call" ? "Call notes" : "Message"}
        className="mt-3"
      />

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => save(kind === "call" ? outcome : null)}
          disabled={saving || (kind === "call" && !outcome)}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-black transition-colors hover:bg-white/90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
          Log {NOUN[kind]}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          disabled={saving}
          className="inline-flex h-10 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
        >
          {kind === "call" ? "Didn't call" : "Didn't send"}
        </button>
      </div>
    </section>
  );
}

interface FollowUpPromptProps {
  today: string;
  firstName: string;
  /** What was just logged, to word the suggested task. */
  after: LogKind | "note";
  /** Follow-ups already due today or overdue, offered to be marked done. */
  dueTitles: string[];
  onSet: (title: string, due: string, markDone: boolean) => Promise<boolean>;
  onSkip: (markDone: boolean) => void;
}

/**
 * After logging a touch: when to reach out next. One tap sets it, and (when
 * a follow-up was already due, which is usually why they were called) marks
 * that one done too.
 */
export function FollowUpPrompt({ today, firstName, after, dueTitles, onSet, onSkip }: FollowUpPromptProps) {
  const [saving, setSaving] = useState<string | null>(null);
  const [markDone, setMarkDone] = useState(true);
  const verb = after === "email" ? "Email" : after === "text" || after === "whatsapp" ? "Text" : "Call";
  const title = `${verb} ${firstName}`;

  async function set(due: string) {
    setSaving(due);
    await onSet(title, due, markDone && dueTitles.length > 0);
    setSaving(null);
  }

  return (
    <section aria-label="Next follow-up" className="animate-rise-in rounded-xl border border-white/[0.1] bg-white/[0.03] p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <CalendarPlus className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        Logged. When should you follow up with {firstName}?
      </h2>
      {dueTitles.length > 0 && (
        <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={markDone}
            onChange={(e) => setMarkDone(e.target.checked)}
            className="h-4 w-4 cursor-pointer accent-white"
          />
          Mark {dueTitles.length === 1 ? `“${dueTitles[0]}”` : `${dueTitles.length} due follow-ups`} done
        </label>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {followUpPresets(today)
          .slice(1)
          .map((p) => (
            <button
              key={p.label}
              type="button"
              disabled={saving !== null}
              onClick={() => set(p.due)}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3.5 text-sm font-medium transition-colors hover:bg-white/[0.08] disabled:opacity-50"
            >
              {saving === p.due && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              {p.label}
            </button>
          ))}
        <button
          type="button"
          onClick={() => onSkip(markDone && dueTitles.length > 0)}
          disabled={saving !== null}
          className="inline-flex h-10 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
        >
          No follow-up
        </button>
      </div>
    </section>
  );
}
