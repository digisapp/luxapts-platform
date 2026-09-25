"use client";

import { SafeImage } from "@/components/ui/SafeImage";
import Link from "next/link";
import { Building2, ChevronRight, X } from "lucide-react";
import { formatPrice } from "@/lib/utils";

interface MapPreviewCardProps {
  href: string;
  name: string;
  neighborhood?: string | null;
  imageUrl?: string | null;
  /** The building's "from" rent — the same number its list card and pin quote */
  price: number | null;
  unitCount: number;
  bedsLabel?: string | null;
  onClose: () => void;
}

/**
 * The card a tapped map pin opens on touch screens: enough to decide whether
 * the building is worth a look, and one tap through to it.
 */
export function MapPreviewCard({
  href,
  name,
  neighborhood,
  imageUrl,
  price,
  unitCount,
  bedsLabel,
  onClose,
}: MapPreviewCardProps) {
  const details = [bedsLabel, unitCount > 1 ? `${unitCount} units` : null].filter(Boolean).join(" · ");

  return (
    <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.1] bg-zinc-950/95 shadow-2xl shadow-black/60 backdrop-blur-xl">
      <Link href={href} className="flex items-stretch gap-3 p-2 pr-3 active:bg-white/[0.04]">
        <div className="relative h-[88px] w-[88px] shrink-0 overflow-hidden rounded-xl bg-white/[0.04]">
          {imageUrl ? (
            <SafeImage src={imageUrl} alt={name} fill sizes="88px" className="object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <Building2 className="h-8 w-8 text-white/20" />
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center py-1">
          <p className="truncate pr-7 font-semibold text-white">{name}</p>
          {neighborhood && <p className="truncate pr-7 text-xs text-white/50">{neighborhood}</p>}
          <p className="mt-1 text-white">
            {price !== null ? (
              <>
                {unitCount > 1 && <span className="text-xs text-white/60">From </span>}
                <span className="text-base font-bold">{formatPrice(price)}</span>
                <span className="text-xs text-white/60">/mo</span>
              </>
            ) : (
              <span className="text-sm text-white/60">Contact for pricing</span>
            )}
          </p>
          {details && <p className="truncate text-xs text-white/50">{details}</p>}
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 self-center text-white/40" aria-hidden="true" />
      </Link>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close preview"
        className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-white/50 transition-colors hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
