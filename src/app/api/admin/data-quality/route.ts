import { NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const authResult = await checkAdminAuth();
  if (!authResult.isAdmin) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }

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
      .select("unit_id, rent, captured_at, units:unit_id (building_id)")
      .order("captured_at", { ascending: false }),
    supabase
      .from("building_amenities")
      .select("building_id"),
  ]);

  if (buildingsRes.error) {
    return NextResponse.json(
      { error: "Failed to fetch buildings" },
      { status: 500 }
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

  // Buildings with at least one price snapshot
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

    // 1. Has description (1 point)
    if (b.description && b.description.length > 50) {
      score += 1;
    } else {
      issues.push("missing_description");
    }

    // 2. Has images (2 points — most visible to users)
    const imgCount = imageCountMap[b.id] || 0;
    if (imgCount >= 3) {
      score += 2;
    } else if (imgCount > 0) {
      score += 1;
      issues.push("few_images");
    } else {
      issues.push("no_images");
    }

    // 3. Has units with pricing (2 points)
    const units = unitCountMap[b.id];
    if (units && units.total > 0 && buildingsWithPrices.has(b.id)) {
      score += 2;
    } else if (units && units.total > 0) {
      score += 1;
      issues.push("no_pricing");
    } else {
      issues.push("no_units");
    }

    // 4. Has leasing contact (1 point)
    if (b.leasing_phone || b.leasing_email) {
      score += 1;
    } else {
      issues.push("no_contact");
    }

    // 5. Has amenities (1 point)
    if ((amenityCountMap[b.id] || 0) >= 3) {
      score += 1;
    } else {
      issues.push("few_amenities");
    }

    // 6. Has location data (1 point)
    if (b.lat && b.lng) {
      score += 1;
    } else {
      issues.push("no_location");
    }

    // 7. Has policies (1 point)
    if (b.pet_policy || b.parking_policy) {
      score += 1;
    } else {
      issues.push("no_policies");
    }

    // 8. Has website (1 point)
    if (b.website_url) {
      score += 1;
    } else {
      issues.push("no_website");
    }

    const city = b.cities as { name: string; slug: string } | { name: string; slug: string }[] | null;
    const cityData = Array.isArray(city) ? city[0] : city;

    return {
      id: b.id,
      name: b.name,
      address_1: b.address_1,
      city_name: cityData?.name || "Unknown",
      city_slug: cityData?.slug || "",
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
    };
  });

  // Sort by score ascending (worst first) for prioritization
  buildings.sort((a, b) => a.percentage - b.percentage);

  // Aggregate summary
  const total = buildings.length;
  const avgScore = total > 0
    ? Math.round(buildings.reduce((sum, b) => sum + b.percentage, 0) / total)
    : 0;

  const summary = {
    total_buildings: total,
    average_score: avgScore,
    missing_description: buildings.filter((b) => b.issues.includes("missing_description")).length,
    no_images: buildings.filter((b) => b.issues.includes("no_images")).length,
    few_images: buildings.filter((b) => b.issues.includes("few_images")).length,
    no_units: buildings.filter((b) => b.issues.includes("no_units")).length,
    no_pricing: buildings.filter((b) => b.issues.includes("no_pricing")).length,
    no_contact: buildings.filter((b) => b.issues.includes("no_contact")).length,
    few_amenities: buildings.filter((b) => b.issues.includes("few_amenities")).length,
    no_location: buildings.filter((b) => b.issues.includes("no_location")).length,
    no_policies: buildings.filter((b) => b.issues.includes("no_policies")).length,
    no_website: buildings.filter((b) => b.issues.includes("no_website")).length,
    grade_a: buildings.filter((b) => b.percentage >= 80).length,
    grade_b: buildings.filter((b) => b.percentage >= 60 && b.percentage < 80).length,
    grade_c: buildings.filter((b) => b.percentage >= 40 && b.percentage < 60).length,
    grade_f: buildings.filter((b) => b.percentage < 40).length,
  };

  return NextResponse.json({ summary, buildings });
}
