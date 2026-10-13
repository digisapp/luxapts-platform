"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Ban,
  ChevronRight,
  Loader2,
  Mail,
  MessageCircle,
  MessageSquare,
  PhoneCall,
  SkipForward,
} from "lucide-react";
import { cn, telHref, whatsappHref } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { avatarTone, initials } from "@/components/admin/leads/lead-format";
import { displayName, formatPhone } from "@/lib/crm/normalize";
import type { CallOutcome, CrmFacets, CrmTask } from "@/lib/crm/types";
import type { ContactBundle } from "@/lib/crm/service";
import { StageMenu } from "./StageMenu";
import { ContactTimeline } from "./ContactTimeline";
import { FollowUpPrompt, QuickLog, type LogKind } from "./QuickLog";
import {
  ContactSafetyCard,
  DetailsCard,
  FollowUpsCard,
  ImportedFieldsCard,
  InquiryCard,
  TagsCard,
} from "./ContactSidebar";
import { DeleteContactsDialog, errorOf } from "./NycDialogs";
import { firstNameOf, leaseUpSoon, TONE_TEXT, touchSummary } from "./nyc-format";
import { contactHref, type ReachKind, type WorkContext } from "./work";
import { useNow } from "./use-now";

interface ContactViewProps {
  initial: ContactBundle;
  facets: CrmFacets;
  today: string;
  work: WorkContext | null;
  /** Set when the list's call/text/email link opened this page. */
  reach: ReachKind | null;
}

const COMPOSE_KINDS: { key: "note" | LogKind; label: string }[] = [
  { key: "note", label: "Note" },
  { key: "call", label: "Call" },
  { key: "text", label: "Text" },
  { key: "email", label: "Email" },
];

const bigAction =
  "inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 sm:flex-none sm:px-4";

