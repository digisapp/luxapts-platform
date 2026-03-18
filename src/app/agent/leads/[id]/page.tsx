import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { getAgentUserId } from "@/lib/agent/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/utils";
import {
  ArrowLeft, Mail, Phone, Calendar, DollarSign, Bed, Building2,
  MessageSquare, ArrowRight, UserCheck, Send, UserPlus, MessageCircle,
} from "lucide-react";

export const dynamic = "force-dynamic";

interface LeadDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function AgentLeadDetailPage({ params }: LeadDetailPageProps) {
  const { id } = await params;
  const agentId = await getAgentUserId();
  if (!agentId) redirect("/");

  const supabase = createAdminClient();

  // Verify this lead is assigned to the current agent
  const { data: assignment } = await supabase
    .from("agent_assignments")
    .select("id, status")
    .eq("lead_id", id)
    .eq("agent_user_id", agentId)
    .order("assigned_at", { ascending: false })
    .limit(1)
    .single();

  if (!assignment) {
    notFound();
  }

  // Fetch lead with relations
  const [leadRes, eventsRes, targetsRes] = await Promise.all([
    supabase
      .from("leads")
      .select(`*, cities:city_id (id, name, slug)`)
      .eq("id", id)
      .single(),
    supabase
      .from("lead_events")
      .select("*")
      .eq("lead_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("lead_targets")
      .select(`*, buildings:building_id (id, name, address_1)`)
      .eq("lead_id", id),
  ]);

  const lead = leadRes.data;
  if (!lead) notFound();

  const events = eventsRes.data || [];
  const targets = targetsRes.data || [];

  // Server actions
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
      payload: { new_status: newStatus, changed_by: "agent" },
    });

    redirect(`/agent/leads/${id}`);
  }

  async function addNote(formData: FormData) {
    "use server";
    const note = formData.get("note") as string;
    if (!note?.trim()) return;
    const supabase = createAdminClient();

    await supabase.from("lead_events").insert({
      lead_id: id,
      type: "note_added",
      payload: { note: note.trim(), added_by: "agent" },
    });

    redirect(`/agent/leads/${id}`);
  }

  const statusColors: Record<string, string> = {
    new: "bg-green-100 text-green-800",
    contacted: "bg-blue-100 text-blue-800",
    touring: "bg-purple-100 text-purple-800",
    applied: "bg-yellow-100 text-yellow-800",
    leased: "bg-emerald-100 text-emerald-800",
    lost: "bg-gray-100 text-gray-800",
  };

  function renderEvent(event: { id: string; type: string; payload: Record<string, unknown>; created_at: string }) {
    const iconMap: Record<string, { icon: typeof UserPlus; color: string; label: string }> = {
      lead_created: {
        icon: UserPlus,
        color: "text-green-600 bg-green-50",
        label: `Lead created from ${(event.payload?.source as string) || "unknown"}`,
      },
      status_changed: {
        icon: ArrowRight,
        color: "text-blue-600 bg-blue-50",
        label: `Status changed to ${(event.payload?.new_status as string) || "unknown"}`,
      },
      agent_assigned: {
        icon: UserCheck,
        color: "text-purple-600 bg-purple-50",
        label: "Agent assigned",
      },
      email_sent: {
        icon: Send,
        color: "text-amber-600 bg-amber-50",
        label: `Email sent: ${(event.payload?.subject as string) || ""}`,
      },
      note_added: {
        icon: MessageSquare,
        color: "text-gray-600 bg-gray-50",
        label: (event.payload?.note as string) || "Note added",
      },
      conversation_summary: {
        icon: MessageCircle,
        color: "text-cyan-600 bg-cyan-50",
        label: `Chat: ${(event.payload?.summary as string) || "Conversation recorded"}`,
      },
    };

    const config = iconMap[event.type] || {
      icon: MessageSquare,
      color: "text-gray-600 bg-gray-50",
      label: event.type.replace(/_/g, " "),
    };
    const Icon = config.icon;

    return (
      <div key={event.id} className="flex gap-3">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${config.color}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm">{config.label}</p>
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
          href="/agent/leads"
          className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to My Leads
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
          {targets.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Interested Buildings</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {targets.map((target) => (
                    <Link
                      key={target.id}
                      href={`/buildings/${(target.buildings as { id: string } | null)?.id || ""}`}
                      className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50"
                    >
                      <div>
                        <p className="font-medium">
                          {(target.buildings as { name: string } | null)?.name || "Unknown Building"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {(target.buildings as { address_1: string } | null)?.address_1}
                        </p>
                      </div>
                      {target.rank && <Badge variant="outline">#{target.rank}</Badge>}
                    </Link>
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
              {events.length > 0 ? (
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

          {/* Add Note */}
          <Card>
            <CardHeader>
              <CardTitle>Add Note</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={addNote}>
                <Textarea
                  name="note"
                  placeholder="Write a note about this lead..."
                  rows={3}
                />
                <Button type="submit" className="mt-3 w-full" variant="outline">
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Add Note
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Quick Contact */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {lead.user_email && (
                <Button variant="outline" className="w-full" asChild>
                  <a href={`mailto:${lead.user_email}`}>
                    <Mail className="mr-2 h-4 w-4" />
                    Send Email
                  </a>
                </Button>
              )}
              {lead.user_phone && (
                <Button variant="outline" className="w-full" asChild>
                  <a href={`tel:${lead.user_phone}`}>
                    <Phone className="mr-2 h-4 w-4" />
                    Call
                  </a>
                </Button>
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
              <div className="flex justify-between">
                <span className="text-muted-foreground">Assignment</span>
                <Badge variant="outline">{assignment.status}</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
