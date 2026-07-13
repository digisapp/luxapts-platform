import { redirect } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { getPartner } from "@/lib/partner/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, Users, TrendingUp, Eye, ArrowRight, AlertCircle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PartnerDashboardPage() {
  const partner = await getPartner();
  if (!partner) redirect("/");

  const supabase = createAdminClient();

  // Fetch partner's buildings
  const { data: buildings } = await supabase
    .from("buildings")
    .select("id, name, status, cities:city_id(name)")
    .eq("partner_user_id", partner.user_id)
    .order("name");

  const buildingIds = (buildings || []).map((b) => b.id);

  // Parallel data load
  const [unitsRes, leadsRes, viewsRes] = await Promise.all([
    buildingIds.length > 0
      ? supabase.from("units").select("building_id, is_available").in("building_id", buildingIds)
      : Promise.resolve({ data: [] }),
    buildingIds.length > 0
      ? supabase
          .from("lead_targets")
          .select("lead_id, building_id, leads:lead_id(id, status, created_at)")
          .in("building_id", buildingIds)
          .order("lead_id", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] }),
    buildingIds.length > 0
      ? supabase
          .from("building_views")
          .select("building_id")
          .in("building_id", buildingIds)
          // Server component — per-request Date.now() is intentional here
          // eslint-disable-next-line react-hooks/purity
          .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      : Promise.resolve({ data: [] }),
  ]);

  // Aggregate stats
  const totalUnits = (unitsRes.data || []).length;
  const availableUnits = (unitsRes.data || []).filter((u) => u.is_available).length;

  const uniqueLeadIds = new Set((leadsRes.data || []).map((t) => t.lead_id));
  const totalInquiries = uniqueLeadIds.size;
  const newInquiries = (leadsRes.data || []).filter((t) => {
    const lead = Array.isArray(t.leads) ? t.leads[0] : t.leads;
    return lead && (lead as { status: string }).status === "new";
  }).length;

  const totalViews = (viewsRes.data || []).length;

  // Buildings needing attention
  const buildingsNoImages = buildingIds.length > 0
    ? (await supabase
        .from("building_images")
        .select("building_id")
        .in("building_id", buildingIds)).data || []
    : [];
  const buildingsWithImages = new Set(buildingsNoImages.map((i) => i.building_id));
  const buildingsMissingImages = (buildings || []).filter(
    (b) => !buildingsWithImages.has(b.id) && b.status === "active"
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">
          {partner.company_name || "Partner Dashboard"}
        </h1>
        <p className="text-muted-foreground">
          Welcome back{partner.contact_name ? `, ${partner.contact_name}` : ""}
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
                <Building2 className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Buildings</p>
                <p className="text-2xl font-bold">{(buildings || []).length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-50">
                <TrendingUp className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Available Units</p>
                <p className="text-2xl font-bold">
                  {availableUnits}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">/ {totalUnits}</span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-50">
                <Users className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Inquiries</p>
                <p className="text-2xl font-bold">{totalInquiries}</p>
                {newInquiries > 0 && (
                  <p className="text-xs text-green-600 font-medium">{newInquiries} new</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
                <Eye className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Views (30d)</p>
                <p className="text-2xl font-bold">{totalViews}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Attention needed */}
      {buildingsMissingImages.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="flex items-start gap-3 pt-5 pb-5">
            <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-amber-900">
                {buildingsMissingImages.length} building{buildingsMissingImages.length > 1 ? "s" : ""} missing photos
              </p>
              <p className="text-sm text-amber-700 mt-0.5">
                Buildings without photos get significantly fewer inquiries.
                {" "}
                {buildingsMissingImages.slice(0, 3).map((b) => b.name).join(", ")}
                {buildingsMissingImages.length > 3 ? ` and ${buildingsMissingImages.length - 3} more` : ""}.
              </p>
            </div>
            <Button variant="outline" size="sm" asChild className="border-amber-300 shrink-0">
              <Link href="/partner/buildings">Manage</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Buildings overview */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>My Buildings</CardTitle>
          <Button variant="outline" size="sm" asChild>
            <Link href="/partner/buildings">
              View all <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {(buildings || []).length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">
              No buildings yet. Contact your Staycio account manager to add properties.
            </p>
          ) : (
            <div className="space-y-3">
              {(buildings || []).slice(0, 5).map((b) => {
                const city = Array.isArray(b.cities) ? b.cities[0] : b.cities;
                const unitInfo = (unitsRes.data || []).filter((u) => u.building_id === b.id);
                const avail = unitInfo.filter((u) => u.is_available).length;
                return (
                  <Link
                    key={b.id}
                    href={`/partner/buildings/${b.id}`}
                    className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/30 transition-colors"
                  >
                    <div>
                      <p className="font-medium">{b.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {(city as { name: string } | null)?.name || ""}
                        {" · "}
                        {avail} of {unitInfo.length} units available
                      </p>
                    </div>
                    <Badge
                      variant={b.status === "active" ? "default" : "secondary"}
                      className="capitalize"
                    >
                      {b.status}
                    </Badge>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick actions */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="hover:bg-muted/30 transition-colors">
          <Link href="/partner/leads">
            <CardContent className="flex items-center justify-between pt-6 pb-6">
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">View Inquiries</p>
                  <p className="text-sm text-muted-foreground">
                    {totalInquiries} total · {newInquiries} new
                  </p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Link>
        </Card>

        <Card className="hover:bg-muted/30 transition-colors">
          <Link href="/partner/buildings">
            <CardContent className="flex items-center justify-between pt-6 pb-6">
              <div className="flex items-center gap-3">
                <Building2 className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">Manage Inventory</p>
                  <p className="text-sm text-muted-foreground">Update units, pricing & policies</p>
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
