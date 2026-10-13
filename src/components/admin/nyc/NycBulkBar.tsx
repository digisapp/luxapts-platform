"use client";

import { ChevronDown, CircleDot, RotateCcw, Tag, Trash2, UserRound, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PopoverMenu } from "@/components/admin/leads/PopoverMenu";
import { orderedStages } from "@/lib/crm/stages";

interface NycBulkBarProps {
  /** How many contacts the action will touch (page selection or all matching). */
  count: number;
  stages: string[];
  busy: boolean;
  onStage: (stage: string) => void;
  onKind: (kind: string) => void;
  onTags: () => void;
  onDelete: () => void;
  onClear: () => void;
  /** In Recently deleted the only actions are Restore and Delete forever. */
  deletedMode?: boolean;
  onRestore?: () => void;
}

const action =
  "inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium text-foreground/90 transition-colors hover:bg-white/[0.08] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 disabled:opacity-50 sm:h-9";

/** Floating toolbar for selected contacts, styled like the Leads one. */
export function NycBulkBar({
  count,
  stages,
  busy,
  onStage,
  onKind,
  onTags,
  onDelete,
  onClear,
  deletedMode,
  onRestore,
}: NycBulkBarProps) {
  if (count === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-[max(1rem,env(safe-area-inset-bottom))] lg:left-64">
      <div
        role="region"
        aria-label="Bulk actions"
        aria-busy={busy}
        className="pointer-events-auto flex max-w-full animate-rise-in flex-wrap items-center gap-1 rounded-2xl border border-white/[0.12] bg-zinc-900/90 p-1.5 shadow-2xl shadow-black/60 backdrop-blur-xl"
      >
        <span className="flex h-10 items-center gap-2 pl-3 pr-2 text-sm font-semibold tabular-nums sm:h-9">
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-sky-400 px-1.5 text-[11px] font-bold text-black">
            {count.toLocaleString()}
          </span>
          selected
        </span>

        <span className="mx-1 hidden h-5 w-px bg-white/10 sm:block" aria-hidden="true" />

        {deletedMode ? (
          <>
            <button type="button" onClick={onRestore} disabled={busy} className={action}>
              <RotateCcw className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Restore
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={busy}
              className={cn(action, "text-red-300 hover:bg-red-500/15 hover:text-red-200")}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Delete forever
            </button>
          </>
        ) : (
          <>
            <PopoverMenu
              label="Set stage for selected contacts"
              disabled={busy}
              triggerClassName={action}
              triggerContent={
                <>
                  <CircleDot className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  Stage
                  <ChevronDown className="h-3.5 w-3.5 opacity-50" aria-hidden="true" />
                </>
              }
              items={orderedStages(stages).map((s) => ({
                key: s.value,
                text: s.label,
                label: s.label,
                icon: <span className={cn("h-2 w-2 shrink-0 rounded-full", s.dot)} aria-hidden="true" />,
              }))}
              onSelect={onStage}
            />

            <button type="button" onClick={onTags} disabled={busy} className={action}>
              <Tag className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Tags
            </button>

            <PopoverMenu
              label="Set the type of the selected contacts"
              disabled={busy}
              triggerClassName={action}
              triggerContent={
                <>
                  <UserRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  Type
                  <ChevronDown className="h-3.5 w-3.5 opacity-50" aria-hidden="true" />
                </>
              }
              items={[
                { key: "renter", text: "Renter", label: "Renter" },
                { key: "buyer", text: "Buyer", label: "Buyer" },
                { key: "broker", text: "Broker", label: "Broker (another agent)" },
              ]}
              onSelect={onKind}
            />

            <button
              type="button"
              onClick={onDelete}
              disabled={busy}
              className={cn(action, "text-red-300 hover:bg-red-500/15 hover:text-red-200")}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Delete
            </button>
          </>
        )}

        <span className="mx-1 hidden h-5 w-px bg-white/10 sm:block" aria-hidden="true" />

        <button
          type="button"
          onClick={onClear}
          className={cn(action, "w-10 justify-center px-0 text-muted-foreground sm:w-9")}
          aria-label="Clear selection"
          title="Clear selection"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
