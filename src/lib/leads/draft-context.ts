import type { DraftContext } from "@/lib/ai-email";
import { buildingFactsFor, type LeadContext } from "./lead-context";

/** The AI draft's view of a lead: what they asked for and what their building publishes. */
export function draftContextFor(lead: LeadContext | null | undefined): DraftContext | null {
  if (!lead) return null;
  return {
    buildingFacts: buildingFactsFor(lead.domain),
    lead: {
      name: lead.name,
      building: lead.building,
      unitType: lead.unitType,
      moveIn: lead.moveIn,
      hasPhone: !!lead.phone,
    },
  };
}
