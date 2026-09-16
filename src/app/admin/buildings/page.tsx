import { createAdminClient } from "@/lib/supabase/server";
import { BuildingsManager } from "@/components/admin/buildings/BuildingsManager";
import { fetchAllRows } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

type CityRel = { id: string; name: string; slug: string };

type AdminBuildingRow = {
  id: string;
  name: string;
  address_1: string;
  zip: string | null;
  status: string;
  website_url: string | null;
  year_built: number | null;
  stories: number | null;
  city_id: string;
  cities: CityRel | CityRel[] | null;
};

const BUILDING_LIST_COLUMNS = `
  id, name, address_1, zip, status, website_url, year_built, stories,
  city_id,
  cities:city_id (id, name, slug)
`;

export default async function AdminBuildingsPage() {
  const supabase = createAdminClient();

  // Paged reads: the unpaged versions stopped at PostgREST's 1000-row cap, so
  // buildings vanished from the list and the image/unit counts under-reported
  // once either table passed 1000 rows.
  // Property mutation, not reassignment: react-hooks/immutability forbids
  // reassigning a captured binding inside an async callback.
  const buildingsError: { message: string | null } = { message: null };

  const [citiesRes, buildingRows, imageRows, unitRows] = await Promise.all([
    supabase.from("cities").select("id, name, slug").order("name"),
    fetchAllRows<AdminBuildingRow>(async (from, to) => {
      const res = await supabase
        .from("buildings")
        .select(BUILDING_LIST_COLUMNS)
        .order("name")
        .order("id")
        .range(from, to);
      if (res.error) buildingsError.message = res.error.message;
      return res as unknown as { data: AdminBuildingRow[] | null; error: unknown };
    }),
    fetchAllRows<{ building_id: string }>((from, to) =>
      supabase
        .from("building_images")
        .select("building_id")
        .order("building_id")
        .order("id")
        .range(from, to)
    ),
    fetchAllRows<{ building_id: string; is_available: boolean | null }>((from, to) =>
      supabase
        .from("units")
        .select("id, building_id, is_available")
        .order("id")
        .range(from, to)
    ),
  ]);

  if (citiesRes.error || buildingsError.message) {
    return (
      <div className="space-y-8">
        <h1 className="text-3xl font-bold">Buildings</h1>
        <p className="text-red-500">
          Error loading data: {citiesRes.error?.message || buildingsError.message}
        </p>
      </div>
    );
  }

  // Aggregate image counts
  const imageCountMap: Record<string, number> = {};
  for (const img of imageRows) {
    imageCountMap[img.building_id] = (imageCountMap[img.building_id] || 0) + 1;
  }

  // Aggregate unit counts
  const unitCountMap: Record<string, { total: number; available: number }> = {};
  for (const unit of unitRows) {
    if (!unitCountMap[unit.building_id]) {
      unitCountMap[unit.building_id] = { total: 0, available: 0 };
    }
    unitCountMap[unit.building_id].total++;
    if (unit.is_available) {
      unitCountMap[unit.building_id].available++;
    }
  }

  const buildings = buildingRows.map((b) => ({
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
