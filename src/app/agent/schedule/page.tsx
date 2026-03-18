import { createAdminClient } from "@/lib/supabase/server";
import { getAgentUserId } from "@/lib/agent/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { Calendar, Clock, MapPin, User } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AgentSchedulePage() {
  const agentId = await getAgentUserId();
  if (!agentId) redirect("/");

  const supabase = createAdminClient();

  // Get leads with upcoming move-in dates that are in touring/contacted status
  const { data: assignments } = await supabase
    .from("agent_assignments")
    .select(`
      id, status,
      leads:lead_id (
        id, name, user_email, user_phone, status, move_in_date, beds,
        budget_max, cities:city_id (name)
      )
    `)
    .eq("agent_user_id", agentId)
    .in("status", ["assigned", "accepted"]);

  const upcomingLeads = (assignments || [])
    .map((a) => {
      const lead = (Array.isArray(a.leads) ? a.leads[0] : a.leads) as {
        id: string;
        name: string | null;
        status: string;
        move_in_date: string | null;
        beds: number | null;
        budget_max: number | null;
        cities: { name: string } | { name: string }[] | null;
      } | null;
      return lead;
    })
    .filter((lead): lead is NonNullable<typeof lead> =>
      lead !== null && ["contacted", "touring"].includes(lead.status)
    )
    .sort((a, b) => {
      if (!a.move_in_date) return 1;
      if (!b.move_in_date) return -1;
      return new Date(a.move_in_date).getTime() - new Date(b.move_in_date).getTime();
    });

  const statusColors: Record<string, string> = {
    contacted: "bg-blue-100 text-blue-800",
    touring: "bg-purple-100 text-purple-800",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Schedule</h1>
        <p className="text-muted-foreground">
          Upcoming tours and move-in dates for your active leads
        </p>
      </div>

      {upcomingLeads.length > 0 ? (
        <div className="space-y-3">
          {upcomingLeads.map((lead) => {
            const city = Array.isArray(lead.cities) ? lead.cities[0] : lead.cities;

            return (
              <Link key={lead.id} href={`/agent/leads/${lead.id}`}>
                <Card className="transition-colors hover:bg-muted/50">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-50">
                          <Calendar className="h-6 w-6 text-purple-600" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{lead.name || "Unnamed Lead"}</p>
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[lead.status] || ""}`}>
                              {lead.status}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
                            {city && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3.5 w-3.5" />
                                {city.name}
                              </span>
                            )}
                            {lead.beds !== null && (
                              <span>{lead.beds === 0 ? "Studio" : `${lead.beds} bed`}</span>
                            )}
                            {lead.budget_max && (
                              <span>Up to ${lead.budget_max.toLocaleString()}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        {lead.move_in_date ? (
                          <div>
                            <p className="text-sm font-medium">Move-in</p>
                            <p className="text-sm text-muted-foreground">
                              {formatDate(lead.move_in_date)}
                            </p>
                          </div>
                        ) : (
                          <Badge variant="outline">No date set</Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="mx-auto h-12 w-12 text-muted-foreground" />
            <p className="mt-4 text-muted-foreground">
              No upcoming tours or active leads to schedule.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
