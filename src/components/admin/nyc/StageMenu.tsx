"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { PopoverMenu } from "@/components/admin/leads/PopoverMenu";
import { orderedStages, stageMeta } from "@/lib/crm/stages";

interface StageMenuProps {
  stage: string;
  /** Stages present in the book, so imported custom ones can be chosen too. */
  present: string[];
  onChange: (stage: string) => void;
  /** Accessible name prefix, e.g. the contact's name. */
  who: string;
  size?: "sm" | "md";
  disabled?: boolean;
}

export function StageMenu({ stage, present, onChange, who, size = "sm", disabled }: StageMenuProps) {
  const meta = stageMeta(stage);
  const stages = orderedStages(present);
  return (
    <PopoverMenu
      label={`Stage for ${who}: ${meta.label}`}
      triggerTitle={stage === meta.label ? "Change stage" : `${stage} — change stage`}
      disabled={disabled}
      triggerClassName={cn(
        "inline-flex items-center gap-2 rounded-full border pl-3 pr-2 text-xs font-medium transition-[filter] hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 disabled:opacity-60",
        size === "sm" ? "h-9 w-[8.75rem] lg:h-8" : "h-10 min-w-[9.5rem] text-sm",
        meta.pill
      )}
      triggerContent={
        <>
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", meta.dot)} aria-hidden="true" />
          <span className="flex-1 truncate text-left">{meta.label}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
        </>
      }
      items={stages.map((s) => ({
        key: s.value,
        text: s.label,
        label: s.label === s.value ? s.label : (
          <span title={s.value}>{s.label}</span>
        ),
        checked: s.value === stage,
        icon: <span className={cn("h-2 w-2 shrink-0 rounded-full", s.dot)} aria-hidden="true" />,
      }))}
      onSelect={(key) => {
        if (key !== stage) onChange(key);
      }}
    />
  );
}
