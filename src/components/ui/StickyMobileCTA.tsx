"use client";

import { Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScheduleTourModal } from "@/components/forms/ScheduleTourModal";
import { formatPrice } from "@/lib/utils";

interface StickyMobileCTAProps {
  buildingId: string;
  buildingName: string;
  citySlug: string;
  price?: number;
}

export function StickyMobileCTA({
  buildingId,
  buildingName,
  citySlug,
  price,
}: StickyMobileCTAProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 lg:hidden">
      <div className="bg-background/95 backdrop-blur-lg border-t border-border px-4 py-3 safe-area-pb">
        <div className="flex items-center justify-between gap-4">
          {price && (
            <div className="flex-shrink-0">
              <p className="text-xs text-muted-foreground">From</p>
              <p className="text-lg font-bold">{formatPrice(price)}<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
            </div>
          )}
          <ScheduleTourModal
            buildingId={buildingId}
            buildingName={buildingName}
            citySlug={citySlug}
            trigger={
              <Button size="lg" className="flex-1 gap-2">
                <Calendar className="h-4 w-4" />
                Schedule Tour
              </Button>
            }
          />
        </div>
      </div>
    </div>
  );
}
