import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { Eye, Mail, Phone } from "lucide-react";

export default async function AdminLeadsPage() {
  const supabase = createAdminClient();

  const { data: leads, error } = await supabase
    .from("leads")
    .select(`
      id, created_at, status, name, user_email, user_phone,
      budget_min, budget_max, beds, move_in_date, source, notes,
      cities:city_id (name, slug)
    `)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return (
      <div className="space-y-8">
        <h1 className="text-3xl font-bold">Leads</h1>
        <p className="text-red-500">Error loading leads: {error.message}</p>
      </div>
    );
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Leads</h1>
          <p className="text-muted-foreground">
            Manage and track all incoming leads
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline">{leads?.length || 0} total</Badge>
          <Badge variant="secondary">
            {leads?.filter((l) => l.status === "new").length || 0} new
          </Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Leads</CardTitle>
        </CardHeader>
        <CardContent>
          {leads?.length ? (
            <div className="space-y-4">
              {leads.map((lead) => (
                <div
                  key={lead.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{lead.name || "Unnamed Lead"}</p>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[lead.status] || statusColors.new}`}>
                        {lead.status}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                      {lead.user_email && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {lead.user_email}
                        </span>
                      )}
                      {lead.user_phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {lead.user_phone}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {(() => {
                      const city = lead.cities as { name: string } | { name: string }[] | null;
                      const cityName = Array.isArray(city) ? city[0]?.name : city?.name;
                      return cityName ? <Badge variant="outline">{cityName}</Badge> : null;
                    })()}
                    {lead.beds !== null && (
                      <Badge variant="outline">{lead.beds === 0 ? "Studio" : `${lead.beds} bed`}</Badge>
                    )}
                    {lead.budget_max && (
                      <Badge variant="outline">${lead.budget_max.toLocaleString()} max</Badge>
                    )}
                    <Badge variant="secondary">{lead.source}</Badge>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {formatDate(lead.created_at)}
                    </span>
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/admin/leads/${lead.id}`}>
                        <Eye className="mr-1 h-3 w-3" />
                        View
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center">
              <p className="text-muted-foreground">No leads yet.</p>
              <p className="text-sm text-muted-foreground mt-2">
                Leads will appear here when users request tours or contact information.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
