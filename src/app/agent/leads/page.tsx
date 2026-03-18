import { createAdminClient } from "@/lib/supabase/server";
import { getAgentUserId } from "@/lib/agent/auth";
import { redirect } from "next/navigation";
import { AgentLeadsList } from "@/components/agent/leads/AgentLeadsList";

export const dynamic = "force-dynamic";

export default async function AgentLeadsPage() {
  const agentId = await getAgentUserId();
  if (!agentId) redirect("/");

  const supabase = createAdminClient();

  const { data: assignments } = await supabase
    .from("agent_assignments")
    .select(`
      id, status, assigned_at,
      leads:lead_id (
        id, name, user_email, user_phone, status, budget_min, budget_max,
        beds, move_in_date, source, created_at, notes,
        cities:city_id (name, slug)
      )
    `)
    .eq("agent_user_id", agentId)
    .order("assigned_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">My Leads</h1>
        <p className="text-muted-foreground">
          Manage your assigned leads and track progress
        </p>
      </div>

      <AgentLeadsList assignments={assignments || []} />
    </div>
  );
}
