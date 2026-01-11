"use client";

import Link from "next/link";
import Image from "next/image";
import { useRecentlyViewed } from "@/hooks/useRecentlyViewed";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, MapPin, X, Clock, Bed, Bath } from "lucide-react";
import { formatPrice } from "@/lib/utils";

interface RecentlyViewedProps {
  currentBuildingId?: string;
  className?: string;
}

export function RecentlyViewed({ currentBuildingId, className = "" }: RecentlyViewedProps) {
  const { items, removeItem, clearAll, isLoaded } = useRecentlyViewed();

  // Filter out current building and limit display
  const displayItems = items
    .filter((item) => item.id !== currentBuildingId)
    .slice(0, 4);

  if (!isLoaded || displayItems.length === 0) {
    return null;
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" />
            Recently Viewed
          </CardTitle>
          {items.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={clearAll}
            >
              Clear all
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {displayItems.map((item) => (
          <Link
            key={item.id}
            href={`/buildings/${item.id}`}
            className="group flex gap-3 rounded-lg border p-2 hover:bg-muted/50 transition-colors"
          >
            <div className="relative w-16 h-16 rounded-md overflow-hidden bg-muted flex-shrink-0">
              {item.image ? (
                <Image
                  src={item.image}
                  alt={item.name}
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
                {item.name}
              </p>
              {item.neighborhood && (
                <p className="text-xs text-muted-foreground truncate">
                  {item.neighborhood}
                </p>
              )}
              <div className="flex items-center gap-2 mt-1">
                {item.price && (
                  <span className="text-xs font-medium">
                    {formatPrice(item.price)}/mo
                  </span>
                )}
                {item.beds !== undefined && (
                  <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                    <Bed className="h-3 w-3" />
                    {item.beds === 0 ? "Studio" : item.beds}
                  </span>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.preventDefault();
                removeItem(item.id);
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
