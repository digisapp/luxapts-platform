"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, MapPin, Bed, Bath, Sparkles } from "lucide-react";
import { formatPrice } from "@/lib/utils";

interface SimilarListing {
  id: string;
  name: string;
  address: string;
  neighborhood: string;
  image?: string;
  minPrice: number;
  minBeds: number;
  maxBeds: number;
  unitCount: number;
}

interface SimilarListingsProps {
  buildingId: string;
  citySlug: string;
  neighborhoodSlug?: string;
  priceRange?: { min: number; max: number };
  className?: string;
}

export function SimilarListings({
  buildingId,
  citySlug,
  neighborhoodSlug,
  priceRange,
  className = "",
}: SimilarListingsProps) {
  const [listings, setListings] = useState<SimilarListing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSimilar() {
      try {
        const params = new URLSearchParams({
          buildingId,
          citySlug,
          ...(neighborhoodSlug && { neighborhoodSlug }),
          ...(priceRange && { minPrice: priceRange.min.toString() }),
          ...(priceRange && { maxPrice: priceRange.max.toString() }),
        });

        const res = await fetch(`/api/similar-listings?${params}`);
        if (res.ok) {
          const data = await res.json();
          setListings(data.listings || []);
        }
      } catch (error) {
        console.error("Error fetching similar listings:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchSimilar();
  }, [buildingId, citySlug, neighborhoodSlug, priceRange]);

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4" />
            Similar Buildings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3 animate-pulse">
                <div className="w-16 h-16 rounded-md bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (listings.length === 0) {
    return null;
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4" />
          Similar Buildings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {listings.map((listing) => (
          <Link
            key={listing.id}
            href={`/buildings/${listing.id}`}
            className="group flex gap-3 rounded-lg border p-2 hover:bg-muted/50 transition-colors"
          >
            <div className="relative w-16 h-16 rounded-md overflow-hidden bg-muted flex-shrink-0">
              {listing.image ? (
                <Image
                  src={listing.image}
                  alt={listing.name}
                  fill
                  className="object-cover"
                  sizes="64px"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Building2 className="h-6 w-6 text-muted-foreground/30" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate group-hover:text-primary transition-colors">
                {listing.name}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {listing.neighborhood}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs font-medium">
                  From {formatPrice(listing.minPrice)}/mo
                </span>
                <Badge variant="secondary" className="text-xs px-1.5 py-0">
                  {listing.unitCount} {listing.unitCount === 1 ? "unit" : "units"}
                </Badge>
              </div>
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
