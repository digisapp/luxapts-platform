"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlarmClock, AlertCircle, CalendarCheck2, ChevronDown, MessageSquare, PhoneCall } from "lucide-react";
import { cn, telHref } from "@/lib/utils";
import { PopoverMenu } from "@/components/admin/leads/PopoverMenu";
import { addDays, dueLabel } from "@/lib/crm/dates";
import { displayName, formatPhone } from "@/lib/crm/normalize";
import { stageMeta } from "@/lib/crm/stages";
import type { AgendaTask } from "@/lib/crm/service";
import { errorOf } from "./NycDialogs";
import { contactHref, type ReachKind } from "./work";

interface TodayAgendaProps {
  initialTasks: AgendaTask[];
  today: string;
}

const SNOOZE = [
  { key: "1", label: "Tomorrow" },
  { key: "3", label: "In 3 days" },
  { key: "7", label: "Next week" },
  { key: "30", label: "In a month" },
];

const iconButton =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground";

/** Follow-ups to do: overdue, today, then the rest of the week. */
export function TodayAgenda({ initialTasks, today }: TodayAgendaProps) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initialTasks);
  const [error, setError] = useState<string | null>(null);

  const groups = useMemo(() => {
    const overdue = tasks.filter((t) => t.due_on < today);
    const dueToday = tasks.filter((t) => t.due_on === today);
    const later = tasks.filter((t) => t.due_on > today);
    return [
      { key: "overdue", label: "Overdue", tasks: overdue, tone: "text-red-300" },
      { key: "today", label: "Today", tasks: dueToday, tone: "text-amber-200" },
      { key: "week", label: "Next 7 days", tasks: later, tone: "text-muted-foreground" },
    ].filter((g) => g.tasks.length > 0);
  }, [tasks, today]);

  async function update(task: AgendaTask, body: Record<string, unknown>, remove: boolean) {
    setError(null);
    const res = await fetch(`/api/admin/nyc/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (!res) return setError("Could not reach the server. Check your connection and retry.");
    const err = await errorOf(res);
    if (err) return setError(err);
    setTasks((prev) =>
      remove
        ? prev.filter((t) => t.id !== task.id)
        : prev
            .map((t) => (t.id === task.id ? { ...t, ...(body as Partial<AgendaTask>) } : t))
            // Snoozed past the week shown here: it leaves the agenda.
            .filter((t) => t.due_on <= addDays(today, 7))
            .sort((a, b) => a.due_on.localeCompare(b.due_on))
    );
  }

  function reach(task: AgendaTask, kind: ReachKind) {
    router.push(contactHref(task.contact_id, null, kind));
  }

  const dueNow = tasks.filter((t) => t.due_on <= today).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Today</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {dueNow === 0
            ? "Nothing due. Set follow-ups from a contact's page and they show up here."
            : `${dueNow} ${dueNow === 1 ? "follow-up is" : "follow-ups are"} due or overdue.`}
        </p>
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {groups.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-white/[0.08] bg-white/[0.02] px-6 py-16 text-center">
          <CalendarCheck2 className="mb-3 h-8 w-8 text-emerald-300" aria-hidden="true" />
          <p className="text-sm font-semibold">You&apos;re all caught up</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Want something to do? Open{" "}
            <Link href="/admin/nyc?touch=replied&sort=oldest_touch" className="font-medium text-sky-300 hover:text-sky-200">
              Replied before
            </Link>{" "}
            and work through the people who answered last time.
          </p>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.key} aria-labelledby={`agenda-${g.key}`} className="overflow-clip rounded-xl border border-white/[0.08] bg-white/[0.02]">
            <h2 id={`agenda-${g.key}`} className={cn("flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5 text-xs font-semibold uppercase tracking-wider sm:px-5", g.tone)}>
              {g.label}
              <span className="rounded-full bg-white/[0.06] px-1.5 text-[10px] tabular-nums text-foreground/70">{g.tasks.length}</span>
            </h2>
            <ul className="divide-y divide-white/[0.06]">
              {g.tasks.map((t) => {
                const c = t.contact;
                const name = c ? displayName(c) : "Deleted contact";
                const phone = c?.phones[0];
                const stage = c ? stageMeta(c.stage) : null;
                return (
                  <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5">
                    <input
                      type="checkbox"
                      checked={false}
                      onChange={() => update(t, { completed: true }, true)}
                      aria-label={`Mark “${t.title}” done`}
                      className="h-4 w-4 shrink-0 cursor-pointer accent-white"
                    />
                    <div className="min-w-0 flex-1 basis-48">
                      <p className="text-sm font-medium">{t.title}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-muted-foreground">
                        <Link href={contactHref(t.contact_id)} className="font-medium text-foreground/90 hover:underline">
                          {name}
                        </Link>
                        {phone && <span className="tabular-nums">{formatPhone(phone)}</span>}
                        {stage && (
                          <span className="inline-flex items-center gap-1">
                            <span className={cn("h-1.5 w-1.5 rounded-full", stage.dot)} aria-hidden="true" />
                            {stage.label}
                          </span>
                        )}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "rounded-md px-1.5 py-0.5 text-xs font-medium",
                        t.due_on < today ? "bg-red-500/15 text-red-200" : t.due_on === today ? "bg-amber-400/15 text-amber-100" : "text-muted-foreground"
                      )}
                    >
                      {dueLabel(t.due_on, today)}
                    </span>
                    <div className="flex items-center gap-1">
                      {phone && !c?.do_not_contact && (
                        <>
                          <a href={`tel:${telHref(phone)}`} onClick={() => reach(t, "call")} className={iconButton} aria-label={`Call ${name}`} title="Call">
                            <PhoneCall className="h-4 w-4" />
                          </a>
                          <a href={`sms:${telHref(phone)}`} onClick={() => reach(t, "text")} className={iconButton} aria-label={`Text ${name}`} title="Text">
                            <MessageSquare className="h-4 w-4" />
                          </a>
                        </>
                      )}
                      <PopoverMenu
                        label={`Snooze “${t.title}”`}
                        align="end"
                        triggerTitle="Snooze"
                        triggerClassName={cn(iconButton, "w-auto gap-1 px-2 text-xs")}
                        triggerContent={
                          <>
                            <AlarmClock className="h-4 w-4" aria-hidden="true" />
                            <ChevronDown className="h-3 w-3 opacity-60" aria-hidden="true" />
                          </>
                        }
                        items={SNOOZE.map((s) => ({ key: s.key, text: s.label, label: s.label }))}
                        onSelect={(days) => update(t, { due_on: addDays(today, Number(days)) }, false)}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
