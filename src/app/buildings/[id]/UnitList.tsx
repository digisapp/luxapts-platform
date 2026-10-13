"use client";

import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { UnitRow, type UnitRowData } from "./UnitRow";

interface UnitListProps {
  /** Already sorted (cheapest first). */
  units: UnitRowData[];
  /** Rows shown before "Show all". */
  initialCount?: number;
}

type LayoutKey = "all" | number;

// 4+ bedrooms share one chip
function layoutOf(beds: number | null): number | null {
  if (beds == null) return null;
  return Math.min(beds, 4);
}

function layoutLabel(key: number): string {
  if (key === 0) return "Studio";
  return key >= 4 ? "4+ Bed" : `${key} Bed`;
}

/**
 * Every row is rendered into the HTML — the collapsed and filtered-out ones
 * are only `display:none` — so each unit link stays crawlable and works
 * without JavaScript's help.
 */
export function UnitList({ units, initialCount = 10 }: UnitListProps) {
  const [layout, setLayout] = useState<LayoutKey>("all");
  const [expanded, setExpanded] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const counts = new Map<number, number>();
  for (const u of units) {
    const key = layoutOf(u.beds);
    if (key != null) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const layouts = [...counts.keys()].sort((a, b) => a - b);

  const matches = (u: UnitRowData) => layout === "all" || layoutOf(u.beds) === layout;
  const matching = units.filter(matches).length;
  const collapsed = !expanded && matching > initialCount;

  const choose = (key: LayoutKey) => {
    setLayout(key);
    setExpanded(false);
  };

  const toggleExpanded = () => {
    // Collapsing 60 rows from the bottom of the list would leave the reader
    // stranded far below it; bring the list's top back into view.
    if (expanded && listRef.current && listRef.current.getBoundingClientRect().top < 0) {
      listRef.current.scrollIntoView({ block: "start" });
    }
    setExpanded((v) => !v);
  };

  let rank = 0;

  return (
    <div ref={listRef} className="scroll-mt-24">
      {layouts.length > 1 && (
        <div
          role="group"
          aria-label="Filter units by layout"
          className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0"
        >
          {(["all", ...layouts] as LayoutKey[]).map((key) => {
            const active = layout === key;
            const count = key === "all" ? units.length : counts.get(key) ?? 0;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => choose(key)}
                className={cn(
                  "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors sm:h-9",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground/80 hover:border-foreground/25 hover:text-foreground dark:border-white/10 dark:bg-white/[0.03] dark:text-white/80 dark:hover:border-white/25"
                )}
              >
                {key === "all" ? "All" : layoutLabel(key)}
                <span className={cn("tabular-nums", active ? "text-primary-foreground/60 dark:text-black/50" : "text-muted-foreground dark:text-foreground/40")}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {units.map((unit) => {
          const inLayout = matches(unit);
          const hidden = !inLayout || (collapsed && rank >= initialCount);
          if (inLayout) rank++;
          return <UnitRow key={unit.id} unit={unit} hidden={hidden} />;
        })}
      </ul>

      {matching > initialCount && (
        <button
          type="button"
          onClick={toggleExpanded}
          aria-expanded={expanded}
          className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-medium text-foreground/90 transition-colors hover:border-foreground/25 hover:text-link dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/25 dark:hover:bg-white/[0.06] dark:hover:text-foreground/90"
        >
          {expanded ? "Show fewer" : `Show all ${matching} units`}
          <ChevronDown className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} />
        </button>
      )}
    </div>
  );
}
