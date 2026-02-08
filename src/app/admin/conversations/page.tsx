import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { MessageCircle, CheckCircle, TrendingUp } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminConversationsPage() {
  const supabase = createAdminClient();

  // Fetch chat sessions
  const { data: sessions, count: totalCount } = await supabase
    .from("chat_sessions")
    .select(
      `
      id, created_at, messages_count, resolved,
      lead_id,
      buildings:building_id (name)
    `,
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .limit(50);

  // Count today's sessions
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { count: todayCount } = await supabase
    .from("chat_sessions")
    .select("id", { count: "exact", head: true })
    .gte("created_at", todayStart.toISOString());

  // Conversion rate: sessions with a lead_id
  const sessionsWithLead = (sessions || []).filter((s) => s.lead_id).length;
  const totalSessions = totalCount || 0;
  const conversionRate =
    totalSessions > 0
      ? Math.round((sessionsWithLead / Math.min(totalSessions, 50)) * 100)
      : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Chat Log</h1>
        <p className="text-muted-foreground">
          AI chat sessions with potential renters
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sessions</CardTitle>
            <MessageCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSessions}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today</CardTitle>
            <MessageCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{todayCount || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{conversionRate}%</div>
            <p className="text-xs text-muted-foreground">
              Sessions that generated a lead
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Sessions List */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Sessions</CardTitle>
        </CardHeader>
        <CardContent>
          {sessions && sessions.length > 0 ? (
            <div className="space-y-3">
              {sessions.map((session) => {
                const building = session.buildings as { name: string } | { name: string }[] | null;
                const buildingName = Array.isArray(building)
                  ? building[0]?.name
                  : building?.name;

                return (
                  <div
                    key={session.id}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4"
                  >
                    <div className="flex items-center gap-3">
                      <MessageCircle className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">
                          {formatDate(session.created_at)}{" "}
                          <span className="text-muted-foreground font-normal">
                            {new Date(session.created_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </p>
                        {buildingName && (
                          <p className="text-sm text-muted-foreground">
                            Building: {buildingName}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        {session.messages_count || 0} messages
                      </Badge>
                      {session.resolved && (
                        <Badge variant="secondary" className="gap-1">
                          <CheckCircle className="h-3 w-3" />
                          Resolved
                        </Badge>
                      )}
                      {session.lead_id && (
                        <Link href={`/admin/leads/${session.lead_id}`}>
                          <Badge variant="success">
                            Lead created
                          </Badge>
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center">
              <MessageCircle className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-2 text-muted-foreground">
                No chat sessions yet. Sessions will appear here when users interact with the AI assistant.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
