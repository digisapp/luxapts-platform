"use client";

import { useMemo, useRef, useState } from "react";
import { Loader2, Mail, MessageSquare, Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MERGE_FIELDS, mergeValues, renderTemplate } from "@/lib/crm/templates";
import type { CrmSender, CrmTemplate } from "@/lib/crm/types";
import { errorOf } from "./NycDialogs";

interface TemplatesEditorProps {
  initialTemplates: CrmTemplate[];
  initialSender: CrmSender;
  today: string;
}

/** A made-up contact for previews. */
const SAMPLE = {
  first_name: "Dana",
  property_address: "100 Example St #5F",
  neighborhood: "Tribeca",
  beds: 1,
  price: 5400,
  added_at: "2025-11-03T17:00:00Z",
};

type Draft = { id: string | null; name: string; channel: "text" | "email"; subject: string; body: string };

const fieldLabel = "mb-1 block text-xs font-medium text-muted-foreground";

export function TemplatesEditor({ initialTemplates, initialSender, today }: TemplatesEditorProps) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [sender, setSender] = useState(initialSender);
  const [senderDraft, setSenderDraft] = useState(initialSender);
  const [savingSender, setSavingSender] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Until a name is saved, previews show where it goes instead of "it's ."
  const values = useMemo(
    () => mergeValues(SAMPLE, { name: sender.name || "[your name]", company: sender.company }, today),
    [sender, today]
  );
  const nameMissing = !sender.name.trim();

  async function saveSender(e: React.FormEvent) {
    e.preventDefault();
    setSavingSender(true);
    setError(null);
    const res = await fetch("/api/admin/nyc/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(senderDraft),
    }).catch(() => null);
    setSavingSender(false);
    const err = res ? await errorOf(res) : "Could not reach the server.";
    if (err) return setError(err);
    setSender({ name: senderDraft.name.trim(), company: senderDraft.company.trim() });
    setNotice("Saved.");
  }

  function insertField(key: string) {
    if (!draft) return;
    const el = bodyRef.current;
    const token = `{${key}}`;
    const start = el?.selectionStart ?? draft.body.length;
    const end = el?.selectionEnd ?? draft.body.length;
    const body = draft.body.slice(0, start) + token + draft.body.slice(end);
    setDraft({ ...draft, body });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  async function saveDraft(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError(null);
    const payload = { name: draft.name, channel: draft.channel, subject: draft.subject || null, body: draft.body };
    const res = await fetch(draft.id ? `/api/admin/nyc/templates/${draft.id}` : "/api/admin/nyc/templates", {
      method: draft.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);
    setSaving(false);
    if (!res) return setError("Could not reach the server.");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error || `Could not save (${res.status}).`);
    const saved = data.template as CrmTemplate;
    setTemplates((prev) => (draft.id ? prev.map((t) => (t.id === saved.id ? saved : t)) : [...prev, saved]));
    setDraft(null);
    setNotice(`Saved “${saved.name}”.`);
  }

  async function remove(t: CrmTemplate) {
    if (!window.confirm(`Delete the template “${t.name}”?`)) return;
    const res = await fetch(`/api/admin/nyc/templates/${t.id}`, { method: "DELETE" }).catch(() => null);
    const err = res ? await errorOf(res) : "Could not reach the server.";
    if (err) return setError(err);
    setTemplates((prev) => prev.filter((x) => x.id !== t.id));
  }

  const editor = draft && (
    <form onSubmit={saveDraft} className="space-y-3 rounded-xl border border-sky-400/25 bg-sky-400/[0.04] p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <div>
          <label htmlFor="tpl-name" className={fieldLabel}>Name</label>
          <Input id="tpl-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={60} required autoFocus />
        </div>
        <div>
          <span className={fieldLabel}>Sent as</span>
          <div className="flex gap-1" role="group" aria-label="Sent as">
            {(["text", "email"] as const).map((ch) => (
              <button
                key={ch}
                type="button"
                aria-pressed={draft.channel === ch}
                onClick={() => setDraft({ ...draft, channel: ch })}
                className={cn(
                  "h-11 flex-1 rounded-lg border text-sm md:h-10",
                  draft.channel === ch ? "border-sky-400/40 bg-sky-400/15 text-sky-100" : "border-white/10 bg-white/[0.03]"
                )}
              >
                {ch === "text" ? "Text" : "Email"}
              </button>
            ))}
          </div>
        </div>
      </div>
      {draft.channel === "email" && (
        <div>
          <label htmlFor="tpl-subject" className={fieldLabel}>Subject</label>
          <Input id="tpl-subject" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} maxLength={200} />
        </div>
      )}
      <div>
        <label htmlFor="tpl-body" className={fieldLabel}>Message</label>
        <Textarea
          id="tpl-body"
          ref={bodyRef}
          value={draft.body}
          onChange={(e) => setDraft({ ...draft, body: e.target.value })}
          rows={draft.channel === "email" ? 8 : 4}
          maxLength={2000}
          required
        />
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Insert a field">
          {MERGE_FIELDS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => insertField(f.key)}
              title={`Insert {${f.key}}`}
              className="h-8 rounded-md border border-white/10 bg-white/[0.03] px-2 text-xs text-foreground/85 hover:bg-white/[0.08]"
            >
              + {f.label}
            </button>
          ))}
        </div>
      </div>
      {draft.body && (
        <div className="rounded-lg bg-white/[0.03] p-3 text-sm">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Preview (for a made-up contact)</p>
          {draft.channel === "email" && draft.subject && <p className="font-semibold">{renderTemplate(draft.subject, values)}</p>}
          <p className="whitespace-pre-wrap">{renderTemplate(draft.body, values)}</p>
        </div>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-50">
          {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Save template
        </button>
        <button type="button" onClick={() => setDraft(null)} className="h-10 rounded-lg px-3 text-sm text-muted-foreground hover:bg-white/[0.06]">
          Cancel
        </button>
      </div>
    </form>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Templates</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Messages you send often. On a contact&apos;s page, Text and Email offer these, filled in for that person:
          their name, the listing they asked about, the neighborhood, their price and when they reached out.
        </p>
      </div>

      {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>}
      {notice && <p role="status" className="text-sm text-emerald-300">{notice}</p>}

      <form
        onSubmit={saveSender}
        className={cn(
          "grid gap-3 rounded-xl border p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end sm:p-5",
          nameMissing ? "border-amber-400/30 bg-amber-400/[0.06]" : "border-white/[0.08] bg-white/[0.02]"
        )}
      >
        {nameMissing && (
          <p className="text-sm text-amber-100 sm:col-span-3">
            Add your name first: the templates introduce you with it (&ldquo;Hi Dana, it&apos;s Nathan&rdquo;).
          </p>
        )}
        <div>
          <label htmlFor="sender-name" className={fieldLabel}>Your name in messages</label>
          <Input id="sender-name" value={senderDraft.name} onChange={(e) => setSenderDraft({ ...senderDraft, name: e.target.value })} maxLength={60} placeholder="e.g. Nathan" />
        </div>
        <div>
          <label htmlFor="sender-company" className={fieldLabel}>Company (optional)</label>
          <Input id="sender-company" value={senderDraft.company} onChange={(e) => setSenderDraft({ ...senderDraft, company: e.target.value })} maxLength={80} placeholder="Leave blank to just use your name" />
        </div>
        <button type="submit" disabled={savingSender} className="h-11 rounded-lg bg-white px-4 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-50 md:h-10">
          {savingSender ? "Saving..." : "Save"}
        </button>
      </form>

      {draft && !draft.id && editor}

      <ul className="space-y-3">
        {templates.map((t) =>
          draft?.id === t.id ? (
            <li key={t.id}>{editor}</li>
          ) : (
            <li key={t.id} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  {t.channel === "email" ? (
                    <Mail className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  ) : (
                    <MessageSquare className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  )}
                  {t.name}
                </h2>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setDraft({ id: t.id, name: t.name, channel: t.channel, subject: t.subject ?? "", body: t.body })}
                    className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-sky-300 hover:bg-white/[0.06]"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(t)}
                    aria-label={`Delete ${t.name}`}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-white/[0.06] hover:text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {t.subject && <p className="mt-2 text-sm font-medium">{renderTemplate(t.subject, values)}</p>}
              <p className="mt-1.5 whitespace-pre-wrap text-sm text-foreground/85">{renderTemplate(t.body, values)}</p>
            </li>
          )
        )}
      </ul>

      {!draft && (
        <button
          type="button"
          onClick={() => setDraft({ id: null, name: "", channel: "text", subject: "", body: "" })}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 text-sm font-medium hover:bg-white/[0.08]"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          New template
        </button>
      )}
    </div>
  );
}
