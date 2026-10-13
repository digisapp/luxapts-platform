"use client";

import { useId, useState } from "react";
import { Ban, CalendarClock, ExternalLink, Home, Loader2, Pencil, Plus, Tag, Trash2, X } from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { addDays, dueLabel, followUpPresets } from "@/lib/crm/dates";
import { formatPhone } from "@/lib/crm/normalize";
import type { CrmContact, CrmTask, Facet } from "@/lib/crm/types";
import { firstNameOf, safeHttpUrl } from "./nyc-format";

const card = "rounded-xl border border-white/[0.08] bg-white/[0.02]";
const cardHead = "flex items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-3";
const fieldLabel = "mb-1 block text-xs font-medium text-muted-foreground";

// ---------------------------------------------------------------------------

interface FollowUpsCardProps {
  tasks: CrmTask[];
  today: string;
  firstName: string;
  onAdd: (title: string, due: string) => Promise<boolean>;
  onToggle: (task: CrmTask) => void;
  onDelete: (task: CrmTask) => void;
}

export function FollowUpsCard({ tasks, today, firstName, onAdd, onToggle, onDelete }: FollowUpsCardProps) {
  const open = tasks.filter((t) => !t.completed_at).sort((a, b) => a.due_on.localeCompare(b.due_on));
  const done = tasks.filter((t) => t.completed_at).slice(0, 5);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(addDays(today, 1));
  const [saving, setSaving] = useState(false);
  const id = useId();

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const ok = await onAdd(title.trim() || `Call ${firstName}`, due);
    setSaving(false);
    if (ok) {
      setAdding(false);
      setTitle("");
    }
  }

  return (
    <section aria-labelledby={`${id}-h`} className={card}>
      <div className={cardHead}>
        <h2 id={`${id}-h`} className="flex items-center gap-2 text-sm font-semibold">
          <CalendarClock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Follow-ups
        </h2>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-sky-300 hover:bg-white/[0.06]"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add
          </button>
        )}
      </div>

      {adding && (
        <form onSubmit={add} className="space-y-3 border-b border-white/[0.06] p-4">
          <div>
            <label htmlFor={`${id}-title`} className={fieldLabel}>What</label>
            <Input id={`${id}-title`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`Call ${firstName}`} maxLength={200} autoFocus />
          </div>
          <div>
            <label htmlFor={`${id}-due`} className={fieldLabel}>When</label>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {followUpPresets(today).map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setDue(p.due)}
                  aria-pressed={due === p.due}
                  className={cn(
                    "h-8 rounded-md border px-2.5 text-xs font-medium",
                    due === p.due ? "border-sky-400/40 bg-sky-400/15 text-sky-100" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.07]"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Input id={`${id}-due`} type="date" value={due} min={today} onChange={(e) => setDue(e.target.value)} required />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="inline-flex h-9 items-center gap-2 rounded-lg bg-white px-3.5 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-50">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              Set follow-up
            </button>
            <button type="button" onClick={() => setAdding(false)} className="h-9 rounded-lg px-3 text-sm text-muted-foreground hover:bg-white/[0.06]">
              Cancel
            </button>
          </div>
        </form>
      )}

      {open.length === 0 && !adding ? (
        <p className="px-4 py-4 text-sm text-muted-foreground">Nothing scheduled.</p>
      ) : (
        <ul className="divide-y divide-white/[0.05]">
          {open.map((t) => {
            const overdue = t.due_on < today;
            return (
              <li key={t.id} className="group flex items-center gap-3 px-4 py-2.5">
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => onToggle(t)}
                  aria-label={`Mark “${t.title}” done`}
                  className="h-4 w-4 shrink-0 cursor-pointer accent-white"
                />
                <span className="min-w-0 flex-1 text-sm">{t.title}</span>
                <span
                  className={cn(
                    "shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium",
                    overdue ? "bg-red-500/15 text-red-200" : t.due_on === today ? "bg-amber-400/15 text-amber-100" : "text-muted-foreground"
                  )}
                >
                  {dueLabel(t.due_on, today)}
                </span>
                <button
                  type="button"
                  onClick={() => onDelete(t)}
                  className="shrink-0 rounded p-1 text-muted-foreground opacity-60 hover:text-red-300 hover:opacity-100"
                  aria-label={`Delete “${t.title}”`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {done.length > 0 && (
        <details className="border-t border-white/[0.06]">
          <summary className="cursor-pointer px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground">
            Done ({done.length})
          </summary>
          <ul className="pb-2">
            {done.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-1.5">
                <input
                  type="checkbox"
                  checked
                  onChange={() => onToggle(t)}
                  aria-label={`Reopen “${t.title}”`}
                  className="h-4 w-4 shrink-0 cursor-pointer accent-white"
                />
                <span className="min-w-0 flex-1 text-sm text-muted-foreground line-through">{t.title}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

export function InquiryCard({ contact: c }: { contact: CrmContact }) {
  const link = safeHttpUrl(c.property_link);
  const rows: [string, string | null][] = [
    ["Listing", c.property_address],
    ["Neighborhood", c.neighborhood],
    ["Area", [c.property_city, c.property_state].filter(Boolean).join(", ") || null],
    ["Price", c.price ? formatPrice(c.price) : null],
    ["Beds", c.beds === null ? null : c.beds === 0 ? "Studio" : String(c.beds)],
    ["Move-in", c.move_in],
  ];
  if (!rows.some(([, v]) => v) && !link) return null;

  return (
    <section className={card} aria-label="What they asked about">
      <div className={cardHead}>
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Home className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          What they asked about
        </h2>
      </div>
      <dl className="space-y-2 px-4 py-3 text-sm">
        {rows.map(([k, v]) =>
          v ? (
            <div key={k} className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-right">{v}</dd>
            </div>
          ) : null
        )}
        {link && (
          <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-sky-300 hover:text-sky-200">
            Open the listing
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        )}
      </dl>
    </section>
  );
}

// ---------------------------------------------------------------------------

interface TagsCardProps {
  tags: string[];
  allTags: Facet[];
  onChange: (tags: string[]) => Promise<boolean>;
}

export function TagsCard({ tags, allTags, onChange }: TagsCardProps) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const listId = useId();

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const tag = value.trim().slice(0, 60);
    if (!tag || tags.includes(tag)) return setValue("");
    setSaving(true);
    if (await onChange([...tags, tag])) setValue("");
    setSaving(false);
  }

  return (
    <section className={card} aria-label="Tags">
      <div className={cardHead}>
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Tag className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Tags
        </h2>
      </div>
      <div className="space-y-3 p-4">
        {tags.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <li key={t} className="inline-flex max-w-full items-center gap-1 rounded-md bg-violet-400/10 py-0.5 pl-2 pr-1 text-xs text-violet-100">
                <span className="truncate">{t}</span>
                <button
                  type="button"
                  onClick={() => onChange(tags.filter((x) => x !== t))}
                  className="rounded p-0.5 text-violet-200/70 hover:bg-violet-400/20 hover:text-violet-50"
                  aria-label={`Remove tag ${t}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={add} className="flex gap-2">
          <Input
            list={listId}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Add a tag"
            aria-label="Add a tag"
            maxLength={60}
            className="h-9 md:h-9"
          />
          <datalist id={listId}>
            {allTags.slice(0, 300).map((t) => (
              <option key={t.value} value={t.value} />
            ))}
          </datalist>
          <button type="submit" disabled={saving || !value.trim()} className="h-9 shrink-0 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm font-medium hover:bg-white/[0.08] disabled:opacity-50">
            Add
          </button>
        </form>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

interface DetailsCardProps {
  contact: CrmContact;
  sources: Facet[];
  onSave: (patch: Record<string, unknown>) => Promise<boolean>;
}

const KIND_LABEL: Record<string, string> = { renter: "Renter", buyer: "Buyer", broker: "Broker (another agent)" };

type Draft = Record<
  | "first_name"
  | "last_name"
  | "phones"
  | "emails"
  | "source"
  | "kind"
  | "move_in"
  | "price"
  | "beds"
  | "property_address"
  | "neighborhood"
  | "background",
  string
>;

function draftOf(c: CrmContact): Draft {
  return {
    first_name: c.first_name ?? "",
    last_name: c.last_name ?? "",
    phones: c.phones.map(formatPhone).join("\n"),
    emails: c.emails.join("\n"),
    source: c.source ?? "",
    kind: c.kind,
    move_in: c.move_in ?? "",
    price: c.price === null ? "" : String(c.price),
    beds: c.beds === null ? "" : String(c.beds),
    property_address: c.property_address ?? "",
    neighborhood: c.neighborhood ?? "",
    background: c.background ?? "",
  };
}

const lines = (v: string) => v.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);

export function DetailsCard({ contact: c, sources, onSave }: DetailsCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftOf(c));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(/[$,\s]/g, "")));
    const price = num(draft.price);
    const beds = num(draft.beds);
    if ((price !== null && !Number.isInteger(price)) || (beds !== null && !Number.isInteger(beds))) {
      return setError("Price and beds must be whole numbers.");
    }
    setSaving(true);
    setError(null);
    const ok = await onSave({
      first_name: draft.first_name,
      last_name: draft.last_name,
      phones: lines(draft.phones),
      emails: lines(draft.emails),
      source: draft.source,
      kind: draft.kind,
      move_in: draft.move_in,
      price,
      beds,
      property_address: draft.property_address,
      neighborhood: draft.neighborhood,
      background: draft.background,
    });
    setSaving(false);
    if (ok) setEditing(false);
  }

  const view: [string, React.ReactNode][] = [
    ["Type", KIND_LABEL[c.kind]],
    ["Source", c.source],
    ["Previous agent", c.previous_agent],
    ["Added", c.added_at ? new Date(c.added_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" }) : null],
    ["Follow Up Boss ID", c.external_id],
  ];

  return (
    <section className={card} aria-labelledby={`${id}-h`}>
      <div className={cardHead}>
        <h2 id={`${id}-h`} className="text-sm font-semibold">Details</h2>
        {!editing && (
          <button
            type="button"
            onClick={() => {
              setDraft(draftOf(c));
              setEditing(true);
            }}
            className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-sky-300 hover:bg-white/[0.06]"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <form onSubmit={save} className="space-y-3 p-4">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor={`${id}-fn`} className={fieldLabel}>First name</label>
              <Input id={`${id}-fn`} value={draft.first_name} onChange={set("first_name")} maxLength={80} />
            </div>
            <div>
              <label htmlFor={`${id}-ln`} className={fieldLabel}>Last name</label>
              <Input id={`${id}-ln`} value={draft.last_name} onChange={set("last_name")} maxLength={80} />
            </div>
          </div>
          <div>
            <label htmlFor={`${id}-ph`} className={fieldLabel}>Phones (one per line, first is main)</label>
            <Textarea id={`${id}-ph`} value={draft.phones} onChange={set("phones")} rows={2} />
          </div>
          <div>
            <label htmlFor={`${id}-em`} className={fieldLabel}>Emails (one per line, first is main)</label>
            <Textarea id={`${id}-em`} value={draft.emails} onChange={set("emails")} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor={`${id}-src`} className={fieldLabel}>Source</label>
              <Input id={`${id}-src`} list={`${id}-srcs`} value={draft.source} onChange={set("source")} maxLength={80} />
              <datalist id={`${id}-srcs`}>{sources.map((s) => <option key={s.value} value={s.value} />)}</datalist>
            </div>
            <div>
              <label htmlFor={`${id}-kind`} className={fieldLabel}>Type</label>
              <select
                id={`${id}-kind`}
                value={draft.kind}
                onChange={set("kind")}
                className="h-11 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 text-base md:h-10 md:text-sm"
              >
                {Object.entries(KIND_LABEL).map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor={`${id}-addr`} className={fieldLabel}>Listing they asked about</label>
              <Input id={`${id}-addr`} value={draft.property_address} onChange={set("property_address")} maxLength={200} />
            </div>
            <div>
              <label htmlFor={`${id}-hood`} className={fieldLabel}>Neighborhood</label>
              <Input id={`${id}-hood`} value={draft.neighborhood} onChange={set("neighborhood")} maxLength={80} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label htmlFor={`${id}-pr`} className={fieldLabel}>Price</label>
              <Input id={`${id}-pr`} inputMode="numeric" value={draft.price} onChange={set("price")} />
            </div>
            <div>
              <label htmlFor={`${id}-bd`} className={fieldLabel}>Beds</label>
              <Input id={`${id}-bd`} inputMode="numeric" value={draft.beds} onChange={set("beds")} />
            </div>
            <div>
              <label htmlFor={`${id}-mi`} className={fieldLabel}>Move-in</label>
              <Input id={`${id}-mi`} value={draft.move_in} onChange={set("move_in")} maxLength={80} />
            </div>
          </div>
          <div>
            <label htmlFor={`${id}-bg`} className={fieldLabel}>Background</label>
            <Textarea id={`${id}-bg`} value={draft.background} onChange={set("background")} rows={3} maxLength={10_000} />
          </div>
          {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="inline-flex h-9 items-center gap-2 rounded-lg bg-white px-3.5 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-50">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              Save
            </button>
            <button type="button" onClick={() => setEditing(false)} className="h-9 rounded-lg px-3 text-sm text-muted-foreground hover:bg-white/[0.06]">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <dl className="space-y-2 px-4 py-3 text-sm">
          {view.map(([k, v]) =>
            v ? (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="min-w-0 break-words text-right">{v}</dd>
              </div>
            ) : null
          )}
          {c.background && (
            <div className="border-t border-white/[0.06] pt-2">
              <dt className="text-muted-foreground">Background</dt>
              <dd className="mt-1 whitespace-pre-wrap break-words">{c.background}</dd>
            </div>
          )}
        </dl>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

export function ImportedFieldsCard({ extra }: { extra: Record<string, string> }) {
  const entries = Object.entries(extra);
  if (entries.length === 0) return null;
  return (
    <details className={cn(card, "group")}>
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold marker:hidden">
        More from Follow Up Boss <span className="font-normal text-muted-foreground">({entries.length})</span>
      </summary>
      <dl className="space-y-2 border-t border-white/[0.06] px-4 py-3 text-sm">
        {entries.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="whitespace-pre-wrap break-words">{v}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

// ---------------------------------------------------------------------------

interface ContactSafetyCardProps {
  contact: CrmContact;
  onDoNotContact: (value: boolean) => void;
  onDelete: () => void;
}

export function ContactSafetyCard({ contact: c, onDoNotContact, onDelete }: ContactSafetyCardProps) {
  return (
    <section className={cn(card, "space-y-3 p-4")} aria-label="Contact settings">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={c.do_not_contact}
          onChange={(e) => onDoNotContact(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-red-400"
        />
        <span className="text-sm">
          <span className="flex items-center gap-1.5 font-medium">
            <Ban className="h-3.5 w-3.5 text-red-300" aria-hidden="true" />
            Do not contact
          </span>
          <span className="text-muted-foreground">
            Hides the call and text buttons and keeps {firstNameOf(c)} out of every calling list.
          </span>
        </span>
      </label>
      <button type="button" onClick={onDelete} className="inline-flex items-center gap-1.5 text-xs font-medium text-red-300/80 hover:text-red-200">
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        Delete contact
      </button>
    </section>
  );
}

// ---------------------------------------------------------------------------

interface MergedRecordsCardProps {
  records: { id: string; name: string; source: string | null; added_at: string | null; merge_id: string | null }[];
  onUndo: (mergeId: string) => void;
  undoing: boolean;
}

const mergedDate = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "America/New_York" });

/** Records merged into this contact, each with its own Undo. */
export function MergedRecordsCard({ records, onUndo, undoing }: MergedRecordsCardProps) {
  if (records.length === 0) return null;
  return (
    <section className={card} aria-label="Merged records">
      <div className={cardHead}>
        <h2 className="text-sm font-semibold">Merged records</h2>
      </div>
      <ul className="divide-y divide-white/[0.05]">
        {records.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <span className="min-w-0">
              <span className="block truncate">{r.name}</span>
              <span className="text-xs text-muted-foreground">
                {[r.source, r.added_at ? mergedDate.format(new Date(r.added_at)) : null].filter(Boolean).join(" · ")}
              </span>
            </span>
            {r.merge_id && (
              <button
                type="button"
                onClick={() => onUndo(r.merge_id!)}
                disabled={undoing}
                className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-sky-300 hover:bg-white/[0.06] disabled:opacity-50"
              >
                Undo merge
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
