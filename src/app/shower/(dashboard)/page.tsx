import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getShower } from "@/lib/shower/auth";
import { createAdminClient } from "@/lib/supabase/server";
import {
  MapPin, Award, DollarSign, Star, AlertTriangle,
  CheckCircle, Clock, ArrowRight, TrendingUp,
} from "lucide-react";

export const dynamic = "force-dynamic";

const tierColors: Record<string, string> = {
  rookie: "bg-gray-100 text-gray-700",
  premier: "bg-blue-100 text-blue-700",
  elite: "bg-amber-100 text-amber-700",
};

const tierLabels: Record<string, string> = {
  rookie: "Rookie",
  premier: "Premier Shower",
  elite: "Elite Partner",
};

export default async function ShowerDashboardPage() {
  const shower = await getShower();
  if (!shower) redirect("/shower/profile");

  if (shower.status === "pending") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-50">
          <Clock className="h-8 w-8 text-amber-500" />
        </div>
        <h2 className="text-2xl font-bold">Application Pending</h2>
        <p className="text-muted-foreground max-w-sm">
          Your Shower application is under review. You will receive a notification once approved.
          This typically takes 1–2 business days.
        </p>
      </div>
    );
  }

  if (shower.status === "suspended" || shower.status === "terminated") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
          <AlertTriangle className="h-8 w-8 text-red-500" />
        </div>
        <h2 className="text-2xl font-bold capitalize">Account {shower.status}</h2>
        <p className="text-muted-foreground max-w-sm">
          Your Shower account has been {shower.status}. Please contact support for more information.
        </p>
      </div>
    );
  }

  const adminClient = createAdminClient();

  // Load key data in parallel
  const [earningsRes, certRes, activeClaimRes] = await Promise.all([
    adminClient
      .from("shower_earnings")
      .select("amount, status, created_at")
      .eq("shower_id", shower.id),
    adminClient
      .from("shower_certifications")
      .select("id, status, buildings:building_id(name)")
      .eq("shower_id", shower.id),
    adminClient
      .from("showing_claims")
      .select(`
        id, claimed_at,
        showing_leads:showing_lead_id (
          id, client_name, preferred_date, preferred_time,
          buildings:building_id (name)
        )
      `)
      .eq("shower_id", shower.id)
      .eq("status", "active")
      .limit(1)
      .single(),
  ]);

  const earnings = earningsRes.data || [];
  const certifications = certRes.data || [];

  const availableBalance = earnings
    .filter((e) => e.status === "approved")
    .reduce((sum, e) => sum + Number(e.amount), 0);

  const pendingBalance = earnings
    .filter((e) => e.status === "pending")
    .reduce((sum, e) => sum + Number(e.amount), 0);

  const now = new Date();
  const thisMonthEarned = earnings
    .filter((e) => {
      const d = new Date(e.created_at);
      return (
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear() &&
        ["approved", "paid"].includes(e.status)
      );
    })
    .reduce((sum, e) => sum + Number(e.amount), 0);

  const certifiedCount = certifications.filter((c) => c.status === "certified").length;
  const activeClaim = activeClaimRes.data;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">Welcome, {shower.display_name}</h1>
          <div className="mt-1 flex items-center gap-3">
            <Badge className={tierColors[shower.tier]}>{tierLabels[shower.tier]}</Badge>
            {shower.avg_rating > 0 && (
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                {shower.avg_rating.toFixed(1)} avg rating
              </span>
            )}
            <span className="text-sm text-muted-foreground">
              {shower.total_showings} showing{shower.total_showings !== 1 ? "s" : ""} completed
            </span>
          </div>
        </div>
      </div>

      {/* Active Showing Alert */}
      {activeClaim && (() => {
        const lead = Array.isArray(activeClaim.showing_leads)
          ? activeClaim.showing_leads[0]
          : activeClaim.showing_leads;
        const building = lead && !Array.isArray((lead as { buildings?: unknown }).buildings)
          ? (lead as unknown as { buildings?: { name: string } }).buildings
          : null;
        return (
          <Card className="border-blue-200 bg-blue-50/50">
            <CardContent className="flex items-center justify-between pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
                  <MapPin className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium">Active Showing</p>
                  <p className="text-sm text-muted-foreground">
                    {building?.name} — {lead && "preferred_date" in lead ? String(lead.preferred_date) : ""} at {lead && "preferred_time" in lead ? String(lead.preferred_time).slice(0, 5) : ""}
                  </p>
                </div>
              </div>
              <Button size="sm" asChild>
                <Link href="/shower/leads">
                  View Details <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        );
      })()}

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-50">
                <DollarSign className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Available</p>
                <p className="text-2xl font-bold">${availableBalance.toFixed(2)}</p>
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
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold">${pendingBalance.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
                <TrendingUp className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">This Month</p>
                <p className="text-2xl font-bold">${thisMonthEarned.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-50">
                <Award className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Certifications</p>
                <p className="text-2xl font-bold">{certifiedCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tier Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tier Progress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            {[
              { tier: "rookie", label: "Rookie", req: "0+ showings" },
              { tier: "premier", label: "Premier", req: "15 showings + 4.7★" },
              { tier: "elite", label: "Elite", req: "50 showings + 4.9★ + invite" },
            ].map((t) => (
              <div
                key={t.tier}
                className={`rounded-lg border p-3 ${shower.tier === t.tier ? "border-primary bg-primary/5" : "opacity-50"}`}
              >
                <p className="font-semibold text-sm">{t.label}</p>
                <p className="text-xs text-muted-foreground mt-1">{t.req}</p>
                {shower.tier === t.tier && (
                  <div className="mt-2 flex justify-center">
                    <CheckCircle className="h-4 w-4 text-primary" />
                  </div>
                )}
              </div>
            ))}
          </div>
          {shower.tier === "premier" && (
            <p className="text-sm text-muted-foreground text-center">
              {50 - shower.total_showings > 0
                ? `${50 - shower.total_showings} more showings until Elite eligibility`
                : "Rating qualification required for Elite — contact admin"}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="hover:bg-muted/30 transition-colors cursor-pointer">
          <Link href="/shower/leads">
            <CardContent className="flex items-center justify-between pt-6 pb-6">
              <div className="flex items-center gap-3">
                <MapPin className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">Lead Feed</p>
                  <p className="text-sm text-muted-foreground">Claim open showings</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Link>
        </Card>

        <Card className="hover:bg-muted/30 transition-colors cursor-pointer">
          <Link href="/shower/certifications">
            <CardContent className="flex items-center justify-between pt-6 pb-6">
              <div className="flex items-center gap-3">
                <Award className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">Certifications</p>
                  <p className="text-sm text-muted-foreground">Unlock new buildings</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Link>
        </Card>

        <Card className="hover:bg-muted/30 transition-colors cursor-pointer">
          <Link href="/shower/earnings">
            <CardContent className="flex items-center justify-between pt-6 pb-6">
              <div className="flex items-center gap-3">
                <DollarSign className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">Earnings</p>
                  <p className="text-sm text-muted-foreground">View your wallet</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Link>
        </Card>
      </div>
    </div>
  );
}
