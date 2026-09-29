import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormSubmitButton } from "@/components/admin/layout/FormSubmitButton";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/utils";
import {
  ArrowLeft, Mail, Phone, Calendar, DollarSign, Bed, Building2,
  UserPlus, ArrowRight, UserCheck, Send, MessageSquare, MessageCircle,
} from "lucide-react";
import { LeadEmailButton } from "./LeadEmailButton";

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
      profiles!agents_user_id_fkey (full_name)
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

  // Handle add note
  async function addNote(formData: FormData) {
    "use server";
    const note = formData.get("note") as string;
    if (!note?.trim()) return;
    const supabase = createAdminClient();

    await supabase.from("lead_events").insert({
      lead_id: id,
      type: "note_added",
      payload: { note: note.trim() },
    });

    redirect(`/admin/leads/${id}`);
  }

  const statusColors: Record<string, string> = {
    new: "bg-green-500/15 text-green-300",
    contacted: "bg-blue-500/15 text-blue-300",
    touring: "bg-purple-500/15 text-purple-300",
    applied: "bg-yellow-500/15 text-yellow-300",
    leased: "bg-emerald-500/15 text-emerald-300",
    lost: "bg-white/10 text-white/80",
  };

  // Timeline rendering helper
  function renderEvent(event: { id: string; type: string; payload: Record<string, unknown>; created_at: string }) {
    const iconMap: Record<string, { icon: typeof UserPlus; color: string; label: string }> = {
      lead_created: {
        icon: UserPlus,
        color: "text-green-400 bg-green-500/10",
        label: `Lead created from ${(event.payload?.source as string) || "unknown"}`,
      },
      status_changed: {
        icon: ArrowRight,
        color: "text-blue-400 bg-blue-500/10",
        label: `Status changed to ${(event.payload?.new_status as string) || "unknown"}`,
      },
      agent_assigned: {
        icon: UserCheck,
        color: "text-purple-400 bg-purple-500/10",
        label: "Agent assigned",
      },
      email_sent: {
        icon: Send,
        color: "text-amber-400 bg-amber-500/10",
        label: `Email sent: ${(event.payload?.subject as string) || ""}`,
      },
      note_added: {
        icon: MessageSquare,
        color: "text-white/60 bg-white/5",
        label: (event.payload?.note as string) || "Note added",
      },
      conversation_summary: {
        icon: MessageCircle,
        color: "text-cyan-400 bg-cyan-500/10",
        label: `Chat: ${(event.payload?.summary as string) || "Conversation recorded"}`,
      },
      showing_lead_created: {
        icon: UserCheck,
        color: "text-indigo-400 bg-indigo-500/10",
        label: `Showing lead posted to shower board${event.payload?.preferred_date ? ` for ${event.payload.preferred_date as string}` : ""}`,
      },
      tour_claimed: {
        icon: UserCheck,
        color: "text-purple-400 bg-purple-500/10",
        label: "Tour claimed by a certified shower",
      },
      tour_completed: {
        icon: UserCheck,
        color: "text-emerald-400 bg-emerald-500/10",
        label: `Tour completed${event.payload?.interest_level ? ` — interest ${event.payload.interest_level as number}/5` : ""}`,
      },
      tour_no_show: {
        icon: MessageSquare,
        color: "text-red-400 bg-red-500/10",
        label: "Client no-show reported for tour",
      },
    };

    const config = iconMap[event.type] || {
      icon: MessageSquare,
      color: "text-white/60 bg-white/5",
      label: event.type.replace(/_/g, " "),
    };
    const Icon = config.icon;

    return (
      <div key={event.id} className="flex gap-3">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${config.color}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm break-words">{config.label}</p>
          <p className="text-xs text-muted-foreground">
            {new Date(event.created_at).toLocaleString()}
          </p>
        </div>
      </div>
    );
  }

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
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold break-words sm:text-3xl">{lead.name || "Unnamed Lead"}</h1>
            <p className="break-all text-sm text-muted-foreground">Lead ID: {lead.id}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${statusColors[lead.status]}`}>
              {lead.status}
            </span>
            {lead.user_email && (
              <LeadEmailButton leadId={lead.id} leadName={lead.name} leadEmail={lead.user_email} />
            )}
          </div>
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
                  <Mail className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <a href={`mailto:${lead.user_email}`} className="min-w-0 break-all hover:underline">
                    {lead.user_email}
                  </a>
                </div>
              )}
              {lead.user_phone && (
                <div className="flex items-center gap-3">
                  <Phone className="h-5 w-5 shrink-0 text-muted-foreground" />
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
                  <p className="mt-1 whitespace-pre-wrap break-words">{lead.notes}</p>
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
                    <div key={target.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                      <div className="min-w-0">
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
              <CardTitle>Activity Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {events && events.length > 0 ? (
                <div className="space-y-4">
                  {events.map((event) => renderEvent(event))}
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
                  aria-label="Lead status"
                  defaultValue={lead.status}
                  className="w-full rounded-md border bg-background px-3 py-2 text-base md:text-sm"
                >
                  <option value="new">New</option>
                  <option value="contacted">Contacted</option>
                  <option value="touring">Touring</option>
                  <option value="applied">Applied</option>
                  <option value="leased">Leased</option>
                  <option value="lost">Lost</option>
                </select>
                <FormSubmitButton className="mt-3 w-full">
                  Update Status
                </FormSubmitButton>
              </form>
            </CardContent>
          </Card>

          {/* Add Note */}
          <Card>
            <CardHeader>
              <CardTitle>Add Note</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={addNote}>
                <Textarea
                  name="note"
                  aria-label="Note"
                  placeholder="Write a note about this lead..."
                  rows={3}
                />
                <FormSubmitButton className="mt-3 w-full" variant="outline">
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Add Note
                </FormSubmitButton>
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
                    aria-label="Agent to assign"
                    className="w-full rounded-md border bg-background px-3 py-2 text-base md:text-sm"
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
                  <FormSubmitButton className="mt-3 w-full">
                    Assign Agent
                  </FormSubmitButton>
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
