"use client";

import { Bookmark, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PopoverMenu } from "@/components/admin/leads/PopoverMenu";
import { LIST_GROUPS, type CrmFilters, type CrmSort } from "@/lib/crm/filters";

export interface NavList {
  key: string;
  label: string;
  hint: string;
  filters: CrmFilters;
  sort?: CrmSort;
  /** Built-in group, or "saved" for the admin's own lists. */
  group: "today" | "reengage" | "book" | "saved";
}

interface ListNavProps {
  lists: NavList[];
  counts: Record<string, number>;
  activeKey: string | undefined;
  onChoose: (list: NavList) => void;
  onDelete: (list: NavList) => void;
}

/** Counts that call for attention get an amber pill. */
const URGENT = new Set(["awaiting", "due"]);

function CountPill({ listKey, count, active }: { listKey: string; count: number | undefined; active: boolean }) {
  if (count === undefined || count < 0) return null;
  return (
    <span
      className={cn(
        "ml-auto shrink-0 rounded-full px-1.5 text-xs tabular-nums",
        URGENT.has(listKey) && count > 0
          ? "bg-amber-400/20 text-amber-100"
          : active
            ? "bg-white/[0.12] text-foreground"
            : "text-muted-foreground"
      )}
    >
      {count.toLocaleString()}
    </span>
  );
}

/** The lists as a grouped sidebar (wide screens). */
export function ListSidebar({ lists, counts, activeKey, onChoose, onDelete }: ListNavProps) {
  const groups = [
    ...LIST_GROUPS,
    ...(lists.some((l) => l.group === "saved") ? [{ key: "saved" as const, label: "My lists" }] : []),
  ];
  return (
    <nav aria-label="Lists" className="space-y-5">
      {groups.map((g) => (
        <div key={g.key}>
          <h2 className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</h2>
          <ul className="space-y-0.5">
            {lists
              .filter((l) => l.group === g.key)
              .map((l) => {
                const active = l.key === activeKey;
                return (
                  <li key={l.key} className="group/list relative">
                    <button
                      type="button"
                      onClick={() => onChoose(l)}
                      aria-current={active ? "true" : undefined}
                      title={l.hint}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25",
                        active ? "bg-white/[0.08] font-semibold text-foreground" : "text-foreground/80 hover:bg-white/[0.04]",
                        l.group === "saved" && "pr-9"
                      )}
                    >
                      {l.group === "saved" && <Bookmark className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
                      <span className="min-w-0 truncate">{l.label}</span>
                      <CountPill listKey={l.key} count={counts[l.key]} active={active} />
                    </button>
                    {l.group === "saved" && (
                      <button
                        type="button"
                        onClick={() => onDelete(l)}
                        aria-label={`Delete the list ${l.label}`}
                        title="Delete list"
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-red-300 focus-visible:opacity-100 group-hover/list:opacity-100"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** The lists as one dropdown (phones and narrow windows). */
export function ListPicker({ lists, counts, activeKey, onChoose }: Omit<ListNavProps, "onDelete">) {
  const active = lists.find((l) => l.key === activeKey);
  const count = active ? counts[active.key] : undefined;
  return (
    <PopoverMenu
      label={`List: ${active?.label ?? "Filtered"}`}
      triggerClassName="flex h-11 w-full items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3.5 text-left text-sm font-medium hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
      triggerContent={
        <>
          <span className="text-muted-foreground">List:</span>
          <span className="min-w-0 flex-1 truncate">{active?.label ?? "Filtered"}</span>
          {count !== undefined && count >= 0 && <span className="text-xs tabular-nums text-muted-foreground">{count.toLocaleString()}</span>}
          <ChevronDown className="h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
        </>
      }
      items={lists.map((l) => ({
        key: l.key,
        text: l.label,
        checked: l.key === activeKey,
        label: (
          <span className="flex items-center gap-2">
            {l.label}
            {counts[l.key] !== undefined && counts[l.key] >= 0 && (
              <span className={cn("text-xs tabular-nums", URGENT.has(l.key) && counts[l.key] > 0 ? "text-amber-200" : "text-muted-foreground")}>
                {counts[l.key].toLocaleString()}
              </span>
            )}
          </span>
        ),
      }))}
      onSelect={(key) => {
        const list = lists.find((l) => l.key === key);
        if (list) onChoose(list);
      }}
    />
  );
}
