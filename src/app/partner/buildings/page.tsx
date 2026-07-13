import { redirect } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { getPartner } from "@/lib/partner/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, ImageIcon, CheckCircle, ArrowRight } from "lucide-react";
import { getFirstRelation } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

export default async function PartnerBuildingsPage() {
  const partner = await getPartner();
  if (!partner) redirect("/");

  const supabase = createAdminClient();
  const { data: buildings } = await supabase
    .from("buildings")
    .select(`
      id, name, address_1, zip, status, website_url,
      cities:city_id (name, slug),
      neighborhoods:neighborhood_id (name)
    `)
    .eq("partner_user_id", partner.user_id)
    .order("name");

  const buildingIds = (buildings || []).map((b) => b.id);

  const [unitsRes, imagesRes] = await Promise.all([
    buildingIds.length > 0
      ? supabase.from("units").select("building_id, is_available").in("building_id", buildingIds)
      : Promise.resolve({ data: [] }),
    buildingIds.length > 0
      ? supabase.from("building_images").select("building_id").in("building_id", buildingIds)
      : Promise.resolve({ data: [] }),
  ]);

  const unitMap: Record<string, { total: number; available: number }> = {};
  for (const u of unitsRes.data || []) {
    if (!unitMap[u.building_id]) unitMap[u.building_id] = { total: 0, available: 0 };
    unitMap[u.building_id].total++;
    if (u.is_available) unitMap[u.building_id].available++;
  }

  const imageMap: Record<string, number> = {};
  for (const img of imagesRes.data || []) {
    imageMap[img.building_id] = (imageMap[img.building_id] || 0) + 1;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">My Buildings</h1>
        <p className="text-muted-foreground">
          {(buildings || []).length} propert{(buildings || []).length === 1 ? "y" : "ies"} in your portfolio
        </p>
      </div>

      {(buildings || []).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg mb-2">No buildings yet</h3>
            <p className="text-muted-foreground text-sm max-w-sm">
              Contact your Staycio account manager to add properties to your portfolio.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(buildings || []).map((b) => {
            const city = getFirstRelation(b.cities as { name: string; slug: string }[] | null);
            const neighborhood = getFirstRelation(b.neighborhoods as { name: string }[] | null);
            const units = unitMap[b.id] || { total: 0, available: 0 };
            const images = imageMap[b.id] || 0;

            return (
              <Card key={b.id} className="hover:shadow-md transition-shadow">
                <CardContent className="pt-5 pb-5 space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold truncate">{b.name}</h3>
                      <p className="text-sm text-muted-foreground truncate">
                        {b.address_1}{city ? `, ${city.name}` : ""}
                      </p>
                      {neighborhood && (
                        <p className="text-xs text-muted-foreground">{neighborhood.name}</p>
                      )}
                    </div>
                    <Badge
                      variant={b.status === "active" ? "default" : "secondary"}
                      className="capitalize shrink-0"
                    >
                      {b.status}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-4 text-sm">
                    <span className={units.available > 0 ? "text-green-600 font-medium" : "text-muted-foreground"}>
                      {units.available} available
                    </span>
                    <span className="text-muted-foreground">{units.total} total units</span>
                    <span className={`flex items-center gap-1 ${images > 0 ? "text-muted-foreground" : "text-amber-600"}`}>
                      {images > 0
                        ? <><CheckCircle className="h-3.5 w-3.5 text-green-500" /> {images} photos</>
                        : <><ImageIcon className="h-3.5 w-3.5" /> No photos</>
                      }
                    </span>
                  </div>

                  <Button variant="outline" size="sm" className="w-full" asChild>
                    <Link href={`/partner/buildings/${b.id}`}>
                      Manage <ArrowRight className="ml-2 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
