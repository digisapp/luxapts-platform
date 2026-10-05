"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ExternalLink, Mail, Pencil, Phone, Plus, Search } from "lucide-react";
import { telHref } from "@/lib/utils";
import { buildingPath } from "@/lib/seo/urls";
import {
  INCENTIVE_STATUS_LABELS,
  STALE_AFTER_DAYS,
  buildingArea,
  compareIncentives,
  daysSince,
  linkedBuilding,
  type BrokerIncentive,
  type IncentiveBuilding,
  type IncentiveStatus,
} from "@/lib/broker-incentives";
import { IncentiveFormDialog } from "./IncentiveFormDialog";

type Filter = "all" | IncentiveStatus;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pays", label: INCENTIVE_STATUS_LABELS.pays },
  { value: "unknown", label: INCENTIVE_STATUS_LABELS.unknown },
  { value: "none", label: INCENTIVE_STATUS_LABELS.none },
];

// One template for the column header and every row, so the columns line up.
const ROW_GRID =
  "grid gap-y-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)_9.5rem] lg:gap-x-6";

function dateLabel(date: string): string {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

interface IncentivesManagerProps {
  initialIncentives: BrokerIncentive[];
  buildings: IncentiveBuilding[];
  buildingsError: string | null;
}

export function IncentivesManager({
  initialIncentives,
  buildings,
  buildingsError,
}: IncentivesManagerProps) {
  const [incentives, setIncentives] = useState(initialIncentives);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  // target null = adding. Kept while the dialog closes so its title doesn't
  // flip to "Add building" mid-animation.
  const [dialog, setDialog] = useState<{ open: boolean; target: BrokerIncentive | null }>({
    open: false,
    target: null,
  });
  // Null until mount so the server's clock never decides what is stale.
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
  }, []);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: incentives.length, pays: 0, unknown: 0, none: 0 };
    for (const i of incentives) c[i.status]++;
    return c;
  }, [incentives]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return incentives.filter((i) => {
      if (filter !== "all" && i.status !== filter) return false;
      if (!q) return true;
      const b = linkedBuilding(i);
      return [
        i.building_name,
        b?.name,
        buildingArea(b),
        i.incentive,
        i.conditions,
        i.contact_name,
        i.contact_email,
        i.notes,
      ].some((v) => v?.toLowerCase().includes(q));
    });
  }, [incentives, filter, search]);

  function handleSaved(saved: BrokerIncentive) {
    setIncentives((prev) =>
      [...prev.filter((i) => i.id !== saved.id), saved].sort(compareIncentives)
    );
  }

  function handleDeleted(id: string) {
    setIncentives((prev) => prev.filter((i) => i.id !== id));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] max-w-sm flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Search building, contact, terms..."
            aria-label="Search incentives"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <Button
              key={f.value}
              variant={filter === f.value ? "default" : "outline"}
              size="sm"
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
              <span className="tabular-nums opacity-60">{counts[f.value]}</span>
            </Button>
          ))}
        </div>
        <Button onClick={() => setDialog({ open: true, target: null })} className="shrink-0 sm:ml-auto">
          <Plus className="h-4 w-4" />
          Add building
        </Button>
      </div>

      <div className="space-y-2">
        {filtered.length > 0 && (
          <div
            aria-hidden="true"
            className={`${ROW_GRID} hidden px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground lg:grid`}
          >
            <span>Building</span>
            <span>OP commission</span>
            <span>Contact</span>
            <span className="text-right">Confirmed</span>
          </div>
        )}
        {filtered.length === 0 ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            {incentives.length === 0
              ? "No buildings yet. Add the first one you've called."
              : "Nothing matches this search."}
          </p>
        ) : (
          filtered.map((i) => (
            <IncentiveRow
              key={i.id}
              incentive={i}
              now={now}
              onEdit={() => setDialog({ open: true, target: i })}
            />
          ))
        )}
      </div>

      <IncentiveFormDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        incentive={dialog.target}
        buildings={buildings}
        buildingsError={buildingsError}
        onSaved={handleSaved}
        onDeleted={handleDeleted}
      />
    </div>
  );
}

