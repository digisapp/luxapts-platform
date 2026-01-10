import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { ArrowLeft, Mail, Phone, Calendar, DollarSign, Bed, Building2 } from "lucide-react";

interface LeadDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function LeadDetailPage({ params }: LeadDetailPageProps) {
  const { id } = await params;
  const supabase = createAdminClient();

  // Fetch lead with relations
  const { data: lead, error } = await supabase
    .from("leads")
    .select(`
      *,
      cities:city_id (id, name, slug)
    `)
    .eq("id", id)
    .single();

  if (error || !lead) {
    notFound();
  }

  // Fetch lead events
  const { data: events } = await supabase
    .from("lead_events")
    .select("*")
    .eq("lead_id", id)
    .order("created_at", { ascending: false });

  // Fetch lead targets
  const { data: targets } = await supabase
    .from("lead_targets")
    .select(`
      *,
      buildings:building_id (id, name, address_1)
    `)
    .eq("lead_id", id);

  // Fetch agent assignments
  const { data: assignments } = await supabase
    .from("agent_assignments")
    .select(`
      *,
      profiles:agent_user_id (full_name)
    `)
    .eq("lead_id", id)
    .order("assigned_at", { ascending: false });

  // Fetch available agents for assignment
  const { data: agents } = await supabase
    .from("agents")
    .select(`
      user_id,
      status,
      profiles:user_id (full_name)
    `)
    .eq("status", "active");

  // Handle status update
  async function updateStatus(formData: FormData) {
    "use server";
    const newStatus = formData.get("status") as string;
    const supabase = createAdminClient();

    await supabase
      .from("leads")
      .update({ status: newStatus })
      .eq("id", id);

    await supabase.from("lead_events").insert({
      lead_id: id,
      type: "status_changed",
      payload: { new_status: newStatus },
    });

    redirect(`/admin/leads/${id}`);
  }

  // Handle agent assignment
  async function assignAgent(formData: FormData) {
    "use server";
    const agentUserId = formData.get("agent_user_id") as string;
    const supabase = createAdminClient();

    await supabase.from("agent_assignments").insert({
      lead_id: id,
      agent_user_id: agentUserId,
      status: "assigned",
    });

    await supabase.from("lead_events").insert({
      lead_id: id,
      type: "agent_assigned",
      payload: { agent_user_id: agentUserId },
    });

    redirect(`/admin/leads/${id}`);
  }

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
        <Link
          href="/admin/leads"
          className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Leads
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">{lead.name || "Unnamed Lead"}</h1>
            <p className="text-muted-foreground">Lead ID: {lead.id}</p>
          </div>
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${statusColors[lead.status]}`}>
            {lead.status}
          </span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {lead.user_email && (
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-muted-foreground" />
                  <a href={`mailto:${lead.user_email}`} className="hover:underline">
                    {lead.user_email}
                  </a>
                </div>
              )}
              {lead.user_phone && (
                <div className="flex items-center gap-3">
                  <Phone className="h-5 w-5 text-muted-foreground" />
                  <a href={`tel:${lead.user_phone}`} className="hover:underline">
                    {lead.user_phone}
                  </a>
                </div>
              )}
              {!lead.user_email && !lead.user_phone && (
                <p className="text-muted-foreground">No contact information provided</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Requirements</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                {(lead.cities as { name: string } | null) && (
                  <div className="flex items-center gap-3">
                    <Building2 className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">City</p>
                      <p className="font-medium">{(lead.cities as { name: string }).name}</p>
                    </div>
                  </div>
                )}
                {lead.beds !== null && (
                  <div className="flex items-center gap-3">
                    <Bed className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Bedrooms</p>
                      <p className="font-medium">{lead.beds === 0 ? "Studio" : `${lead.beds} bed`}</p>
                    </div>
                  </div>
                )}
                {(lead.budget_min || lead.budget_max) && (
                  <div className="flex items-center gap-3">
                    <DollarSign className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Budget</p>
                      <p className="font-medium">
                        ${lead.budget_min?.toLocaleString() || "0"} - ${lead.budget_max?.toLocaleString() || "No max"}
                      </p>
                    </div>
                  </div>
                )}
                {lead.move_in_date && (
                  <div className="flex items-center gap-3">
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Move-in Date</p>
                      <p className="font-medium">{formatDate(lead.move_in_date)}</p>
                    </div>
                  </div>
                )}
              </div>
              {lead.notes && (
                <div className="mt-4 border-t pt-4">
                  <p className="text-sm text-muted-foreground">Notes</p>
                  <p className="mt-1">{lead.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Target Buildings */}
          {targets && targets.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Interested Buildings</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {targets.map((target) => (
                    <div key={target.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="font-medium">
                          {(target.buildings as { name: string } | null)?.name || "Unknown Building"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {(target.buildings as { address_1: string } | null)?.address_1}
                        </p>
                      </div>
                      {target.rank && <Badge variant="outline">#{target.rank}</Badge>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Events Timeline */}
          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {events && events.length > 0 ? (
                <div className="space-y-4">
                  {events.map((event) => (
                    <div key={event.id} className="flex gap-4 border-l-2 pl-4">
                      <div>
                        <p className="font-medium text-sm">{event.type.replace(/_/g, " ")}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(event.created_at).toLocaleString()}
                        </p>
                        {event.payload && Object.keys(event.payload).length > 0 && (
                          <pre className="mt-1 text-xs text-muted-foreground">
                            {JSON.stringify(event.payload, null, 2)}
                          </pre>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No activity yet</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar Actions */}
        <div className="space-y-6">
          {/* Update Status */}
          <Card>
            <CardHeader>
              <CardTitle>Update Status</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={updateStatus}>
                <select
                  name="status"
                  defaultValue={lead.status}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                >
                  <option value="new">New</option>
                  <option value="contacted">Contacted</option>
                  <option value="touring">Touring</option>
                  <option value="applied">Applied</option>
                  <option value="leased">Leased</option>
                  <option value="lost">Lost</option>
                </select>
                <Button type="submit" className="mt-3 w-full">
                  Update Status
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Assign Agent */}
          <Card>
            <CardHeader>
              <CardTitle>Assign Agent</CardTitle>
            </CardHeader>
            <CardContent>
              {assignments && assignments.length > 0 && (
                <div className="mb-4 space-y-2">
                  <p className="text-sm font-medium">Current Assignments</p>
                  {assignments.map((a) => (
                    <div key={a.id} className="flex items-center justify-between rounded-lg border p-2">
                      <span className="text-sm">
                        {(a.profiles as { full_name: string } | null)?.full_name || "Unknown"}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {a.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}

              {agents && agents.length > 0 ? (
                <form action={assignAgent}>
                  <select
                    name="agent_user_id"
                    className="w-full rounded-md border px-3 py-2 text-sm"
                  >
                    {agents.map((agent) => {
                      const profile = agent.profiles as { full_name: string | null } | { full_name: string | null }[] | null;
                      const fullName = Array.isArray(profile) ? profile[0]?.full_name : profile?.full_name;
                      return (
                        <option key={agent.user_id} value={agent.user_id}>
                          {fullName || agent.user_id}
                        </option>
                      );
                    })}
                  </select>
                  <Button type="submit" className="mt-3 w-full">
                    Assign Agent
                  </Button>
                </form>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No active agents available. Add agents in the Agents section.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Meta Info */}
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Source</span>
                <Badge variant="secondary">{lead.source}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span>{formatDate(lead.created_at)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
