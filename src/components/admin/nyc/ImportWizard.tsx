"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, FileUp, Loader2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseCsv } from "@/lib/crm/csv";
import {
  agentKeysFrom,
  FIELD_LABELS,
  FLORIDA_TAG,
  guessMapping,
  rowToContact,
  type ImportContact,
  type ImportField,
  type ImportMapping,
} from "@/lib/crm/import-map";
import { displayName, formatPhone } from "@/lib/crm/normalize";

const BATCH = 200;
/** Vercel rejects request bodies over 4.5 MB; stay well under. */
const MAX_BODY = 3_000_000;

interface Parsed {
  fileName: string;
  rowCount: number;
  mapping: ImportMapping;
  contacts: ImportContact[];
  skipped: number;
}

type Phase =
  | { kind: "pick" }
  | { kind: "parsing" }
  | { kind: "review" }
  | { kind: "importing"; done: number }
  | { kind: "stopped"; done: number; error: string }
  | { kind: "finished" };

/**
 * Upload a Follow Up Boss export (People → select all → Export, with "All
 * Columns" ticked). The file is read and mapped in this tab, then sent in
 * batches one after another (overlapping batches could create a person
 * twice; see importContacts). Re-importing the same file adds nothing new.
 */
export function ImportWizard() {
  const [phase, setPhase] = useState<Phase>({ kind: "pick" });
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [totals, setTotals] = useState({ created: 0, merged: 0, activities: 0 });
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function read(file: File) {
    setError(null);
    if (!/\.csv$/i.test(file.name)) return setError("Choose a .csv file (Follow Up Boss exports are CSV).");
    setPhase({ kind: "parsing" });
    // Let the spinner paint before the parse blocks the tab for a second or two.
    await new Promise((r) => setTimeout(r, 30));
    try {
      const [headers, ...rows] = parseCsv(await file.text());
      if (!headers || rows.length === 0) throw new Error("The file has no rows.");
      const mapping = guessMapping(headers);
      if (!mapping.fields.emails && !mapping.fields.phones && !mapping.fields.first_name && !mapping.fields.name) {
        throw new Error("No name, email or phone columns were recognised. Is this a contacts export?");
      }
      const agents = agentKeysFrom(rows, mapping);
      const contacts: ImportContact[] = [];
      let skipped = 0;
      for (const row of rows) {
        const c = rowToContact(row, mapping, agents);
        if (c) contacts.push(c);
        else skipped++;
      }
      setParsed({ fileName: file.name, rowCount: rows.length, mapping, contacts, skipped });
      setTotals({ created: 0, merged: 0, activities: 0 });
      setPhase({ kind: "review" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the file.");
      setPhase({ kind: "pick" });
    }
  }

  /** The next batch from `start`, halved until its JSON fits the body limit. */
  function batchFrom(contacts: ImportContact[], start: number): ImportContact[] {
    let size = BATCH;
    let batch = contacts.slice(start, start + size);
    while (size > 1 && JSON.stringify(batch).length > MAX_BODY) {
      size = Math.ceil(size / 2);
      batch = contacts.slice(start, start + size);
    }
    return batch;
  }

  async function run(from: number) {
    if (!parsed) return;
    const label = `${parsed.fileName} ${new Date().toISOString().slice(0, 10)}`;
    let done = from;
    setPhase({ kind: "importing", done });
    while (done < parsed.contacts.length) {
      const batch = batchFrom(parsed.contacts, done);
      let res: Response | null = null;
      try {
        res = await fetch("/api/admin/nyc/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batch: label, contacts: batch }),
        });
      } catch {
        /* handled below */
      }
      const data = res ? await res.json().catch(() => ({})) : {};
      if (!res || !res.ok) {
        setPhase({
          kind: "stopped",
          done,
          error: !res ? "Lost the connection to the server." : data.error || `The server said ${res.status}.`,
        });
        return;
      }
      setTotals((t) => ({
        created: t.created + (data.created ?? 0),
        merged: t.merged + (data.merged ?? 0),
        activities: t.activities + (data.activities ?? 0),
      }));
      done += batch.length;
      setPhase({ kind: "importing", done });
    }
    setPhase({ kind: "finished" });
  }

  const contacts = parsed?.contacts ?? [];
  const stats = parsed
    ? {
        phone: contacts.filter((c) => c.phones.length).length,
        email: contacts.filter((c) => c.emails.length).length,
        replied: contacts.filter((c) => c.last_inbound_at).length,
        florida: contacts.filter((c) => c.tags.includes(FLORIDA_TAG)).length,
        history: contacts.reduce((n, c) => n + c.activities.length, 0),
      }
    : null;
  const progress = phase.kind === "importing" || phase.kind === "stopped" ? phase.done : phase.kind === "finished" ? contacts.length : 0;
  const pct = contacts.length ? Math.round((progress / contacts.length) * 100) : 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Import contacts</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          In Follow Up Boss: People → tick the box next to Name → Select all → Export, with{" "}
          <span className="font-medium text-foreground">All Columns</span> ticked. Texts, calls and notes come across as each
          person&apos;s timeline. Importing the same file twice adds nothing new.
        </p>
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {(phase.kind === "pick" || phase.kind === "parsing") && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) read(file);
          }}
          className={cn(
            "flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-16 text-center transition-colors",
            dragging ? "border-sky-400/60 bg-sky-400/[0.06]" : "border-white/15 bg-white/[0.02]"
          )}
        >
          {phase.kind === "parsing" ? (
            <>
              <Loader2 className="mb-3 h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium" role="status">Reading the file…</p>
            </>
          ) : (
            <>
              <FileUp className="mb-3 h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium">Drop the CSV here</p>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-black hover:bg-white/90"
              >
                Choose file
              </button>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                aria-label="CSV file"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) read(file);
                  e.target.value = "";
                }}
              />
            </>
          )}
        </div>
      )}

      {parsed && stats && phase.kind !== "pick" && phase.kind !== "parsing" && (
        <>
          <section className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-5">
            <h2 className="text-sm font-semibold">{parsed.fileName}</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ["People", contacts.length],
                ["With a phone", stats.phone],
                ["With an email", stats.email],
                ["Replied before", stats.replied],
                ["Florida inquiries", stats.florida],
                ["History entries", stats.history],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-white/[0.03] px-3 py-2.5">
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="mt-0.5 text-lg font-semibold tabular-nums">{Number(v).toLocaleString()}</dd>
                </div>
              ))}
            </dl>
            {parsed.skipped > 0 && (
              <p className="mt-3 text-sm text-muted-foreground">
                {parsed.skipped.toLocaleString()} rows have no name, email or phone and will be skipped.
              </p>
            )}

            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-medium text-sky-300 hover:text-sky-200">
                Columns recognised ({Object.keys(parsed.mapping.fields).length}), plus {parsed.mapping.extra.length} kept as extra fields
              </summary>
              <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                {(Object.entries(parsed.mapping.fields) as [ImportField, number[]][]).map(([field, cols]) => (
                  <div key={field} className="flex gap-2">
                    <dt className="w-36 shrink-0 text-muted-foreground">{FIELD_LABELS[field]}</dt>
                    <dd className="min-w-0 break-words">{cols.map((c) => parsed.mapping.headers[c]).join(", ")}</dd>
                  </div>
                ))}
              </dl>
            </details>

            <div className="mt-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">First few</p>
              <ul className="mt-2 divide-y divide-white/[0.05] rounded-lg border border-white/[0.06]">
                {contacts.slice(0, 3).map((c, i) => (
                  <li key={i} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 px-3 py-2 text-sm">
                    <span className="font-medium">{displayName(c)}</span>
                    <span className="text-muted-foreground">
                      {[c.phones[0] && formatPhone(c.phones[0]), c.stage, `${c.activities.length} history`].filter(Boolean).join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {phase.kind === "review" && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => run(0)}
                className="inline-flex h-11 items-center gap-2 rounded-lg bg-white px-5 text-sm font-semibold text-black hover:bg-white/90"
              >
                <Upload className="h-4 w-4" aria-hidden="true" />
                Import {contacts.length.toLocaleString()} people
              </button>
              <button
                type="button"
                onClick={() => {
                  setParsed(null);
                  setPhase({ kind: "pick" });
                }}
                className="inline-flex h-11 items-center rounded-lg px-4 text-sm font-medium text-muted-foreground hover:bg-white/[0.06]"
              >
                Choose another file
              </button>
            </div>
          )}

          {(phase.kind === "importing" || phase.kind === "stopped" || phase.kind === "finished") && (
            <section aria-live="polite" className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2 font-medium">
                  {phase.kind === "importing" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  {phase.kind === "finished" && <CheckCircle2 className="h-4 w-4 text-emerald-300" aria-hidden="true" />}
                  {phase.kind === "importing"
                    ? "Importing… keep this tab open"
                    : phase.kind === "finished"
                      ? "Import finished"
                      : "Import stopped"}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {progress.toLocaleString()} / {contacts.length.toLocaleString()}
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Import progress">
                <div className={cn("h-full rounded-full transition-[width]", phase.kind === "stopped" ? "bg-red-400" : "bg-emerald-400")} style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {totals.created.toLocaleString()} added · {totals.merged.toLocaleString()} matched people already in the book ·{" "}
                {totals.activities.toLocaleString()} history entries
              </p>
              {phase.kind === "stopped" && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <p role="alert" className="text-sm text-red-300">{phase.error}</p>
                  <button
                    type="button"
                    onClick={() => run(phase.done)}
                    className="inline-flex h-9 items-center rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm font-medium hover:bg-white/[0.08]"
                  >
                    Resume from {(phase.done + 1).toLocaleString()}
                  </button>
                </div>
              )}
              {phase.kind === "finished" && (
                <Link href="/admin/nyc" className="mt-4 inline-flex h-10 items-center rounded-lg bg-white px-4 text-sm font-medium text-black hover:bg-white/90">
                  Open NYC Contacts
                </Link>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