function IncentiveRow({
  incentive: i,
  now,
  onEdit,
}: {
  incentive: BrokerIncentive;
  now: number | null;
  onEdit: () => void;
}) {
  const building = linkedBuilding(i);
  const area = buildingArea(building);
  const stale =
    now !== null && i.confirmed_on !== null && daysSince(i.confirmed_on, now) > STALE_AFTER_DAYS;
  // The listing page, only for a building the public site shows.
  const listingHref = building?.status === "active" ? buildingPath(building) : null;

  return (
    <div className={`${ROW_GRID} rounded-lg border p-4 transition-colors hover:bg-muted/50`}>
      {/* Building */}
      <div className="min-w-0">
        <p className="break-words font-medium">{i.building_name}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          {building ? (
            <>
              {building.name !== i.building_name && <span>Listed as {building.name}</span>}
              {building.name !== i.building_name && area && <span aria-hidden="true">·</span>}
              {area && <span>{area}</span>}
              {listingHref && (
                <Link
                  href={listingHref}
                  target="_blank"
                  className="-my-2 inline-flex items-center py-2 hover:text-foreground"
                  aria-label={`Open the ${building.name} listing`}
                >
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </Link>
              )}
            </>
          ) : (
            <span>Not on Staycio</span>
          )}
        </p>
      </div>

      {/* Commission and what it takes to get it */}
      <div className="min-w-0">
        {i.status === "pays" ? (
          <p className="font-semibold text-emerald-300">{i.incentive || "Pays OP (amount not noted)"}</p>
        ) : i.status === "unknown" ? (
          <p className="font-medium text-amber-300">
            {i.incentive ? `${i.incentive} (to confirm)` : "To confirm"}
          </p>
        ) : (
          <p className="font-medium text-muted-foreground">No OP</p>
        )}
        {i.conditions && <p className="mt-1 text-sm text-muted-foreground">{i.conditions}</p>}
        {i.notes && <p className="mt-1 text-xs italic text-muted-foreground">{i.notes}</p>}
      </div>

      {/* Who we spoke with. Kept as an empty cell on desktop so columns line up. */}
      <div className="min-w-0 space-y-0.5 text-sm empty:hidden lg:empty:block">
        {i.contact_name && (
          <p>
            <span className="text-muted-foreground">Spoke with </span>
            {i.contact_name}
          </p>
        )}
        {i.contact_email && (
          <a
            href={`mailto:${i.contact_email}`}
            className="-my-1.5 flex min-w-0 items-center gap-1 py-1.5 text-muted-foreground [overflow-wrap:anywhere] hover:text-foreground hover:underline"
          >
            <Mail className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="min-w-0">{i.contact_email}</span>
          </a>
        )}
        {i.contact_phone && (
          <a
            href={`tel:${telHref(i.contact_phone)}`}
            className="-my-1.5 flex items-center gap-1 whitespace-nowrap py-1.5 text-muted-foreground hover:text-foreground hover:underline"
          >
            <Phone className="h-3 w-3" aria-hidden="true" />
            {i.contact_phone}
          </a>
        )}
      </div>

      {/* Edit + freshness: side by side on phones, stacked in the last column on desktop. */}
      <div className="flex flex-row-reverse items-center justify-between gap-2 lg:flex-col lg:items-end lg:justify-start">
        <Button variant="outline" size="sm" onClick={onEdit} aria-label={`Edit ${i.building_name}`}>
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          Edit
        </Button>
        {i.confirmed_on && (
          <p
            className={`whitespace-nowrap text-xs ${stale ? "font-medium text-amber-300" : "text-muted-foreground"}`}
            title={stale ? `Confirmed more than ${STALE_AFTER_DAYS} days ago; re-check before quoting` : undefined}
          >
            Confirmed {dateLabel(i.confirmed_on)}
          </p>
        )}
      </div>
    </div>
  );
}
