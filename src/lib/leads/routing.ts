import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Auto-assign an agent to a lead using load-balanced round-robin.
 *
 * Strategy: among all active agents for the city, pick the one with the
 * fewest currently active assignments. Ties broken by least-recently assigned.
 * If no agents are active in the city, returns null (admin assigns manually).
 *
 * Returns the assigned agent_user_id, or null if none available.
 */
export async function autoAssignAgent(
  supabase: SupabaseClient,
  leadId: string,
  cityId: string
): Promise<string | null> {
  // 1. Get active agents in this city
  const { data: agents, error: agentsError } = await supabase
    .from("agents")
    .select("user_id")
    .eq("city_id", cityId)
    .eq("status", "active");

  if (agentsError || !agents || agents.length === 0) return null;

  const agentIds = agents.map((a) => a.user_id);

  // 2. Count active assignments per agent and find the most recent assignment date
  const { data: activeAssignments } = await supabase
    .from("agent_assignments")
    .select("agent_user_id, assigned_at")
    .in("agent_user_id", agentIds)
    .in("status", ["assigned", "accepted"]);

  // Build per-agent load map
  const loadMap: Record<string, { count: number; lastAssigned: string }> = {};
  for (const agentId of agentIds) {
    loadMap[agentId] = { count: 0, lastAssigned: "1970-01-01T00:00:00Z" };
  }
  for (const row of activeAssignments || []) {
    const entry = loadMap[row.agent_user_id];
    if (!entry) continue;
    entry.count++;
    if (row.assigned_at > entry.lastAssigned) {
      entry.lastAssigned = row.assigned_at;
    }
  }

  // 3. Pick agent with fewest active assignments (least-recently-assigned breaks ties)
  const chosen = agentIds.sort((a, b) => {
    const la = loadMap[a];
    const lb = loadMap[b];
    if (la.count !== lb.count) return la.count - lb.count;
    // Tie-break: prefer the agent who was assigned least recently
    return la.lastAssigned < lb.lastAssigned ? -1 : 1;
  })[0];

  if (!chosen) return null;

  // 4. Create the assignment
  const { error: assignError } = await supabase
    .from("agent_assignments")
    .insert({
      lead_id: leadId,
      agent_user_id: chosen,
      status: "assigned",
      reason: "auto_routed",
    });

  if (assignError) {
    console.error("Auto-assign insert error:", assignError);
    return null;
  }

  return chosen;
}
