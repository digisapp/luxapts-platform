import { createAdminClient } from "@/lib/supabase/server";
import { BuildingsManager } from "@/components/admin/buildings/BuildingsManager";

export const dynamic = "force-dynamic";

export default async function AdminBuildingsPage() {
  const supabase = createAdminClient();

  // Fetch cities and buildings with counts in parallel
  const [citiesRes, buildingsRes, imageCountsRes, unitsRes] = await Promise.all([
    supabase.from("cities").select("id, name, slug").order("name"),
    supabase
      .from("buildings")
      .select(`
        id, name, address_1, zip, status, website_url, year_built, stories,
        city_id,
        cities:city_id (id, name, slug)
      `)
      .order("name"),
    supabase.from("building_images").select("building_id"),
    supabase.from("units").select("building_id, is_available"),
  ]);

  if (citiesRes.error || buildingsRes.error) {
    return (
      <div className="space-y-8">
        <h1 className="text-3xl font-bold">Buildings</h1>
        <p className="text-red-500">
          Error loading data: {citiesRes.error?.message || buildingsRes.error?.message}
        </p>
      </div>
    );
  }

  // Aggregate image counts
  const imageCountMap: Record<string, number> = {};
  for (const img of imageCountsRes.data || []) {
    imageCountMap[img.building_id] = (imageCountMap[img.building_id] || 0) + 1;
  }

  // Aggregate unit counts
  const unitCountMap: Record<string, { total: number; available: number }> = {};
  for (const unit of unitsRes.data || []) {
    if (!unitCountMap[unit.building_id]) {
      unitCountMap[unit.building_id] = { total: 0, available: 0 };
    }
    unitCountMap[unit.building_id].total++;
    if (unit.is_available) {
      unitCountMap[unit.building_id].available++;
    }
  }

  const buildings = (buildingsRes.data || []).map((b) => ({
    ...b,
    image_count: imageCountMap[b.id] || 0,
    unit_count: unitCountMap[b.id]?.total || 0,
    available_unit_count: unitCountMap[b.id]?.available || 0,
  }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Buildings</h1>
        <p className="text-muted-foreground">
          Manage all buildings, units, and images across cities
        </p>
      </div>
      <BuildingsManager
        cities={citiesRes.data || []}
        buildings={buildings}
      />
    </div>
  );
}
