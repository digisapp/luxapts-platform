import Link from "next/link";
import { SafeImage } from "@/components/ui/SafeImage";
import { ArrowRight, Building2, MapPin } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { buildingPath } from "@/lib/seo/urls";

export interface BuildingCardBuilding {
  id: string;
  slug?: string | null;
  name: string;
  address_1?: string | null;
  zip?: string | null;
  description?: string | null;
}

/**
 * The listing card used by every server-rendered collection page (city,
 * neighborhood, bedroom facet). Shared so the crawlable grids stay identical
 * and so the slug URL is applied in one place rather than at each call site.
 *
 * Visually it mirrors the home page's "most availability" cards (rounded-2xl,
 * hairline border, navy/glass pills over the photo, text ≥12px) so a building
 * looks the same wherever it is listed.
 */
export function BuildingCard({
  building,
  heroImage,
  neighborhoodName,
  availableUnits,
  minPrice,
  /** Overrides the default description line, e.g. "3 two-bedrooms available". */
  detailLine,
  imageSizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw",
  /** Above-the-fold card: load its photo eagerly at high priority (LCP). */
  eager = false,
}: {
  building: BuildingCardBuilding;
  heroImage?: string | null;
  neighborhoodName?: string | null;
  availableUnits?: number;
  minPrice?: number | null;
  detailLine?: string | null;
  imageSizes?: string;
  eager?: boolean;
}) {
  const detail = detailLine || building.description;

  return (
    <Link
      href={buildingPath(building)}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(20,33,43,0.04)] transition-all duration-300 hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-[0_12px_32px_-12px_rgba(20,33,43,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-white/[0.08] dark:bg-white/[0.03] dark:shadow-none dark:hover:translate-y-0 dark:hover:border-white/[0.18] dark:hover:bg-white/[0.05] dark:hover:shadow-none"
    >
      <div className="relative h-44 shrink-0 overflow-hidden bg-muted sm:h-52 dark:bg-white/[0.02]">
        {heroImage ? (
          <>
            <SafeImage
              src={heroImage}
              // Descriptive alt beats the bare building name for image search
              // and for anyone on a screen reader.
              alt={`${building.name}${
                neighborhoodName ? ` in ${neighborhoodName}` : ""
              } — apartments for rent`}
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-105"
              sizes={imageSizes}
              loading={eager ? "eager" : undefined}
              fetchPriority={eager ? "high" : undefined}
            />
            <div
              className="pointer-events-none absolute inset-0 hidden bg-gradient-to-t from-black/25 via-transparent to-transparent [img~&]:block dark:block dark:from-black/50"
              aria-hidden="true"
            />
          </>
        ) : (
          // Honest, quiet placeholder: no stock photo, no tiny caption text.
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-foreground/[0.03] via-transparent to-transparent dark:from-white/[0.05] dark:to-cyan-500/[0.04]"
            aria-hidden="true"
          >
            <Building2 className="h-10 w-10 text-foreground/20 dark:text-white/20" strokeWidth={1.25} />
            <span className="text-xs text-muted-foreground dark:text-white/35">Photos coming soon</span>
          </div>
        )}
        {neighborhoodName && (
          <span className="absolute left-3 top-3 max-w-[60%] truncate rounded-full bg-inverse/75 px-2.5 py-1 text-xs text-white/90 backdrop-blur-sm dark:bg-inverse/60">
            {neighborhoodName}
          </span>
        )}
        {!!availableUnits && availableUnits > 0 && (
          <span className="absolute right-3 top-3 rounded-full bg-inverse/75 px-2.5 py-1 text-xs font-medium text-emerald-300 ring-1 ring-emerald-400/30 backdrop-blur-sm dark:bg-inverse/60">
            {availableUnits} available
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="mb-1 text-xl font-medium leading-tight text-foreground dark:text-lg">{building.name}</h3>
        {building.address_1 && (
          <p className="flex items-center gap-1 text-sm text-muted-foreground dark:text-white/70">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {building.address_1}
              {building.zip && ` ${building.zip}`}
            </span>
          </p>
        )}
        {detail && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{detail}</p>}
        <div className="mt-auto flex items-center justify-between pt-4">
          {minPrice ? (
            <p className="text-base text-muted-foreground dark:text-white/70">
              From <span className="text-lg font-semibold text-foreground dark:text-base">{formatPrice(minPrice)}</span>/mo
            </p>
          ) : (
            <p className="text-base text-muted-foreground dark:text-white/70">Contact for pricing</p>
          )}
          <ArrowRight
            className="h-4 w-4 text-foreground/40 transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-link dark:group-hover:text-white"
            aria-hidden="true"
          />
        </div>
      </div>
    </Link>
  );
}
