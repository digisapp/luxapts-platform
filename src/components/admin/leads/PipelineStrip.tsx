"use client";

import { cn } from "@/lib/utils";
import { STATUS_META, STATUS_ORDER } from "./lead-format";

interface PipelineStripProps {
  counts: Record<string, number>;
  active: string;
  onChange: (status: string) => void;
}

/**
 * The status filter drawn as the pipeline it is: every stage with its count,
 * and a bar showing where the leads sit. Replaces a row of plain tab pills.
 */
export function PipelineStrip({ counts, active, onChange }: PipelineStripProps) {
  const total = STATUS_ORDER.reduce((sum, s) => sum + (counts[s] || 0), 0);
  const cells = [
    { key: "", label: "All leads", count: total, dot: "bg-white/70", text: "text-foreground" },
    ...STATUS_ORDER.map((s) => ({
      key: s,
      label: STATUS_META[s].label,
      count: counts[s] || 0,
      dot: STATUS_META[s].dot,
      text: STATUS_META[s].text,
    })),
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.02] shadow-xl shadow-black/20">
      {/* Scrolls sideways inside its own box on phones; the page never does. */}
      <div className="flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Filter by status">
        {cells.map((c, i) => {
          const isActive = active === c.key;
          const share = total > 0 && c.key ? Math.round((c.count / total) * 100) : null;
          return (
            <button
              key={c.key || "all"}
              type="button"
              aria-pressed={isActive}
              onClick={() => onChange(c.key)}
              className={cn(
                "relative min-w-[6.5rem] flex-1 px-4 py-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/25 sm:px-5",
                i > 0 && "border-l border-white/[0.06]",
                isActive ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
              )}
            >
              <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", c.dot, c.count === 0 && c.key && "opacity-40")} aria-hidden="true" />
                <span className={cn(isActive && "text-foreground")}>{c.label}</span>
              </span>
              <span className="mt-1 flex items-baseline gap-2">
                <span
                  className={cn(
                    "text-2xl font-semibold tabular-nums tracking-tight",
                    c.count === 0 ? "text-white/25" : isActive ? "text-foreground" : "text-foreground/90"
                  )}
                >
                  {c.count}
                </span>
                {share !== null && c.count > 0 && (
                  <span className="text-[11px] tabular-nums text-muted-foreground">{share}%</span>
                )}
              </span>
              {isActive && (
                <span
                  aria-hidden="true"
                  className={cn("absolute inset-x-0 bottom-0 h-0.5", c.key ? STATUS_META[c.key].bar : "bg-white/70")}
                />
              )}
            </button>
          );
        })}
      </div>

      {total > 0 && (
        <div className="flex h-1 w-full gap-px bg-white/[0.04]" aria-hidden="true">
          {STATUS_ORDER.map((s) =>
            counts[s] ? (
              <span
                key={s}
                className={cn("h-full basis-0 transition-[flex-grow] duration-500", STATUS_META[s].bar, active && active !== s && "opacity-30")}
                style={{ flexGrow: counts[s] }}
              />
            ) : null
          )}
        </div>
      )}
    </div>
  );
}
