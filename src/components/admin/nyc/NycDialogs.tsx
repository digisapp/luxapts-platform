"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Facet } from "@/lib/crm/types";

function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: () => Promise<string | null>) {
    setBusy(true);
    setError(null);
    try {
      const err = await fn();
      if (err) setError(err);
      return !err;
    } catch {
      setError("Could not reach the server. Check your connection and retry.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, setError, run };
}

/** The error message of a failed fetch, or null when it succeeded. */
export async function errorOf(res: Response): Promise<string | null> {
  if (res.ok) return null;
  const data = await res.json().catch(() => ({}));
  return data.error || `Request failed (${res.status}).`;
}

const label = "mb-1.5 block text-xs font-medium text-muted-foreground";

// ---------------------------------------------------------------------------

interface TagsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  tags: Facet[];
  onApply: (mode: "add_tag" | "remove_tag", tag: string) => Promise<string | null>;
}

/** Add or remove one tag on every selected contact. */
export function TagsDialog({ open, onOpenChange, count, tags, onApply }: TagsDialogProps) {
  const [tag, setTag] = useState("");
  const { busy, error, setError, run } = useSubmit();
  const listId = useId();

  async function apply(mode: "add_tag" | "remove_tag") {
    const value = tag.trim();
    if (!value) return setError("Type a tag first.");
    if (await run(() => onApply(mode, value))) {
      setTag("");
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tag {count.toLocaleString()} {count === 1 ? "contact" : "contacts"}</DialogTitle>
          <DialogDescription>Pick an existing tag or type a new one.</DialogDescription>
        </DialogHeader>
        <div>
          <label htmlFor={`${listId}-tag`} className={label}>
            Tag
          </label>
          <Input
            id={`${listId}-tag`}
            list={listId}
            value={tag}
            maxLength={60}
            onChange={(e) => setTag(e.target.value)}
            placeholder="e.g. Hot for spring"
            autoFocus
          />
          <datalist id={listId}>
            {tags.slice(0, 300).map((t) => (
              <option key={t.value} value={t.value} />
            ))}
          </datalist>
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => apply("remove_tag")} disabled={busy}>
            Remove tag
          </Button>
          <Button onClick={() => apply("add_tag")} disabled={busy}>
            {busy ? "Saving..." : "Add tag"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

interface DeleteContactsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  onConfirm: () => Promise<string | null>;
}

/** Permanent delete. Over 100 contacts it asks for the word DELETE. */
export function DeleteContactsDialog({ open, onOpenChange, count, onConfirm }: DeleteContactsDialogProps) {
  const [typed, setTyped] = useState("");
  const { busy, error, run } = useSubmit();
  const needsTyping = count > 100;
  const id = useId();

  async function confirm() {
    if (await run(onConfirm)) {
      setTyped("");
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Delete {count === 1 ? "this contact" : `${count.toLocaleString()} contacts`}?
          </DialogTitle>
          <DialogDescription>
            This removes {count === 1 ? "them" : "them all"} with every note, call, text and follow-up. It cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          For someone who is just not interested, move them to <span className="font-medium text-foreground">Trash</span> or
          mark them <span className="font-medium text-foreground">Do not contact</span> instead, so the history is kept.
        </p>
        {needsTyping && (
          <div>
            <label htmlFor={id} className={label}>
              Type DELETE to confirm
            </label>
            <Input id={id} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={busy || (needsTyping && typed !== "DELETE")}>
            <Trash2 className="h-4 w-4" />
            {busy ? "Deleting..." : count === 1 ? "Delete contact" : `Delete ${count.toLocaleString()}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

interface SaveListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: string;
  onSave: (name: string) => Promise<string | null>;
}

export function SaveListDialog({ open, onOpenChange, summary, onSave }: SaveListDialogProps) {
  const [name, setName] = useState("");
  const { busy, error, setError, run } = useSubmit();
  const id = useId();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Give the list a name.");
    if (await run(() => onSave(name.trim()))) {
      setName("");
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={save} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Save as a list</DialogTitle>
            <DialogDescription>{summary}</DialogDescription>
          </DialogHeader>
          <div>
            <label htmlFor={id} className={label}>
              List name
            </label>
            <Input id={id} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. StreetEasy 2BR, replied" autoFocus />
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving..." : "Save list"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

interface AddContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sources: Facet[];
}

/** Add one person by hand; a duplicate opens the existing contact instead. */
export function AddContactDialog({ open, onOpenChange, sources }: AddContactDialogProps) {
  const router = useRouter();
  const [form, setForm] = useState({ first_name: "", last_name: "", phone: "", email: "", source: "", note: "" });
  const [existingId, setExistingId] = useState<string | null>(null);
  const { busy, error, setError, run } = useSubmit();
  const id = useId();
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setExistingId(null);
    if (!form.first_name.trim() && !form.last_name.trim() && !form.phone.trim() && !form.email.trim()) {
      return setError("Give at least a name, a phone or an email.");
    }
    await run(async () => {
      const res = await fetch("/api/admin/nyc/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: form.first_name,
          last_name: form.last_name,
          phones: form.phone ? [form.phone] : [],
          emails: form.email ? [form.email] : [],
          source: form.source,
          note: form.note || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.existing_id) {
        setExistingId(data.existing_id);
        return "This person is already in the book.";
      }
      if (!res.ok) return data.error || `Could not add (${res.status}).`;
      onOpenChange(false);
      setForm({ first_name: "", last_name: "", phone: "", email: "", source: "", note: "" });
      router.push(`/admin/nyc/${data.id}`);
      return null;
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={save} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Add a person</DialogTitle>
            <DialogDescription>They go into the NYC book only, never Staycio&apos;s Miami leads.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={`${id}-first`} className={label}>First name</label>
              <Input id={`${id}-first`} value={form.first_name} onChange={set("first_name")} maxLength={80} autoFocus />
            </div>
            <div>
              <label htmlFor={`${id}-last`} className={label}>Last name</label>
              <Input id={`${id}-last`} value={form.last_name} onChange={set("last_name")} maxLength={80} />
            </div>
            <div>
              <label htmlFor={`${id}-phone`} className={label}>Phone</label>
              <Input id={`${id}-phone`} type="tel" value={form.phone} onChange={set("phone")} maxLength={40} />
            </div>
            <div>
              <label htmlFor={`${id}-email`} className={label}>Email</label>
              <Input id={`${id}-email`} type="email" value={form.email} onChange={set("email")} maxLength={254} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor={`${id}-source`} className={label}>Source</label>
              <Input id={`${id}-source`} list={`${id}-sources`} value={form.source} onChange={set("source")} maxLength={80} placeholder="e.g. Referral" />
              <datalist id={`${id}-sources`}>
                {sources.map((s) => (
                  <option key={s.value} value={s.value} />
                ))}
              </datalist>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor={`${id}-note`} className={label}>Note</label>
              <Textarea id={`${id}-note`} value={form.note} onChange={set("note")} rows={3} maxLength={5000} placeholder="What are they looking for?" />
            </div>
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}{" "}
              {existingId && (
                <button
                  type="button"
                  className="font-medium text-foreground underline"
                  onClick={() => {
                    onOpenChange(false);
                    router.push(`/admin/nyc/${existingId}`);
                  }}
                >
                  Open them
                </button>
              )}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Adding..." : "Add person"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

