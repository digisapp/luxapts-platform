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
  const { data: assignments } = await supabase
    .from("agent_assignments")
    .select(`
      id, status, assigned_at,
      leads:lead_id (id, status, created_at)
    `)
    .eq("agent_user_id", agentId);

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
      color: "text-blue-600 bg-blue-50",
    },
    {
      label: "Accepted",
      value: accepted,
      icon: CheckCircle,
      color: "text-green-600 bg-green-50",
    },
    {
      label: "Declined",
      value: declined,
      icon: XCircle,
      color: "text-red-600 bg-red-50",
    },
    {
      label: "Pending",
      value: pending,
      icon: Clock,
      color: "text-amber-600 bg-amber-50",
    },
    {
      label: "Leased (Closed)",
      value: leased,
      icon: Award,
      color: "text-emerald-600 bg-emerald-50",
    },
    {
      label: "Currently Touring",
      value: touring,
      icon: Target,
      color: "text-purple-600 bg-purple-50",
    },
    {
      label: "Conversion Rate",
      value: `${conversionRate}%`,
      icon: TrendingUp,
      color: "text-indigo-600 bg-indigo-50",
    },
    {
      label: "Accept Rate",
      value: `${acceptRate}%`,
      icon: BarChart3,
      color: "text-cyan-600 bg-cyan-50",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Performance</h1>
        <p className="text-muted-foreground">
          Track your lead management metrics and conversion rates
        </p>
      </div>

      {agent?.commission_rate && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
                <Award className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Commission Rate</p>
                <p className="text-2xl font-bold">{agent.commission_rate}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
