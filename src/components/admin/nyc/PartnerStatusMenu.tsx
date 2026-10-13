"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { PopoverMenu } from "@/components/admin/leads/PopoverMenu";
import { PARTNER_STATUSES, partnerMeta } from "@/lib/crm/recruiting";

interface PartnerStatusMenuProps {
  status: string | null;
  who: string;
  onChange: (status: string) => void;
  size?: "sm" | "md";
}

/** A broker's recruiting status, where a renter has a stage. */
export function PartnerStatusMenu({ status, who, onChange, size = "sm" }: PartnerStatusMenuProps) {
  const meta = partnerMeta(status);
  return (
    <PopoverMenu
      label={`Recruiting status for ${who}: ${meta.label}`}
      triggerTitle="Change recruiting status"
      triggerClassName={cn(
        "inline-flex items-center gap-2 rounded-full border pl-3 pr-2 text-xs font-medium transition-[filter] hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25",
        size === "sm" ? "h-9 w-[10rem] lg:h-8" : "h-10 min-w-[10rem] text-sm",
        meta.pill
      )}
      triggerContent={
        <>
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", meta.dot)} aria-hidden="true" />
          <span className="flex-1 truncate text-left">{meta.label}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
        </>
      }
      items={PARTNER_STATUSES.map((s) => ({
        key: s.value,
        text: s.label,
        label: s.label,
        checked: s.value === meta.value,
        icon: <span className={cn("h-2 w-2 shrink-0 rounded-full", s.dot)} aria-hidden="true" />,
      }))}
      onSelect={(key) => {
        if (key !== meta.value) onChange(key);
      }}
    />
  );
}