export function ContactView({ initial, facets, today, work, reach }: ContactViewProps) {
  const router = useRouter();
  const [bundle, setBundle] = useState(initial);
  const [logging, setLogging] = useState<LogKind | null>(reach);
  const [followUpAfter, setFollowUpAfter] = useState<LogKind | "note" | null>(null);
  const [compose, setCompose] = useState<"note" | LogKind>("note");
  const [composeBody, setComposeBody] = useState("");
  const [composeOutcome, setComposeOutcome] = useState<CallOutcome | null>(null);
  const [composing, setComposing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const now = useNow();
  const [stepping, setStepping] = useState(false);
  const [endOfList, setEndOfList] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const c = bundle.contact;
  const name = displayName(c);
  const first = firstNameOf(c);
  const phone = c.phones[0];
  const email = c.emails[0];
  const touch = now === null ? null : touchSummary(c, now);
  const stagesPresent = facets.stages.map((s) => s.value);

  const reload = useCallback(async () => {
    const res = await fetch(`/api/admin/nyc/contacts/${c.id}`);
    if (res.ok) setBundle(await res.json());
  }, [c.id]);

  async function call<T = unknown>(url: string, method: string, body?: unknown): Promise<T | null> {
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        setError((await errorOf(res)) ?? "Something went wrong.");
        return null;
      }
      return (await res.json().catch(() => ({}))) as T;
    } catch {
      setError("Could not reach the server. Check your connection and retry.");
      return null;
    }
  }

  async function logActivity(kind: "note" | LogKind, outcome: CallOutcome | null, body: string): Promise<boolean> {
    const ok = await call(`/api/admin/nyc/contacts/${c.id}/activities`, "POST", {
      kind,
      outcome: outcome ?? undefined,
      body: body || undefined,
    });
    if (!ok) return false;
    await reload();
    return true;
  }

  async function patch(fields: Record<string, unknown>): Promise<boolean> {
    const ok = await call(`/api/admin/nyc/contacts/${c.id}`, "PATCH", fields);
    if (ok) await reload();
    return !!ok;
  }

  async function addTask(title: string, due: string): Promise<boolean> {
    const ok = await call(`/api/admin/nyc/contacts/${c.id}/tasks`, "POST", { title, due_on: due, kind: "call" });
    if (ok) await reload();
    return !!ok;
  }

  async function toggleTask(t: CrmTask) {
    if (await call(`/api/admin/nyc/tasks/${t.id}`, "PATCH", { completed: !t.completed_at })) await reload();
  }

  async function deleteTask(t: CrmTask) {
    if (await call(`/api/admin/nyc/tasks/${t.id}`, "DELETE")) await reload();
  }

  /** Follow-ups already due: logging a touch usually settles them. */
  const dueTasks = bundle.tasks.filter((t) => !t.completed_at && t.due_on <= today);

  async function settleDue(markDone: boolean) {
    if (!markDone) return;
    for (const t of dueTasks) await call(`/api/admin/nyc/tasks/${t.id}`, "PATCH", { completed: true });
  }

  async function deleteNote(id: string) {
    if (!window.confirm("Delete this note?")) return;
    if (await call(`/api/admin/nyc/activities/${id}`, "DELETE")) await reload();
  }

  async function next() {
    if (!work) return;
    setStepping(true);
    const params = new URLSearchParams(work.query);
    params.set("id", c.id);
    params.set("i", String(work.index));
    const data = await call<{ id: string | null; index?: number; total: number }>(`/api/admin/nyc/next?${params}`, "GET");
    setStepping(false);
    if (!data) return;
    if (!data.id) return setEndOfList(true);
    router.push(contactHref(data.id, { ...work, index: data.index ?? 0, total: data.total }));
  }

  async function submitCompose(e: React.FormEvent) {
    e.preventDefault();
    if (compose === "note" && !composeBody.trim()) return;
    if (compose === "call" && !composeOutcome) return setError("Pick how the call went.");
    setComposing(true);
    const ok = await logActivity(compose, compose === "call" ? composeOutcome : null, composeBody.trim());
    setComposing(false);
    if (ok) {
      setComposeBody("");
      setComposeOutcome(null);
      if (compose !== "note") setFollowUpAfter(compose);
    }
  }

  const backHref = work ? `/admin/nyc?${work.query}` : "/admin/nyc";

  return (
    <div className="space-y-5">
      {/* Back / work-this-list bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={backHref} className="-my-2 inline-flex items-center gap-2 py-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {work ? work.label : "NYC Contacts"}
        </Link>
        {work && (
          <div className="flex items-center gap-2">
            <span className="text-sm tabular-nums text-muted-foreground">
              {(work.index + 1).toLocaleString()} of {work.total.toLocaleString()}
            </span>
            <button
              type="button"
              onClick={next}
              disabled={stepping}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm font-medium hover:bg-white/[0.08] disabled:opacity-50"
              title="Go to the next person without logging anything"
            >
              <SkipForward className="h-4 w-4" aria-hidden="true" />
              Skip
            </button>
          </div>
        )}
      </div>

      {endOfList && (
        <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          That was the last person in “{work?.label}”.{" "}
          <Link href={backHref} className="font-medium underline">
            Back to the list
          </Link>
        </div>
      )}

      {error && (
        <div role="alert" className="flex items-center justify-between gap-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <span className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </span>
          <button type="button" onClick={() => setError(null)} className="shrink-0 rounded-md border border-red-500/40 px-3 py-1 text-xs font-medium hover:bg-red-500/20">
            Dismiss
          </button>
        </div>
      )}

      {/* Header */}
      <section className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div
              aria-hidden="true"
              className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-semibold ring-1", avatarTone(email || name || c.id))}
            >
              {initials(c.first_name || c.last_name ? name : null, email ?? null)}
            </div>
            <div className="min-w-0">
              <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
                <span className="break-words">{name}</span>
                {c.do_not_contact && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-200">
                    <Ban className="h-3 w-3" aria-hidden="true" />
                    Do not contact
                  </span>
                )}
              </h1>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
                {c.phones.map((p) => (
                  <span key={p} className="tabular-nums">{formatPhone(p)}</span>
                ))}
                {c.emails.map((e) => (
                  <span key={e} className="break-all">{e}</span>
                ))}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
                {touch && <span className={cn("font-medium", TONE_TEXT[touch.tone])}>{touch.label}</span>}
                {leaseUpSoon(c.added_at, today) && (
                  <span className="rounded-md bg-emerald-400/15 px-1.5 py-0.5 text-xs font-medium text-emerald-100">
                    Lease up soon
                  </span>
                )}
              </div>
            </div>
          </div>
          <StageMenu stage={c.stage} present={stagesPresent} who={name} size="md" onChange={(stage) => patch({ stage })} />
        </div>

        {!c.do_not_contact && (phone || email) && (
          <div className="mt-4 flex flex-wrap gap-2">
            {phone && (
              <>
                <a href={`tel:${telHref(phone)}`} onClick={() => setLogging("call")} className={cn(bigAction, "border-emerald-400/30 bg-emerald-400/15 text-emerald-50 hover:bg-emerald-400/25")}>
                  <PhoneCall className="h-4 w-4" aria-hidden="true" />
                  Call
                </a>
                <a href={`sms:${telHref(phone)}`} onClick={() => setLogging("text")} className={cn(bigAction, "border-white/10 bg-white/[0.04] hover:bg-white/[0.08]")}>
                  <MessageSquare className="h-4 w-4" aria-hidden="true" />
                  Text
                </a>
                <a
                  href={whatsappHref(phone)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setLogging("whatsapp")}
                  className={cn(bigAction, "border-white/10 bg-white/[0.04] text-emerald-300 hover:bg-white/[0.08]")}
                >
                  <MessageCircle className="h-4 w-4" aria-hidden="true" />
                  WhatsApp
                </a>
              </>
            )}
            {email && (
              <a href={`mailto:${email}`} onClick={() => setLogging("email")} className={cn(bigAction, "border-white/10 bg-white/[0.04] hover:bg-white/[0.08]")}>
                <Mail className="h-4 w-4" aria-hidden="true" />
                Email
              </a>
            )}
          </div>
        )}
      </section>

      {logging && (
        <QuickLog
          kind={logging}
          firstName={first}
          onDismiss={() => setLogging(null)}
          onLog={async (outcome, body) => {
            const ok = await logActivity(logging, outcome, body);
            if (ok) {
              setFollowUpAfter(logging);
              setLogging(null);
            }
            return ok;
          }}
        />
      )}

      {followUpAfter && (
        <FollowUpPrompt
          today={today}
          firstName={first}
          after={followUpAfter}
          dueTitles={dueTasks.map((t) => t.title)}
          onSkip={async (markDone) => {
            await settleDue(markDone);
            if (markDone && dueTasks.length) await reload();
            setFollowUpAfter(null);
          }}
          onSet={async (title, due, markDone) => {
            await settleDue(markDone);
            const ok = await addTask(title, due);
            if (ok) setFollowUpAfter(null);
            return ok;
          }}
        />
      )}

      {work && !logging && !endOfList && (
        <button
          type="button"
          onClick={next}
          disabled={stepping}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3 text-sm font-semibold text-black transition-colors hover:bg-white/90 disabled:opacity-60"
        >
          {stepping && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Next person in {work.label}
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Log anything by hand */}
          <form onSubmit={submitCompose} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
            <div className="mb-3 flex flex-wrap gap-1" role="group" aria-label="What to log">
              {COMPOSE_KINDS.map((k) => (
                <button
                  key={k.key}
                  type="button"
                  aria-pressed={compose === k.key}
                  onClick={() => setCompose(k.key)}
                  className={cn(
                    "h-8 rounded-md px-3 text-xs font-medium transition-colors",
                    compose === k.key ? "bg-white/[0.12] text-foreground" : "text-muted-foreground hover:bg-white/[0.05]"
                  )}
                >
                  {k.key === "note" ? "Note" : `Log ${k.label.toLowerCase()}`}
                </button>
              ))}
            </div>
            {compose === "call" && (
              <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Call outcome">
                {(["talked", "voicemail", "no_answer", "bad_number"] as const).map((o) => (
                  <button
                    key={o}
                    type="button"
                    aria-pressed={composeOutcome === o}
                    onClick={() => setComposeOutcome(o)}
                    className={cn(
                      "h-8 rounded-md border px-2.5 text-xs font-medium",
                      composeOutcome === o ? "border-emerald-300/50 bg-emerald-300/20" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.07]"
                    )}
                  >
                    {{ talked: "Talked", voicemail: "Left voicemail", no_answer: "No answer", bad_number: "Bad number" }[o]}
                  </button>
                ))}
              </div>
            )}
            <Textarea
              value={composeBody}
              onChange={(e) => setComposeBody(e.target.value)}
              rows={3}
              maxLength={5000}
              aria-label={compose === "note" ? "Note" : "Details"}
              placeholder={
                compose === "note"
                  ? `Write a note about ${first}…`
                  : compose === "call"
                    ? "What was said (optional)"
                    : `What you sent (optional)`
              }
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {compose === "note" ? "Only you see notes." : `Logs a ${compose} you made outside Staycio, as of now.`}
              </p>
              <button
                type="submit"
                disabled={composing || (compose === "note" && !composeBody.trim())}
                className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg bg-white px-3.5 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-50"
              >
                {composing && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                {compose === "note" ? "Save note" : `Log ${compose}`}
              </button>
            </div>
          </form>

          <ContactTimeline activities={bundle.activities} firstName={first} onDeleteNote={deleteNote} />
        </div>

        <div className="space-y-5">
          <FollowUpsCard
            tasks={bundle.tasks}
            today={today}
            firstName={first}
            onAdd={addTask}
            onToggle={toggleTask}
            onDelete={deleteTask}
          />
          <InquiryCard contact={c} />
          <TagsCard tags={c.tags} allTags={facets.tags} onChange={(tags) => patch({ tags })} />
          <DetailsCard contact={c} sources={facets.sources} agents={facets.assigned} onSave={patch} />
          <ImportedFieldsCard extra={c.extra} />
          <ContactSafetyCard contact={c} onDoNotContact={(v) => patch({ do_not_contact: v })} onDelete={() => setDeleteOpen(true)} />
        </div>
      </div>

      <DeleteContactsDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        count={1}
        onConfirm={async () => {
          const res = await fetch(`/api/admin/nyc/contacts/${c.id}`, { method: "DELETE" });
          const err = await errorOf(res);
          if (!err) router.push(backHref);
          return err;
        }}
      />
    </div>
  );
}
