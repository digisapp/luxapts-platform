"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Facet } from "@/lib/crm/types";

interface FacetPickerProps {
  /** Filter name, e.g. "Tag". */
  label: string;
  value: string | undefined;
  options: Facet[];
  onChange: (value: string | undefined) => void;
  /** Extra choices above the data values, e.g. "Unassigned". */
  special?: { value: string; label: string }[];
  /** How to show a value (defaults to the value itself). */
  display?: (value: string) => string;
}

/**
 * A filter button with a searchable dropdown of values and their counts.
 * PopoverMenu suits a handful of fixed choices; tags run into the
 * thousands (most are listing addresses), so this one filters as you type.
 */
export function FacetPicker({ label, value, options, onChange, special = [], display = (v) => v }: FacetPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    function onPointer(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer, true);
    return () => document.removeEventListener("pointerdown", onPointer, true);
  }, [open]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? options.filter((o) => display(o.value).toLowerCase().includes(q)) : options;
    return list.slice(0, 200);
  }, [options, query, display]);

  function choose(next: string | undefined) {
    onChange(next);
    setOpen(false);
    setQuery("");
  }

  const selectedLabel =
    value === undefined ? null : (special.find((s) => s.value === value)?.label ?? display(value));

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        className={cn(
          "inline-flex h-11 max-w-[16rem] items-center gap-2 rounded-lg border px-3.5 text-sm transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 md:h-10",
          value !== undefined ? "border-sky-400/30 bg-sky-400/10 text-sky-100" : "border-white/10 bg-white/[0.03]"
        )}
      >
        <span className="truncate">
          {selectedLabel ? (
            <>
              <span className="text-sky-200/70">{label}:</span> {selectedLabel}
            </>
          ) : (
            label
          )}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1.5 w-72 max-w-[calc(100vw-2rem)] animate-pop-in rounded-xl border border-white/10 bg-zinc-900/95 p-1 shadow-2xl shadow-black/60 backdrop-blur-xl"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setOpen(false);
            }
          }}
        >
          {options.length > 8 && (
            <div className="relative p-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && matches[0]) choose(matches[0].value);
                }}
                placeholder={`Find a ${label.toLowerCase()}`}
                aria-label={`Find a ${label.toLowerCase()}`}
                className="h-9 w-full rounded-lg border border-white/10 bg-white/[0.04] pl-8 pr-2 text-sm placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
              />
            </div>
          )}
          <ul id={listId} role="listbox" aria-label={label} className="max-h-72 overflow-y-auto overscroll-contain">
            <li>
              <button
                type="button"
                role="option"
                aria-selected={value === undefined}
                onClick={() => choose(undefined)}
                className="flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm text-muted-foreground hover:bg-white/[0.08] hover:text-foreground"
              >
                <span className="flex-1">Any {label.toLowerCase()}</span>
                {value === undefined && <Check className="h-4 w-4" aria-hidden="true" />}
              </button>
            </li>
            {special.map((s) => (
              <li key={s.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={value === s.value}
                  onClick={() => choose(s.value)}
                  className="flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm hover:bg-white/[0.08]"
                >
                  <span className="flex-1 italic">{s.label}</span>
                  {value === s.value && <Check className="h-4 w-4" aria-hidden="true" />}
                </button>
              </li>
            ))}
            {matches.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={value === o.value}
                  onClick={() => choose(o.value)}
                  className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-white/[0.08]"
                >
                  <span className="min-w-0 flex-1 break-words">{display(o.value)}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{o.count.toLocaleString()}</span>
                  {value === o.value && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
                </button>
              </li>
            ))}
            {matches.length === 0 && (
              <li className="px-2.5 py-3 text-sm text-muted-foreground">No {label.toLowerCase()} matches “{query}”.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
