import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { SafeImage } from "@/components/ui/SafeImage";
import { cn, formatPrice } from "@/lib/utils";

/**
 * One available unit, already resolved on the server (price verified,
 * availability label computed against today) so the client list never
 * re-derives dates and cannot hydrate differently.
 */
export interface UnitRowData {
  id: string;
  href: string;
  unitNumber: string | null;
  planName: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  /** Verified rent only; null renders "Contact for pricing". */
  price: number | null;
  /** Raw DATE column, for JSON-LD */
  availableOn: string | null;
  availableNow: boolean;
  /** "Available now" or "From Oct 8" */
  availableLabel: string;
  photoUrl: string | null;
  photoCount: number;
}

export function bedsLabel(beds: number | null): string | null {
  if (beds == null) return null;
  return beds === 0 ? "Studio" : `${beds} bd`;
}

export function unitSpecs(u: Pick<UnitRowData, "beds" | "baths" | "sqft">): string {
  return [
    bedsLabel(u.beds),
    u.baths != null ? `${u.baths} ba` : null,
    u.sqft ? `${u.sqft.toLocaleString()} sq ft` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Compact row; the whole row is one plain <a> — a single large tap target
 * for phones and a single crawlable link per unit.
 *
 * Phones: two lines — unit + plan | price, specs | availability.
 * sm and up: one line — unit + plan, specs, availability, price.
 */
export function UnitRow({ unit, hidden = false }: { unit: UnitRowData; hidden?: boolean }) {
  // Scraped buildings without unit numbers name the row by plan, then layout
  const label = unit.unitNumber
    ? `Unit ${unit.unitNumber}`
    : unit.planName ?? (unit.beds === 0 ? "Studio" : unit.beds != null ? `${unit.beds} Bed` : "Unit");
  const chip = unit.unitNumber ? unit.planName : null;
  return (
    <li className={cn(hidden && "hidden")}>
      <Link
        href={unit.href}
        className="group flex min-h-16 items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.015] px-3 py-2.5 outline-none transition-colors hover:border-white/15 hover:bg-white/[0.04] focus-visible:border-white/30 focus-visible:ring-2 focus-visible:ring-white/20 sm:px-4"
      >
        {unit.photoUrl && (
          <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-white/[0.04] sm:w-14">
            <SafeImage src={unit.photoUrl} alt="" fill sizes="56px" className="object-cover" />
            {unit.photoCount > 1 && (
              <span className="absolute bottom-0.5 right-0.5 rounded bg-black/75 px-1 text-xs font-medium leading-4 text-white">
                {unit.photoCount}
              </span>
            )}
          </div>
        )}

        <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 [grid-template-areas:'unit_price''specs_avail'] sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_7.5rem_6.5rem] sm:gap-x-4 sm:[grid-template-areas:'unit_specs_avail_price']">
          <div className="flex min-w-0 items-center gap-2 [grid-area:unit]">
            <span className="truncate font-medium text-white">{label}</span>
            {chip && (
              <span className="max-w-[7rem] shrink-0 truncate rounded-md border border-white/10 px-1.5 py-px text-xs font-medium text-white/60">
                {chip}
              </span>
            )}
          </div>

          <span className="min-w-0 text-[13px] leading-snug text-muted-foreground [grid-area:specs] sm:truncate sm:text-sm">
            {unitSpecs(unit)}
          </span>

          <span
            className={cn(
              "whitespace-nowrap text-right text-[13px] [grid-area:avail] sm:text-left sm:text-sm",
              unit.availableNow ? "text-emerald-400" : "text-muted-foreground"
            )}
          >
            {unit.availableLabel}
          </span>

          <span className="whitespace-nowrap text-right [grid-area:price]">
            {unit.price ? (
              <span className="font-semibold tabular-nums text-white">
                {formatPrice(unit.price)}
                <span className="text-xs font-normal text-muted-foreground">/mo</span>
              </span>
            ) : (
              <span className="text-xs text-muted-foreground sm:text-sm">Contact for pricing</span>
            )}
          </span>
        </div>

        <ChevronRight
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-white/30 transition-colors group-hover:text-white/70"
        />
      </Link>
    </li>
  );
}
