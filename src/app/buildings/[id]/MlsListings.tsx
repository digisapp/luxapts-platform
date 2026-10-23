"use client";

import { ContactLeasingModal } from "@/components/forms/ContactLeasingModal";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";

export interface MlsListingView {
  listingId: string | null;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  unit: string | null;
  availableDate: string | null;
  furnished: string | null;
  photo: string | null;
  office: string | null;
}

/**
 * Condo units for rent in this building from the MLS (IDX). Each listing
 * names its listing brokerage, and the block ends with the MLS disclaimer and
 * when the data was last refreshed, as IDX display rules require.
 */
export function MlsListings({
  buildingId,
  buildingName,
  citySlug,
  listings,
  updatedLabel,
}: {
  buildingId: string;
  buildingName: string;
  citySlug: string;
  listings: MlsListingView[];
  updatedLabel: string | null;
}) {
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border dark:divide-white/[0.06]">
        {listings.map((l, i) => (
          <li key={l.listingId ?? i} className="flex gap-3 py-3 first:pt-0">
            {l.photo ? (
              // eslint-disable-next-line @next/next/no-img-element -- MLS media host varies per listing
              <img
                src={l.photo}
                alt={`${buildingName}${l.unit ? ` unit ${l.unit}` : ""}`}
                loading="lazy"
                className="h-20 w-28 shrink-0 rounded-md object-cover"
              />
            ) : (
              <div className="h-20 w-28 shrink-0 rounded-md bg-muted" aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="font-semibold">
                  {l.unit ? `Unit ${l.unit}` : "Unit"}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {[
                      l.beds === 0 ? "Studio" : l.beds != null ? `${l.beds} bed` : null,
                      l.baths != null ? `${l.baths} bath` : null,
                      l.sqft ? `${l.sqft.toLocaleString()} sq ft` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </p>
                {l.price != null && (
                  <p className="whitespace-nowrap font-semibold tabular-nums">
                    {formatPrice(l.price)}
                    <span className="text-sm font-normal text-muted-foreground">/mo</span>
                  </p>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {[
                  l.availableDate ? `Available ${l.availableDate}` : null,
                  l.furnished && /^furnished$/i.test(l.furnished) ? "Furnished" : null,
                  l.listingId ? `MLS ${l.listingId}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {l.office && <p className="mt-0.5 text-xs text-muted-foreground">Listing courtesy of {l.office}</p>}
              <ContactLeasingModal
                buildingId={buildingId}
                buildingName={buildingName}
                citySlug={citySlug}
                context={`MLS ${l.listingId ?? "?"}${l.unit ? `, unit ${l.unit}` : ""}${l.price ? `, ${formatPrice(l.price)}/mo` : ""}`}
                trigger={
                  <Button variant="link" className="h-auto p-0 text-sm">
                    Ask about this unit
                  </Button>
                }
              />
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Listings provided by the MIAMI REALTORS® MLS through IDX. Information is deemed reliable but not guaranteed and
        may have changed since it was listed. Each listing is courtesy of the brokerage named with it.
        {updatedLabel ? ` Last updated ${updatedLabel}.` : ""}
      </p>
    </div>
  );
}
