import { createAdminClient } from "@/lib/supabase/server";
import { getAgentUserId } from "@/lib/agent/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import {
  Users, CheckCircle, Clock, TrendingUp,
  ArrowRight, Mail, Phone,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AgentDashboardPage() {
  const agentId = await getAgentUserId();
  if (!agentId) redirect("/");

  const supabase = createAdminClient();

  // Fetch all data in parallel
  const [assignmentsRes, profileRes] = await Promise.all([
    supabase
      .from("agent_assignments")
      .select(`
        id, status, assigned_at,
        leads:lead_id (
          id, name, user_email, user_phone, status, budget_min, budget_max,
          beds, move_in_date, source, created_at,
          cities:city_id (name)
        )
      `)
      .eq("agent_user_id", agentId)
      .order("assigned_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", agentId)
      .single(),
  ]);

  const assignments = assignmentsRes.data || [];
  const agentName = (profileRes.data as { full_name: string | null } | null)?.full_name || "Agent";

  // Compute stats
  const totalAssigned = assignments.length;
  const pending = assignments.filter((a) => a.status === "assigned").length;
  const accepted = assignments.filter((a) => a.status === "accepted").length;
  const activeLeads = assignments.filter((a) => {
    const lead = (Array.isArray(a.leads) ? a.leads[0] : a.leads) as { status: string } | null;
    return lead && !["leased", "lost"].includes(lead.status);
  }).length;

  // Recent leads (last 5)
  const recentLeads = assignments.slice(0, 5);

  const statusColors: Record<string, string> = {
    new: "bg-green-100 text-green-800",
    contacted: "bg-blue-100 text-blue-800",
    touring: "bg-purple-100 text-purple-800",
    applied: "bg-yellow-100 text-yellow-800",
    leased: "bg-emerald-100 text-emerald-800",
    lost: "bg-gray-100 text-gray-800",
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Welcome back, {agentName}</h1>
        <p className="text-muted-foreground">
          Here&apos;s an overview of your assigned leads
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Assigned</p>
                <p className="text-2xl font-bold">{totalAssigned}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
                <Clock className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pending Review</p>
                <p className="text-2xl font-bold">{pending}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-50">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Accepted</p>
                <p className="text-2xl font-bold">{accepted}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-50">
                <TrendingUp className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active Leads</p>
                <p className="text-2xl font-bold">{activeLeads}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Leads */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent Assignments</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/agent/leads">
              View All <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {recentLeads.length > 0 ? (
            <div className="space-y-3">
              {recentLeads.map((assignment) => {
                type LeadShape = {
                  id: string;
                  name: string | null;
                  user_email: string | null;
                  user_phone: string | null;
                  status: string;
                  budget_min: number | null;
                  budget_max: number | null;
                  beds: number | null;
                  cities: { name: string } | { name: string }[] | null;
                };
                const rawLead = assignment.leads;
                const lead = (Array.isArray(rawLead) ? rawLead[0] : rawLead) as LeadShape | null;
                if (!lead) return null;

                const city = Array.isArray(lead.cities) ? lead.cities[0] : lead.cities;

                return (
                  <Link
                    key={assignment.id}
                    href={`/agent/leads/${lead.id}`}
                    className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <p className="font-medium truncate">
                          {lead.name || "Unnamed Lead"}
                        </p>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[lead.status] || "bg-gray-100 text-gray-800"}`}>
                          {lead.status}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-4 text-sm text-muted-foreground">
                        {city && <span>{city.name}</span>}
                        {lead.beds !== null && (
                          <span>{lead.beds === 0 ? "Studio" : `${lead.beds} bed`}</span>
                        )}
                        {lead.budget_max && (
                          <span>Up to ${lead.budget_max.toLocaleString()}</span>
                        )}
                      </div>
                    </div>
                    <div className="ml-4 flex items-center gap-2">
                      {lead.user_email && <Mail className="h-4 w-4 text-muted-foreground" />}
                      {lead.user_phone && <Phone className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground">
              No leads assigned yet. Check back soon.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
