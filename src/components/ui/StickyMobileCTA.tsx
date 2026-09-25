"use client";

import { Calendar, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScheduleTourModal } from "@/components/forms/ScheduleTourModal";
import { openChat } from "@/lib/chat/open-chat";
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
    <div className="fixed bottom-0 left-0 right-0 z-30 lg:hidden">
      {/* Solid, not translucent: page text showed through behind the price. */}
      <div className="bg-background border-t border-border px-4 py-3 safe-area-pb">
        <div className="flex items-center justify-between gap-3">
          {price && (
            <div className="flex-shrink-0">
              <p className="text-xs text-muted-foreground">From</p>
              <p className="text-lg font-bold">{formatPrice(price)}<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
            </div>
          )}
          {/* The floating chat bubble is hidden on phones here; it used to sit
              on the end of the Schedule Tour button. */}
          <Button
            type="button"
            size="lg"
            variant="outline"
            onClick={openChat}
            aria-label="Ask Stacy about this building"
            className="h-11 w-11 flex-shrink-0 p-0"
          >
            <MessageCircle className="h-5 w-5" />
          </Button>
          <ScheduleTourModal
            buildingId={buildingId}
            buildingName={buildingName}
            citySlug={citySlug}
            trigger={
              <Button size="lg" className="h-11 flex-1 gap-2">
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
