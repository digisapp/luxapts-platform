import { redirect } from "next/navigation";
import { getUserRole } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShowerActions } from "./ShowerActions";
import { Users, CheckCircle, Clock, AlertTriangle, Star } from "lucide-react";

export const dynamic = "force-dynamic";

type ShowerRow = {
  id: string;
  display_name: string;
  phone: string | null;
  bio: string | null;
  status: "pending" | "approved" | "suspended" | "terminated";
  tier: "rookie" | "premier" | "elite";
  total_showings: number;
  avg_rating: number;
  strike_count: number;
  agreement_accepted: boolean;
  agreement_accepted_at: string | null;
  approved_at: string | null;
  suspension_reason: string | null;
  created_at: string;
};

const statusConfig = {
  pending: { label: "Pending", color: "bg-yellow-100 text-yellow-700", icon: Clock },
  approved: { label: "Approved", color: "bg-green-100 text-green-700", icon: CheckCircle },
  suspended: { label: "Suspended", color: "bg-red-100 text-red-700", icon: AlertTriangle },
  terminated: { label: "Terminated", color: "bg-gray-100 text-gray-600", icon: AlertTriangle },
};

const tierColors = {
  rookie: "bg-gray-100 text-gray-600",
  premier: "bg-blue-100 text-blue-700",
  elite: "bg-amber-100 text-amber-700",
};

export default async function AdminShowersPage() {
  const role = await getUserRole();
  if (role !== "admin") redirect("/");

  const adminClient = createAdminClient();

  const { data: showers } = await adminClient
    .from("showers")
    .select(`
      id, display_name, phone, bio, status, tier,
      total_showings, avg_rating, strike_count,
      agreement_accepted, agreement_accepted_at,
      approved_at, suspension_reason, created_at
    `)
    .order("created_at", { ascending: false });

  const rows = (showers || []) as ShowerRow[];

  const counts = {
    pending: rows.filter((s) => s.status === "pending").length,
    approved: rows.filter((s) => s.status === "approved").length,
    suspended: rows.filter((s) => s.status === "suspended").length,
    total: rows.length,
  };

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Shower Management</h1>
        <p className="text-muted-foreground">
          Approve applications, manage certifications, and monitor performance.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: "Total Showers", value: counts.total, icon: Users, color: "bg-blue-50 text-blue-600" },
          { label: "Pending Review", value: counts.pending, icon: Clock, color: "bg-yellow-50 text-yellow-600" },
          { label: "Active Showers", value: counts.approved, icon: CheckCircle, color: "bg-green-50 text-green-600" },
          { label: "Suspended", value: counts.suspended, icon: AlertTriangle, color: "bg-red-50 text-red-600" },
        ].map((stat) => {
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

      {/* Pending Applications (shown first) */}
      {counts.pending > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Clock className="h-5 w-5 text-yellow-500" />
            Pending Applications ({counts.pending})
          </h2>
          <div className="space-y-3">
            {rows.filter((s) => s.status === "pending").map((shower) => (
              <ShowerCard key={shower.id} shower={shower} formatDate={formatDate} />
            ))}
          </div>
        </div>
      )}

      {/* All Showers */}
      <Card>
        <CardHeader>
          <CardTitle>All Showers</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-2">
              <Users className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-muted-foreground">No shower applications yet</p>
            </div>
          ) : (
            <div className="divide-y">
              {rows.map((shower) => (
                <div key={shower.id} className="flex items-center justify-between px-6 py-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <p className="font-medium truncate">{shower.display_name}</p>
                      <Badge className={statusConfig[shower.status].color}>
                        {statusConfig[shower.status].label}
                      </Badge>
                      <Badge variant="outline" className={tierColors[shower.tier]}>
                        {shower.tier.charAt(0).toUpperCase() + shower.tier.slice(1)}
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-center gap-4 text-sm text-muted-foreground">
                      {shower.phone && <span>{shower.phone}</span>}
                      <span>{shower.total_showings} showings</span>
                      {shower.avg_rating > 0 && (
                        <span className="flex items-center gap-1">
                          <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                          {shower.avg_rating.toFixed(1)}
                        </span>
                      )}
                      {shower.strike_count > 0 && (
                        <span className="text-red-500">{shower.strike_count} strike{shower.strike_count !== 1 ? "s" : ""}</span>
                      )}
                      <span className="text-xs">Applied {formatDate(shower.created_at)}</span>
                    </div>
                    {shower.suspension_reason && (
                      <p className="mt-1 text-xs text-red-500">Reason: {shower.suspension_reason}</p>
                    )}
                  </div>
                  <ShowerActions showerId={shower.id} currentStatus={shower.status} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ShowerCard({ shower, formatDate }: { shower: ShowerRow; formatDate: (d: string) => string }) {
  return (
    <Card className="border-yellow-200 bg-yellow-50/30">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-1">
            <p className="font-semibold">{shower.display_name}</p>
            {shower.phone && <p className="text-sm text-muted-foreground">{shower.phone}</p>}
            {shower.bio && <p className="text-sm text-muted-foreground line-clamp-2">{shower.bio}</p>}
            <p className="text-xs text-muted-foreground">
              Applied {formatDate(shower.created_at)}
              {shower.agreement_accepted && " · Agreement signed"}
            </p>
          </div>
          <ShowerActions showerId={shower.id} currentStatus={shower.status} />
        </div>
      </CardContent>
    </Card>
  );
}
