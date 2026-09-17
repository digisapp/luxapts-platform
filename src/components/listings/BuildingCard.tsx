import Link from "next/link";
import Image from "next/image";
import { ArrowRight, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ListingPlaceholder } from "@/components/ui/ListingPlaceholder";
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
}: {
  building: BuildingCardBuilding;
  heroImage?: string | null;
  neighborhoodName?: string | null;
  availableUnits?: number;
  minPrice?: number | null;
  detailLine?: string | null;
  imageSizes?: string;
}) {
  return (
    <Link href={buildingPath(building)}>
      <Card className="overflow-hidden hover:shadow-lg transition-shadow group h-full">
        <div className="relative h-52 overflow-hidden">
          {heroImage ? (
            <Image
              src={heroImage}
              // Descriptive alt beats the bare building name for image search
              // and for anyone on a screen reader.
              alt={`${building.name}${
                neighborhoodName ? ` in ${neighborhoodName}` : ""
              } — apartments for rent`}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-500"
              sizes={imageSizes}
            />
          ) : (
            <ListingPlaceholder seed={building.id} name={building.name} />
          )}
          {neighborhoodName && (
            <Badge className="absolute top-3 left-3 bg-black/60 text-white border-0">
              {neighborhoodName}
            </Badge>
          )}
          {!!availableUnits && availableUnits > 0 && (
            <Badge className="absolute top-3 right-3 bg-green-600">
              {availableUnits} available
            </Badge>
          )}
        </div>

        <CardContent className="p-4">
          <h3 className="font-semibold text-base leading-tight mb-1">{building.name}</h3>
          {building.address_1 && (
            <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1">
              <MapPin className="h-3 w-3 shrink-0" />
              {building.address_1}
              {building.zip && ` ${building.zip}`}
            </p>
          )}
          {(detailLine || building.description) && (
            <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
              {detailLine || building.description}
            </p>
          )}
          <div className="flex items-center justify-between">
            {minPrice ? (
              <div>
                <span className="text-xs text-muted-foreground">From </span>
                <span className="font-semibold text-sm">{formatPrice(minPrice)}</span>
                <span className="text-xs text-muted-foreground">/mo</span>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">Contact for pricing</span>
            )}
            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
