"use client";

import { ScheduleTourModal } from "@/components/forms/ScheduleTourModal";
import { ContactLeasingModal } from "@/components/forms/ContactLeasingModal";
import { Button } from "@/components/ui/button";
import { Calendar, Mail } from "lucide-react";

interface BuildingContactButtonsProps {
  buildingId: string;
  buildingName: string;
  citySlug: string;
  leasingEmail?: string | null;
}

export function BuildingContactButtons({
  buildingId,
  buildingName,
  citySlug,
  leasingEmail,
}: BuildingContactButtonsProps) {
  return (
    <div className="flex flex-col gap-3">
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
      <ContactLeasingModal
        buildingId={buildingId}
        buildingName={buildingName}
        citySlug={citySlug}
        leasingEmail={leasingEmail}
        trigger={
          <Button size="lg" variant="outline" className="w-full gap-2">
            <Mail className="h-4 w-4" />
            Contact Leasing
          </Button>
        }
      />
    </div>
  );
}
