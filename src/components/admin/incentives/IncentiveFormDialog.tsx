"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, X } from "lucide-react";
import {
  INCENTIVE_STATUSES,
  INCENTIVE_STATUS_LABELS,
  buildingArea,
  linkedBuilding,
  type BrokerIncentive,
  type IncentiveBuilding,
  type IncentiveStatus,
} from "@/lib/broker-incentives";

type FormState = {
  building_name: string;
  building_id: string | null;
  status: IncentiveStatus;
  incentive: string;
  conditions: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  notes: string;
  confirmed_on: string;
};

/** Today as YYYY-MM-DD in the admin's own timezone. */
function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toForm(i: BrokerIncentive | null): FormState {
  return {
    building_name: i?.building_name ?? "",
    building_id: i?.building_id ?? null,
    status: i?.status ?? "unknown",
    incentive: i?.incentive ?? "",
    conditions: i?.conditions ?? "",
    contact_name: i?.contact_name ?? "",
    contact_email: i?.contact_email ?? "",
    contact_phone: i?.contact_phone ?? "",
    notes: i?.notes ?? "",
    // A new entry is usually typed straight after the call.
    confirmed_on: i ? (i.confirmed_on ?? "") : today(),
  };
}

const STATUS_STYLES: Record<IncentiveStatus, string> = {
  pays: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200",
  unknown: "border-amber-500/40 bg-amber-500/15 text-amber-200",
  none: "border-white/25 bg-white/10 text-white",
};

interface IncentiveFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The entry being edited; null to add a new one. */
  incentive: BrokerIncentive | null;
  buildings: IncentiveBuilding[];
  buildingsError: string | null;
  onSaved: (incentive: BrokerIncentive) => void;
  onDeleted: (id: string) => void;
}

