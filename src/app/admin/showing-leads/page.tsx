import { redirect } from "next/navigation";
import { getUserRole } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PostLeadDialog } from "./PostLeadDialog";
import { LeadPipelineActions } from "./LeadPipelineActions";
import { MapPin, User, Clock, CheckCircle, AlertTriangle, Building2 } from "lucide-react";

export const dynamic = "force-dynamic";

type ShowingLead = {
  id: string;
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
  preferred_date: string;
  preferred_time: string;
  unit_type: string | null;
  notes: string | null;
  status: string;
  lease_signed: boolean;
  monthly_rent: number | null;
  created_at: string;
  buildings: { id: string; name: string; address: string | null };
  showing_claims: Array<{
    id: string;
    claimed_at: string;
    status: string;
    showers: { id: string; display_name: string; phone: string | null; tier: string };
  }>;
  showing_debriefs: Array<{
    id: string;
    submitted_at: string;
    admin_approved_at: string | null;
    client_showed_up: boolean;
    interest_level: number | null;
    application_likelihood: string | null;
  }>;
};

const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  open: { label: "Open", color: "bg-green-100 text-green-700", icon: MapPin },
  claimed: { label: "Claimed", color: "bg-blue-100 text-blue-700", icon: User },
  in_progress: { label: "In Progress", color: "bg-purple-100 text-purple-700", icon: Clock },
  completed: { label: "Completed", color: "bg-teal-100 text-teal-700", icon: CheckCircle },
  cancelled: { label: "Cancelled", color: "bg-gray-100 text-gray-600", icon: AlertTriangle },
  no_show: { label: "No Show", color: "bg-red-100 text-red-600", icon: AlertTriangle },
};

export default async function AdminShowingLeadsPage() {
  const role = await getUserRole();
  if (role !== "admin") redirect("/");

  const adminClient = createAdminClient();

  const [leadsRes, buildingsRes] = await Promise.all([
    adminClient
      .from("showing_leads")
      .select(`
        id, client_name, client_email, client_phone,
        preferred_date, preferred_time, unit_type, notes, status,
        lease_signed, monthly_rent, created_at,
        buildings:building_id (id, name, address),
        showing_claims (
          id, claimed_at, status,
          showers:shower_id (id, display_name, phone, tier)
        ),
        showing_debriefs (
          id, submitted_at, admin_approved_at,
          client_showed_up, interest_level, application_likelihood
        )
      `)
      .order("preferred_date", { ascending: true })
      .order("preferred_time", { ascending: true }),
    adminClient
      .from("buildings")
      .select("id, name")
      .order("name"),
  ]);

  const leads = (leadsRes.data || []) as unknown as ShowingLead[];
  const buildings = (buildingsRes.data || []) as Array<{ id: string; name: string }>;

  // Status counts for pipeline
  const statusCounts = leads.reduce((acc, l) => {
    acc[l.status] = (acc[l.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  function formatDate(d: string) {
    return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric",
    });
  }

  function formatTime(t: string) {
    const [h, m] = t.split(":");
    const hour = parseInt(h);
    const ampm = hour >= 12 ? "PM" : "AM";
    const display = hour > 12 ? hour - 12 : hour || 12;
    return `${display}:${m} ${ampm}`;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Showing Leads</h1>
          <p className="text-muted-foreground">
            Post leads, track showings, approve debriefs, and record commissions.
          </p>
        </div>
        <PostLeadDialog buildings={buildings} />
      </div>

      {/* Pipeline Overview */}
      <div className="grid gap-3 grid-cols-3 md:grid-cols-6">
        {Object.entries(statusConfig).map(([status, config]) => {
          const Icon = config.icon;
          return (
            <Card key={status} className="text-center">
              <CardContent className="pt-4 pb-4">
                <div className={`mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full ${config.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <p className="text-xl font-bold">{statusCounts[status] || 0}</p>
                <p className="text-xs text-muted-foreground">{config.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Leads List */}
      {leads.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center space-y-3">
            <Building2 className="h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium">No showing leads yet</p>
            <p className="text-sm text-muted-foreground">Post a lead to send it to the Shower feed.</p>
            <PostLeadDialog buildings={buildings} />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {leads.map((lead) => {
            const config = statusConfig[lead.status] || statusConfig.open;
            const StatusIcon = config.icon;
            const claim = lead.showing_claims?.[0];
            const shower = claim?.showers;
            const debrief = lead.showing_debriefs?.[0];

            return (
              <Card key={lead.id}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0 space-y-2">
                      {/* Header row */}
                      <div className="flex items-center gap-3 flex-wrap">
                        <p className="font-semibold">{lead.buildings.name}</p>
                        <Badge className={config.color}>
                          <StatusIcon className="mr-1 h-3 w-3" />
                          {config.label}
                        </Badge>
                        {lead.unit_type && (
                          <Badge variant="outline">{lead.unit_type}</Badge>
                        )}
                        {lead.lease_signed && (
                          <Badge className="bg-emerald-100 text-emerald-700">
                            Lease Signed
                          </Badge>
                        )}
                      </div>

                      {/* Showing time */}
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        {formatDate(lead.preferred_date)} at {formatTime(lead.preferred_time)}
                        {lead.buildings.address && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            {lead.buildings.address}
                          </span>
                        )}
                      </div>

                      {/* Client + Shower */}
                      <div className="grid sm:grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">CLIENT</p>
                          <p>{lead.client_name}</p>
                          {lead.client_phone && <p className="text-muted-foreground">{lead.client_phone}</p>}
                          {lead.client_email && <p className="text-muted-foreground text-xs">{lead.client_email}</p>}
                        </div>
                        {shower ? (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">SHOWER</p>
                            <p>{shower.display_name}</p>
                            {shower.phone && <p className="text-muted-foreground">{shower.phone}</p>}
                            <Badge variant="outline" className="mt-1 text-xs capitalize">{shower.tier}</Badge>
                          </div>
                        ) : (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">SHOWER</p>
                            <p className="text-muted-foreground text-sm italic">Unclaimed</p>
                          </div>
                        )}
                      </div>

                      {/* Debrief summary */}
                      {debrief && (
                        <div className={`rounded-lg p-3 text-sm ${debrief.admin_approved_at ? "bg-green-50 border border-green-200" : "bg-amber-50 border border-amber-200"}`}>
                          <div className="flex items-center gap-2 font-medium">
                            <CheckCircle className={`h-4 w-4 ${debrief.admin_approved_at ? "text-green-600" : "text-amber-600"}`} />
                            Debrief {debrief.admin_approved_at ? "Approved" : "Submitted — Pending Review"}
                          </div>
                          {debrief.client_showed_up && (
                            <div className="mt-2 flex gap-4 text-muted-foreground text-xs">
                              {debrief.interest_level && <span>Interest: {debrief.interest_level}/5</span>}
                              {debrief.application_likelihood && (
                                <span className="capitalize">Application: {debrief.application_likelihood.replace("_", " ")}</span>
                              )}
                            </div>
                          )}
                          {!debrief.client_showed_up && (
                            <p className="mt-1 text-xs text-red-600">Client no-show reported</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <LeadPipelineActions
                      lead={{
                        id: lead.id,
                        status: lead.status,
                        hasDebrief: !!debrief,
                        debriefApproved: !!debrief?.admin_approved_at,
                        clientShowedUp: debrief?.client_showed_up ?? null,
                        leaseSigned: lead.lease_signed,
                        showerId: shower?.id || null,
                        showerName: shower?.display_name || null,
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
