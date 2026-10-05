"use client";

import { ChevronDown, CircleDot, Mail, Trash2, UserPlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PopoverMenu } from "./PopoverMenu";
import { STATUS_META, STATUS_ORDER } from "./lead-format";

interface Agent {
  user_id: string;
  full_name: string | null;
}

interface BulkActionBarProps {
  selectedCount: number;
  agents: Agent[];
  onApply: (action: "status" | "assign", value: string) => void;
  onEmail: () => void;
  onDelete: () => void;
  onClear: () => void;
}

const action =
  "inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium text-foreground/90 transition-colors hover:bg-white/[0.08] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 sm:h-9";

/**
 * Floating toolbar for the ticked leads. Status and agent are menus that
 * apply on pick, instead of a select plus a separate "Update" button each.
 */
export function BulkActionBar({
  selectedCount,
  agents,
  onApply,
  onEmail,
  onDelete,
  onClear,
}: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    // lg:left-64 keeps the bar centred on the content, clear of the sidebar.
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-[max(1rem,env(safe-area-inset-bottom))] lg:left-64">
      <div
        role="region"
        aria-label="Bulk actions"
        className="pointer-events-auto flex max-w-full animate-rise-in flex-wrap items-center gap-1 rounded-2xl border border-white/[0.12] bg-zinc-900/90 p-1.5 shadow-2xl shadow-black/60 backdrop-blur-xl"
      >
        <span className="flex h-10 items-center gap-2 pl-3 pr-2 text-sm font-semibold tabular-nums sm:h-9">
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-sky-400 px-1.5 text-[11px] font-bold text-black">
            {selectedCount}
          </span>
          selected
        </span>

        <span className="mx-1 hidden h-5 w-px bg-white/10 sm:block" aria-hidden="true" />

        <button type="button" onClick={onEmail} className={action}>
          <Mail className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Email
        </button>

        <PopoverMenu
          label="Set status for selected leads"
          triggerClassName={action}
          triggerContent={
            <>
              <CircleDot className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Status
              <ChevronDown className="h-3.5 w-3.5 opacity-50" aria-hidden="true" />
            </>
          }
          items={STATUS_ORDER.map((key) => ({
            key,
            text: STATUS_META[key].label,
            label: STATUS_META[key].label,
            icon: <span className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_META[key].dot)} aria-hidden="true" />,
          }))}
          onSelect={(key) => onApply("status", key)}
        />

        {agents.length > 0 && (
          <PopoverMenu
            label="Assign selected leads to an agent"
            triggerClassName={action}
            triggerContent={
              <>
                <UserPlus className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                Assign
                <ChevronDown className="h-3.5 w-3.5 opacity-50" aria-hidden="true" />
              </>
            }
            items={agents.map((a) => ({
              key: a.user_id,
              text: a.full_name || a.user_id,
              label: a.full_name || a.user_id,
            }))}
            onSelect={(id) => onApply("assign", id)}
          />
        )}

        <button
          type="button"
          onClick={onDelete}
          className={cn(action, "text-red-300 hover:bg-red-500/15 hover:text-red-200")}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Delete
        </button>

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
