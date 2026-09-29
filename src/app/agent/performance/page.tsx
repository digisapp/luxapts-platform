import { createAdminClient } from "@/lib/supabase/server";
import { getAgentUserId } from "@/lib/agent/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users, CheckCircle, XCircle, TrendingUp,
  Target, Clock, Award, BarChart3,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AgentPerformancePage() {
  const agentId = await getAgentUserId();
  if (!agentId) redirect("/");

  const supabase = createAdminClient();

  // Fetch all assignments and their leads
  const { data: assignments, error } = await supabase
    .from("agent_assignments")
    .select(`
      id, status, assigned_at,
      leads:lead_id (id, status, created_at)
    `)
    .eq("agent_user_id", agentId);

  if (error) {
    throw new Error(`Failed to load performance data: ${error.message}`);
  }

  const all = assignments || [];
  const total = all.length;
  const accepted = all.filter((a) => a.status === "accepted").length;
  const declined = all.filter((a) => a.status === "declined").length;
  const pending = all.filter((a) => a.status === "assigned").length;

  // Lead outcomes
  const leased = all.filter((a) => {
    const lead = (Array.isArray(a.leads) ? a.leads[0] : a.leads) as { status: string } | null;
    return lead?.status === "leased";
  }).length;

  const lost = all.filter((a) => {
    const lead = (Array.isArray(a.leads) ? a.leads[0] : a.leads) as { status: string } | null;
    return lead?.status === "lost";
  }).length;

  const touring = all.filter((a) => {
    const lead = (Array.isArray(a.leads) ? a.leads[0] : a.leads) as { status: string } | null;
    return lead?.status === "touring";
  }).length;

  const conversionRate = total > 0 ? Math.round((leased / total) * 100) : 0;
  const acceptRate = total > 0 ? Math.round((accepted / total) * 100) : 0;

  // Fetch agent profile for commission
  const { data: agent } = await supabase
    .from("agents")
    .select("commission_rate")
    .eq("user_id", agentId)
    .single();

  const stats = [
    {
      label: "Total Assignments",
      value: total,
      icon: Users,
      color: "text-blue-400 bg-blue-500/10",
    },
    {
      label: "Accepted",
      value: accepted,
      icon: CheckCircle,
      color: "text-green-400 bg-green-500/10",
    },
    {
      label: "Declined",
      value: declined,
      icon: XCircle,
      color: "text-red-400 bg-red-500/10",
    },
    {
      label: "Pending",
      value: pending,
      icon: Clock,
      color: "text-amber-400 bg-amber-500/10",
    },
    {
      label: "Leased (Closed)",
      value: leased,
      icon: Award,
      color: "text-emerald-400 bg-emerald-500/10",
    },
    {
      label: "Currently Touring",
      value: touring,
      icon: Target,
      color: "text-purple-400 bg-purple-500/10",
    },
    {
      label: "Conversion Rate",
      value: `${conversionRate}%`,
      icon: TrendingUp,
      color: "text-indigo-400 bg-indigo-500/10",
    },
    {
      label: "Accept Rate",
      value: `${acceptRate}%`,
      icon: BarChart3,
      color: "text-cyan-400 bg-cyan-500/10",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Performance</h1>
        <p className="text-muted-foreground">
          Track your lead management metrics and conversion rates
        </p>
      </div>

      {agent?.commission_rate && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10">
                <Award className="h-6 w-6 text-amber-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Commission Rate</p>
                <p className="text-2xl font-bold">{agent.commission_rate}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-full ${stat.color}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className="text-2xl font-bold">{stat.value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Pipeline Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Pipeline Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[
              { label: "New", count: all.filter((a) => { const l = (Array.isArray(a.leads) ? a.leads[0] : a.leads) as { status: string } | null; return l?.status === "new"; }).length, color: "bg-green-500" },
              { label: "Contacted", count: all.filter((a) => { const l = (Array.isArray(a.leads) ? a.leads[0] : a.leads) as { status: string } | null; return l?.status === "contacted"; }).length, color: "bg-blue-500" },
              { label: "Touring", count: touring, color: "bg-purple-500" },
              { label: "Applied", count: all.filter((a) => { const l = (Array.isArray(a.leads) ? a.leads[0] : a.leads) as { status: string } | null; return l?.status === "applied"; }).length, color: "bg-yellow-500" },
              { label: "Leased", count: leased, color: "bg-emerald-500" },
              { label: "Lost", count: lost, color: "bg-gray-400" },
            ].map((stage) => (
              <div key={stage.label} className="flex items-center gap-4">
                <div className={`h-3 w-3 rounded-full ${stage.color}`} />
                <span className="w-24 text-sm">{stage.label}</span>
                <div className="flex-1">
                  <div className="h-2 rounded-full bg-muted">
                    <div
                      className={`h-2 rounded-full ${stage.color}`}
                      style={{
                        width: total > 0 ? `${Math.max((stage.count / total) * 100, stage.count > 0 ? 4 : 0)}%` : "0%",
                      }}
                    />
                  </div>
                </div>
                <span className="w-8 text-right text-sm font-medium">{stage.count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