export function IncentiveFormDialog({
  open,
  onOpenChange,
  incentive,
  buildings,
  buildingsError,
  onSaved,
  onDeleted,
}: IncentiveFormDialogProps) {
  const isEdit = incentive !== null;
  const [form, setForm] = useState<FormState>(() => toForm(incentive));
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(toForm(incentive));
      setConfirmDelete(false);
      setError(null);
    }
  }, [open, incentive]);

  function set<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  // The linked record: from the list, or from the entry itself when the
  // building has since been made inactive and left the list.
  const linked = useMemo(() => {
    if (!form.building_id) return null;
    return (
      buildings.find((b) => b.id === form.building_id) ??
      (incentive?.building_id === form.building_id ? linkedBuilding(incentive) : null)
    );
  }, [form.building_id, buildings, incentive]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.building_name.trim()) {
      setError("Building name is required");
      return;
    }
    setBusy("save");
    setError(null);
    try {
      const res = await fetch(isEdit ? `/api/admin/incentives/${incentive.id}` : "/api/admin/incentives", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `Could not save (${res.status}).`);
        return;
      }
      onSaved(data.incentive);
      onOpenChange(false);
    } catch {
      setError("Could not reach the server. Check your connection and retry.");
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    if (!incentive) return;
    setBusy("delete");
    setError(null);
    try {
      const res = await fetch(`/api/admin/incentives/${incentive.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `Could not delete (${res.status}).`);
        return;
      }
      onDeleted(incentive.id);
      onOpenChange(false);
    } catch {
      setError("Could not reach the server. Check your connection and retry.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${incentive.building_name}` : "Add building"}</DialogTitle>
          <DialogDescription>
            The broker (OP) commission this building pays, as its leasing office told you.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="inc-name">Building</Label>
            <Input
              id="inc-name"
              value={form.building_name}
              onChange={(e) => set("building_name", e.target.value)}
              placeholder="e.g. Maizon Brickell"
              maxLength={200}
              required
            />
          </div>

          <BuildingPicker
            linked={linked}
            buildings={buildings}
            buildingsError={buildingsError}
            suggestFrom={form.building_name}
            onChange={(id) => set("building_id", id)}
          />

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Pays OP?</legend>
            <div className="flex flex-wrap gap-2">
              {INCENTIVE_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={form.status === s}
                  onClick={() => set("status", s)}
                  className={`h-11 rounded-lg border px-4 text-sm font-medium transition-colors md:h-9 ${
                    form.status === s
                      ? STATUS_STYLES[s]
                      : "border-white/10 bg-white/[0.03] text-muted-foreground hover:bg-white/[0.08]"
                  }`}
                >
                  {INCENTIVE_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="inc-amount">OP commission</Label>
            <Input
              id="inc-amount"
              value={form.incentive}
              onChange={(e) => set("incentive", e.target.value)}
              placeholder="e.g. 1 month's rent, capped at $3,500"
              maxLength={300}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inc-conditions">How to qualify</Label>
            <Textarea
              id="inc-conditions"
              value={form.conditions}
              onChange={(e) => set("conditions", e.target.value)}
              placeholder="e.g. Book the client's appointment on their website"
              rows={2}
              maxLength={1000}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="inc-contact">Spoke with</Label>
              <Input
                id="inc-contact"
                value={form.contact_name}
                onChange={(e) => set("contact_name", e.target.value)}
                placeholder="Name"
                maxLength={120}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inc-email">Email</Label>
              <Input
                id="inc-email"
                type="email"
                value={form.contact_email}
                onChange={(e) => set("contact_email", e.target.value)}
                placeholder="leasing@..."
                maxLength={320}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inc-phone">Phone</Label>
              <Input
                id="inc-phone"
                type="tel"
                value={form.contact_phone}
                onChange={(e) => set("contact_phone", e.target.value)}
                maxLength={40}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inc-notes">Notes</Label>
            <Textarea
              id="inc-notes"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={2}
              maxLength={2000}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inc-confirmed">Confirmed on</Label>
            <div className="flex items-center gap-2">
              <Input
                id="inc-confirmed"
                type="date"
                value={form.confirmed_on}
                onChange={(e) => set("confirmed_on", e.target.value)}
                className="w-auto"
              />
              <Button type="button" variant="outline" size="sm" onClick={() => set("confirmed_on", today())}>
                Today
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              The day the leasing office last confirmed these terms.
            </p>
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}

          {/* Pinned to the bottom of the scrolling dialog so Save is always in reach. */}
          <div className="sticky bottom-0 -mx-6 -mb-6 flex flex-col-reverse gap-2 border-t bg-background px-6 py-4 sm:flex-row sm:items-center">
            {isEdit &&
              (confirmDelete ? (
                <div className="flex flex-wrap items-center gap-2 sm:mr-auto">
                  <span className="text-sm">Delete this entry?</span>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={handleDelete}
                    disabled={busy !== null}
                  >
                    {busy === "delete" ? "Deleting..." : "Delete"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDelete(false)}
                    disabled={busy !== null}
                  >
                    Keep
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-red-400 hover:text-red-300 sm:mr-auto"
                  onClick={() => setConfirmDelete(true)}
                  disabled={busy !== null}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Delete
                </Button>
              ))}
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy !== null}
              className={isEdit ? "" : "sm:ml-auto"}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy !== null}>
              {busy === "save" ? "Saving..." : isEdit ? "Save" : "Add"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Links the entry to our own building record (for its neighborhood and
 * listing page). Optional: plenty of buildings that pay OP aren't on Staycio.
 */
function BuildingPicker({
  linked,
  buildings,
  buildingsError,
  suggestFrom,
  onChange,
}: {
  linked: IncentiveBuilding | null;
  buildings: IncentiveBuilding[];
  buildingsError: string | null;
  /** The typed building name, used as the search until the admin types one. */
  suggestFrom: string;
  onChange: (id: string | null) => void;
}) {
  const [query, setQuery] = useState<string | null>(null);
  const q = (query ?? suggestFrom).trim().toLowerCase();

  const matches = useMemo(() => {
    if (q.length < 2) return [];
    const words = q.split(/\s+/);
    return buildings
      .filter((b) => {
        const name = b.name.toLowerCase();
        return words.every((w) => name.includes(w));
      })
      .slice(0, 6);
  }, [q, buildings]);

  if (linked) {
    const area = buildingArea(linked);
    return (
      <div className="space-y-1.5">
        <p className="text-sm font-medium">On Staycio as</p>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm">{linked.name}</p>
            {area && <p className="text-xs text-muted-foreground">{area}</p>}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setQuery(null);
              onChange(null);
            }}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Unlink
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor="inc-link">On Staycio as (optional)</Label>
      <Input
        id="inc-link"
        value={query ?? ""}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={suggestFrom.trim() ? `Search "${suggestFrom.trim()}" or another name` : "Search our buildings"}
        autoComplete="off"
      />
      {buildingsError ? (
        <p className="text-xs text-red-400">Couldn&apos;t load our buildings: {buildingsError}</p>
      ) : matches.length > 0 ? (
        <ul className="divide-y divide-white/5 rounded-lg border border-white/10" aria-label="Matching buildings">
          {matches.map((b) => {
            const area = buildingArea(b);
            return (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => onChange(b.id)}
                  className="flex w-full items-baseline justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-white/[0.06]"
                >
                  <span className="min-w-0 truncate">{b.name}</span>
                  {area && <span className="shrink-0 text-xs text-muted-foreground">{area}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        q.length >= 2 && (
          <p className="text-xs text-muted-foreground">
            No building on Staycio matches. Leave it unlinked if we don&apos;t list it.
          </p>
        )
      )}
    </div>
  );
}
