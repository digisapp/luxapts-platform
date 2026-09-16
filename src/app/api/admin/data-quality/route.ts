import { NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-helpers";
import { fetchAllRows, getFirstRelation } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

type CityRel = { name: string; slug: string };

type DataQualityBuilding = {
  id: string;
  name: string;
  address_1: string | null;
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
  city_id: string | null;
  cities: CityRel | CityRel[] | null;
};

const BUILDING_COLUMNS = `
  id, name, address_1, zip, status, description, website_url,
  leasing_phone, leasing_email, pet_policy, parking_policy, deposit_policy,
  year_built, stories, lat, lng, hero_image_url,
  city_id,
  cities:city_id (name, slug)
`;

export async function GET() {
  const authResult = await checkAdminAuth();
  if (!authResult.isAdmin) {
    return apiError(authResult.error || "Unauthorized", authResult.status);
  }

  const supabase = createAdminClient();

  // Every one of these reads used to stop at PostgREST's 1000-row cap, so the
  // per-building image/unit/amenity counts (and therefore every score and the
  // whole summary) were wrong the moment a table passed 1000 rows —
  // unit_price_snapshots is already 8k+. They are paged now, and the snapshot
  // history is read as one row per unit from units_with_latest_price instead
  // of the full history.
  let buildingsError: unknown = null;

  const [buildingRows, imageRows, unitRows, amenityRows] = await Promise.all([
    fetchAllRows<DataQualityBuilding>(async (from, to) => {
      const res = await supabase
        .from("buildings")
        .select(BUILDING_COLUMNS)
        .eq("status", "active")
        .order("name")
        .order("id")
        .range(from, to);
      if (res.error) buildingsError = res.error;
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

  if (buildingsError) {
    console.error("Data quality buildings query error:", buildingsError);
    return apiError("Failed to fetch buildings", 500);
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

    const cityData = getFirstRelation(b.cities);

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
