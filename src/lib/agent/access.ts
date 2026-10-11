import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssignmentStatus, LeadStatus } from "@/types/database";

/**
 * Assignment states that give an agent access to a lead — the same set the
 * RLS policies use (leads_agent_read_assigned / _update_assigned,
 * lead_events/lead_targets_agent_read_assigned). declined and reassigned rows
 * are history, not access: the agent portal reads with the service role, so
 * it has to apply this filter itself.
 */
export const ACTIVE_ASSIGNMENT_STATUSES = ["assigned", "accepted"] as const satisfies readonly AssignmentStatus[];

/** leads.status CHECK constraint (001_schema.sql). */
const LEAD_STATUSES = ["new", "contacted", "touring", "applied", "leased", "lost"] as const satisfies readonly LeadStatus[];

export function isLeadStatus(value: unknown): value is LeadStatus {
  return typeof value === "string" && (LEAD_STATUSES as readonly string[]).includes(value);
}

/**
 * The agent's current assignment on a lead, or null when they have none in an
 * active state. Called by the lead page AND by each of its server actions —
 * actions are public POST endpoints, and the assignment may have been
 * declined or reassigned since the page rendered.
 */
export async function getActiveAssignment(
  supabase: SupabaseClient,
  leadId: string,
  agentUserId: string
): Promise<{ id: string; status: string } | null> {
  const { data, error } = await supabase
    .from("agent_assignments")
    .select("id, status")
    .eq("lead_id", leadId)
    .eq("agent_user_id", agentUserId)
    .in("status", [...ACTIVE_ASSIGNMENT_STATUSES])
    .order("assigned_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Agent assignment lookup error:", error.message);
    return null;
  }
  return data;
}
