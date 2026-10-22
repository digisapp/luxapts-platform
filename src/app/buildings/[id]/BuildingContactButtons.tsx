"use client";

import { ScheduleTourModal } from "@/components/forms/ScheduleTourModal";
import { ContactLeasingModal } from "@/components/forms/ContactLeasingModal";
import { ShareButton } from "@/components/ui/ShareButton";
import { Button } from "@/components/ui/button";
import { BellRing, Calendar, Mail } from "lucide-react";

interface BuildingContactButtonsProps {
  buildingId: string;
  buildingName: string;
  citySlug: string;
  leasingEmail?: string | null;
  /** The sidebar summary card has no room (or need) for a second Share. */
  showShare?: boolean;
  /** Leasing hasn't opened: nothing to tour yet, so the one action is first access. */
  preLeasing?: boolean;
}

export function BuildingContactButtons({
  buildingId,
  buildingName,
  citySlug,
  leasingEmail,
  showShare = true,
  preLeasing = false,
}: BuildingContactButtonsProps) {
  if (preLeasing) {
    return (
      <div className="flex gap-2.5">
        <ContactLeasingModal
          buildingId={buildingId}
          buildingName={buildingName}
          citySlug={citySlug}
          variant="first_access"
          trigger={
            <Button size="lg" className="flex-1 gap-2">
              <BellRing className="h-4 w-4" />
              Get first access
            </Button>
          }
        />
        {showShare && <ShareButton title={buildingName} className="h-12 rounded-lg px-5 text-base md:h-12" />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <ScheduleTourModal
        buildingId={buildingId}
        buildingName={buildingName}
        citySlug={citySlug}
        trigger={
          <Button size="lg" className="w-full gap-2">
            <Calendar className="h-4 w-4" />
            Schedule a Tour
          </Button>
        }
      />
      <div className="flex gap-2.5">
        <ContactLeasingModal
          buildingId={buildingId}
          buildingName={buildingName}
          citySlug={citySlug}
          leasingEmail={leasingEmail}
          trigger={
            <Button size="lg" variant="outline" className="flex-1 gap-2">
              <Mail className="h-4 w-4" />
              Contact
            </Button>
          }
        />
        {/* Same height and type size as Contact so the row reads as one control group */}
        {showShare && <ShareButton title={buildingName} className="h-12 rounded-lg px-5 text-base md:h-12" />}
      </div>
    </div>
  );
}
