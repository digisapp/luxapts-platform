import { createAdminClient } from "@/lib/supabase/server";
import { DataQualityDashboard } from "@/components/admin/data-quality/DataQualityDashboard";
import { fetchAllRows } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

type CityRel = { name: string; slug: string };

type DataQualityBuilding = {
  id: string;
  name: string;
  address_1: string;
  zip: string | null;
  status: string | null;
  description: string | null;
  website_url: string | null;
  leasing_phone: string | null;
  leasing_email: string | null;
  pet_policy: string | null;
  parking_policy: string | null;
  deposit_policy: string | null;
  year_built: number | null;
  stories: number | null;
  lat: number | null;
  lng: number | null;
  hero_image_url: string | null;
  city_id: string;
  cities: CityRel | CityRel[] | null;
};

const BUILDING_COLUMNS = `
  id, name, address_1, zip, status, description, website_url,
  leasing_phone, leasing_email, pet_policy, parking_policy, deposit_policy,
  year_built, stories, lat, lng, hero_image_url,
  city_id,
  cities:city_id (name, slug)
`;

export default async function DataQualityPage() {
  const supabase = createAdminClient();

  // Paged reads: unpaged selects stopped at PostgREST's 1000-row cap, which
  // silently zeroed the image/unit/amenity counts for every building past the
  // cap. Price coverage now comes from one row per unit
  // (units_with_latest_price) rather than the whole snapshot history.
  // Property mutation, not reassignment: react-hooks/immutability forbids
  // reassigning a captured binding inside an async callback.
  const buildingsError: { message: string | null } = { message: null };

  const [buildingRows, imageRows, unitRows, amenityRows] = await Promise.all([
    fetchAllRows<DataQualityBuilding>(async (from, to) => {
      const res = await supabase
        .from("buildings")
        .select(BUILDING_COLUMNS)
        .eq("status", "active")
        .order("name")
        .order("id")
        .range(from, to);
      if (res.error) buildingsError.message = res.error.message ?? "Unknown error";
      return res as unknown as { data: DataQualityBuilding[] | null; error: unknown };
    }),
    fetchAllRows<{ building_id: string }>((from, to) =>
      supabase
        .from("building_images")
        .select("building_id")
        .order("building_id")
        .order("id")
        .range(from, to)
    ),
    fetchAllRows<{ id: string; building_id: string; is_available: boolean | null; latest_rent: number | null }>(
      (from, to) =>
        supabase
          .from("units_with_latest_price")
          .select("id, building_id, is_available, latest_rent")
          .order("id")
          .range(from, to)
    ),
    fetchAllRows<{ building_id: string }>((from, to) =>
      supabase
        .from("building_amenities")
        .select("building_id")
        .order("building_id")
        .order("amenity_id")
        .range(from, to)
    ),
  ]);

  if (buildingsError.message) {
    return (
      <div className="space-y-8">
        <h1 className="text-3xl font-bold">Data Quality</h1>
        <p className="text-red-500">Error: {buildingsError.message}</p>
      </div>
    );
  }

  // Aggregate counts
  const imageCountMap: Record<string, number> = {};
  for (const img of imageRows) {
    imageCountMap[img.building_id] = (imageCountMap[img.building_id] || 0) + 1;
  }

  const unitCountMap: Record<string, { total: number; available: number }> = {};
  const buildingsWithPrices = new Set<string>();
  for (const unit of unitRows) {
    if (!unitCountMap[unit.building_id]) {
      unitCountMap[unit.building_id] = { total: 0, available: 0 };
    }
    unitCountMap[unit.building_id].total++;
    if (unit.is_available) unitCountMap[unit.building_id].available++;
    if (unit.latest_rent != null) buildingsWithPrices.add(unit.building_id);
  }

  const amenityCountMap: Record<string, number> = {};
  for (const a of amenityRows) {
    amenityCountMap[a.building_id] = (amenityCountMap[a.building_id] || 0) + 1;
  }

  // Score each building
  const buildings = buildingRows.map((b) => {
    const issues: string[] = [];
    let score = 0;
    const maxScore = 10;

    if (b.description && b.description.length > 50) score += 1;
    else issues.push("missing_description");

    const imgCount = imageCountMap[b.id] || 0;
    if (imgCount >= 3) score += 2;
    else if (imgCount > 0) { score += 1; issues.push("few_images"); }
    else issues.push("no_images");

    const units = unitCountMap[b.id];
    if (units && units.total > 0 && buildingsWithPrices.has(b.id)) score += 2;
    else if (units && units.total > 0) { score += 1; issues.push("no_pricing"); }
    else issues.push("no_units");

    if (b.leasing_phone || b.leasing_email) score += 1;
    else issues.push("no_contact");

    if ((amenityCountMap[b.id] || 0) >= 3) score += 1;
    else issues.push("few_amenities");

    if (b.lat && b.lng) score += 1;
    else issues.push("no_location");

    if (b.pet_policy || b.parking_policy) score += 1;
    else issues.push("no_policies");

    if (b.website_url) score += 1;
    else issues.push("no_website");

    const city = b.cities;
    const cityData = Array.isArray(city) ? city[0] : city;

    return {
      id: b.id,
      name: b.name,
      address_1: b.address_1,
      city_name: cityData?.name || "Unknown",
      city_slug: cityData?.slug || "",
      city_id: b.city_id,
      score,
      max_score: maxScore,
      percentage: Math.round((score / maxScore) * 100),
      issues,
      counts: {
        images: imgCount,
        units: units?.total || 0,
        available_units: units?.available || 0,
        amenities: amenityCountMap[b.id] || 0,
      },
      has: {
        description: !!(b.description && b.description.length > 50),
        images: imgCount > 0,
        units: !!(units && units.total > 0),
        pricing: buildingsWithPrices.has(b.id),
        contact: !!(b.leasing_phone || b.leasing_email),
        amenities: (amenityCountMap[b.id] || 0) >= 3,
        location: !!(b.lat && b.lng),
        policies: !!(b.pet_policy || b.parking_policy),
        website: !!b.website_url,
      },
      // Pass raw data for inline editing
      leasing_phone: b.leasing_phone,
      leasing_email: b.leasing_email,
      website_url: b.website_url,
      description: b.description,
    };
  });

  buildings.sort((a, b) => a.percentage - b.percentage);

  // Summary stats
  const total = buildings.length;
  const avgScore = total > 0
    ? Math.round(buildings.reduce((sum, b) => sum + b.percentage, 0) / total)
    : 0;

  // Get unique cities from buildings
  const cityMap = new Map<string, string>();
  for (const b of buildings) {
    if (b.city_id && b.city_name) cityMap.set(b.city_id, b.city_name);
  }
  const cities = Array.from(cityMap.entries()).map(([id, name]) => ({ id, name }));
  cities.sort((a, b) => a.name.localeCompare(b.name));

  const summary = {
    total_buildings: total,
    average_score: avgScore,
    no_images: buildings.filter((b) => b.issues.includes("no_images")).length,
    no_units: buildings.filter((b) => b.issues.includes("no_units")).length,
    no_pricing: buildings.filter((b) => b.issues.includes("no_pricing")).length,
    no_contact: buildings.filter((b) => b.issues.includes("no_contact")).length,
    missing_description: buildings.filter((b) => b.issues.includes("missing_description")).length,
    no_website: buildings.filter((b) => b.issues.includes("no_website")).length,
    grade_a: buildings.filter((b) => b.percentage >= 80).length,
    grade_b: buildings.filter((b) => b.percentage >= 60 && b.percentage < 80).length,
    grade_c: buildings.filter((b) => b.percentage >= 40 && b.percentage < 60).length,
    grade_f: buildings.filter((b) => b.percentage < 40).length,
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Data Quality</h1>
        <p className="text-muted-foreground">
          Track building completeness and fix data gaps to improve the renter experience
        </p>
      </div>
      <DataQualityDashboard
        summary={summary}
        buildings={buildings}
        cities={cities}
      />
    </div>
  );
}
