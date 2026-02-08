import { createAdminClient } from "@/lib/supabase/server";
import { AgentsList, type AgentData } from "@/components/admin/agents/AgentsList";

export const dynamic = "force-dynamic";

export default async function AdminAgentsPage() {
  const supabase = createAdminClient();

  // Fetch agents with profile info and city
  const [agentsRes, assignmentsRes] = await Promise.all([
    supabase
      .from("agents")
      .select(`
        user_id,
        status,
        commission_rate,
        city_id,
        profiles:user_id (full_name, phone),
        cities:city_id (name)
      `)
      .order("created_at", { ascending: false }),
    supabase
      .from("agent_assignments")
      .select("agent_user_id, status"),
  ]);

  // Build per-agent assignment stats
  const assignmentsByAgent = new Map<string, { assigned: number; converted: number }>();
  (assignmentsRes.data || []).forEach((a) => {
    const existing = assignmentsByAgent.get(a.agent_user_id) || {
      assigned: 0,
      converted: 0,
    };
    existing.assigned++;
    if (a.status === "accepted") {
      existing.converted++;
    }
    assignmentsByAgent.set(a.agent_user_id, existing);
  });

  const agents: AgentData[] = (agentsRes.data || []).map((a) => {
    const profiles = a.profiles as { full_name: string | null; phone: string | null } | { full_name: string | null; phone: string | null }[] | null;
    const profile = Array.isArray(profiles) ? profiles[0] : profiles;
    const cities = a.cities as { name: string } | { name: string }[] | null;
    const city = Array.isArray(cities) ? cities[0] : cities;
    const stats = assignmentsByAgent.get(a.user_id) || { assigned: 0, converted: 0 };

    return {
      user_id: a.user_id,
      full_name: profile?.full_name || null,
      phone: profile?.phone || null,
      city_name: city?.name || null,
      status: a.status as "active" | "paused",
      commission_rate: a.commission_rate,
      assigned_count: stats.assigned,
      converted_count: stats.converted,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Agents</h1>
        <p className="text-muted-foreground">
          Manage agents, view performance, and toggle availability
        </p>
      </div>

      <AgentsList agents={agents} />
    </div>
  );
}
