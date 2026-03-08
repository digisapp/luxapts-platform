import { createAdminClient } from "@/lib/supabase/server";
import { DataQualityDashboard } from "@/components/admin/data-quality/DataQualityDashboard";

export const dynamic = "force-dynamic";

export default async function DataQualityPage() {
  const supabase = createAdminClient();

  // Fetch all data needed for quality scoring in parallel
  const [
    buildingsRes,
    imagesRes,
    unitsRes,
    pricesRes,
    amenitiesRes,
  ] = await Promise.all([
    supabase
      .from("buildings")
      .select(`
        id, name, address_1, zip, status, description, website_url,
        leasing_phone, leasing_email, pet_policy, parking_policy, deposit_policy,
        year_built, stories, lat, lng, hero_image_url,
        city_id,
        cities:city_id (name, slug)
      `)
      .eq("status", "active")
      .order("name"),
    supabase
      .from("building_images")
      .select("building_id"),
    supabase
      .from("units")
      .select("building_id, is_available"),
    supabase
      .from("unit_price_snapshots")
      .select("unit_id, units:unit_id (building_id)")
      .order("captured_at", { ascending: false }),
    supabase
      .from("building_amenities")
      .select("building_id"),
  ]);

  if (buildingsRes.error) {
    return (
      <div className="space-y-8">
        <h1 className="text-3xl font-bold">Data Quality</h1>
        <p className="text-red-500">Error: {buildingsRes.error.message}</p>
      </div>
    );
  }

  // Aggregate counts
  const imageCountMap: Record<string, number> = {};
  for (const img of imagesRes.data || []) {
    imageCountMap[img.building_id] = (imageCountMap[img.building_id] || 0) + 1;
  }

  const unitCountMap: Record<string, { total: number; available: number }> = {};
  for (const unit of unitsRes.data || []) {
    if (!unitCountMap[unit.building_id]) {
      unitCountMap[unit.building_id] = { total: 0, available: 0 };
    }
    unitCountMap[unit.building_id].total++;
    if (unit.is_available) unitCountMap[unit.building_id].available++;
  }

  const buildingsWithPrices = new Set<string>();
  for (const price of pricesRes.data || []) {
    const units = price.units as { building_id: string } | { building_id: string }[] | null;
    const unit = Array.isArray(units) ? units[0] : units;
    if (unit?.building_id) buildingsWithPrices.add(unit.building_id);
  }

  const amenityCountMap: Record<string, number> = {};
  for (const a of amenitiesRes.data || []) {
    amenityCountMap[a.building_id] = (amenityCountMap[a.building_id] || 0) + 1;
  }

  // Score each building
  const buildings = (buildingsRes.data || []).map((b) => {
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

    const city = b.cities as { name: string; slug: string } | { name: string; slug: string }[] | null;
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
