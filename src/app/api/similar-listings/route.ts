import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-helpers";
import { getFirstRelation } from "@/lib/db-helpers";
import { fetchAvailableUnitPrices } from "@/lib/search/fetch-enrichments";
import { isValidUUID, safeParseInt } from "@/lib/utils";

// Public read-only data — let the CDN serve it (5 min fresh, 1 h stale-while-revalidate)
const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
};

// Candidate buildings examined per pass; the response is capped at
// MAX_LISTINGS after the ±30% price filter.
const CANDIDATE_LIMIT = 10;
const MAX_LISTINGS = 5;

interface CandidateBuilding {
  id: string;
  name: string;
  address_1: string;
  pet_policy: string | null;
  parking_policy: string | null;
  neighborhoods: { name: string; slug: string } | { name: string; slug: string }[] | null;
}

// Typed as plain string so supabase-js doesn't parse the embed grammar at the
// type level; rows are cast to CandidateBuilding below.
const CANDIDATE_SELECT: string = `
  id,
  name,
  address_1,
  pet_policy,
  parking_policy,
  neighborhoods:neighborhood_id (name, slug)
`;

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const buildingId = searchParams.get("buildingId");
    const citySlug = searchParams.get("citySlug");
    const neighborhoodSlug = searchParams.get("neighborhoodSlug");
    const minPrice = safeParseInt(searchParams.get("minPrice"), 0, 0, 1_000_000);
    const maxPrice = safeParseInt(searchParams.get("maxPrice"), 0, 0, 1_000_000);

    if (!buildingId || !citySlug) {
      return apiError("buildingId and citySlug are required");
    }
    if (!isValidUUID(buildingId)) {
      return apiError("Invalid buildingId");
    }

    const supabase = createAdminClient();

    // Get city ID
    const { data: city } = await supabase
      .from("cities")
      .select("id")
      .eq("slug", citySlug)
      .single();

    if (!city) {
      return NextResponse.json({ listings: [] }, { headers: CACHE_HEADERS });
    }

    // Candidate buildings in the city, optionally scoped to a neighborhood.
    // The order is deterministic so the same building page shows the same
    // "similar" set on every load (an unordered LIMIT was arbitrary).
    const fetchCandidates = async (neighborhoodId?: string): Promise<CandidateBuilding[]> => {
      let query = supabase
        .from("buildings")
        .select(CANDIDATE_SELECT)
        .eq("city_id", city.id)
        .eq("status", "active")
        .neq("id", buildingId);
      if (neighborhoodId) query = query.eq("neighborhood_id", neighborhoodId);
      const { data } = await query.order("name").order("id").limit(CANDIDATE_LIMIT);
      return (data || []) as unknown as CandidateBuilding[];
    };

    // Prefer same neighborhood
    let neighborhoodId: string | undefined;
    if (neighborhoodSlug) {
      const { data: neighborhood } = await supabase
        .from("neighborhoods")
        .select("id")
        .eq("slug", neighborhoodSlug)
        .eq("city_id", city.id)
        .single();
      if (neighborhood) neighborhoodId = neighborhood.id;
    }

    let listings: Listing[] = [];
    if (neighborhoodId) {
      listings = await processBuildings(supabase, await fetchCandidates(neighborhoodId), minPrice, maxPrice);
    }

    // City-wide fallback — both when the neighborhood has no other buildings
    // and when the price filter emptied the neighborhood's list (previously
    // only the former fell back, so a pricey building showed nothing).
    if (listings.length === 0) {
      listings = await processBuildings(supabase, await fetchCandidates(), minPrice, maxPrice);
    }

    return NextResponse.json({ listings }, { headers: CACHE_HEADERS });
  } catch (error) {
    console.error("Similar listings error:", error);
    return apiError("Internal server error", 500);
  }
}

interface Listing {
  id: string;
  name: string;
  address: string;
  neighborhood: string;
  image: string;
  minPrice: number;
  minBeds: number;
  maxBeds: number;
  unitCount: number;
  petPolicy: string | null;
  parkingPolicy: string | null;
}

async function processBuildings(
  supabase: ReturnType<typeof createAdminClient>,
  buildings: CandidateBuilding[],
  minPrice: number,
  maxPrice: number
): Promise<Listing[]> {
  if (buildings.length === 0) return [];
  const buildingIds = buildings.map((b) => b.id);

  // Available units with their latest rent (chunked by building, paged) and
  // primary images, in parallel — no unit-id list in any URL
  const [units, { data: images }] = await Promise.all([
    fetchAvailableUnitPrices<{
      id: string;
      building_id: string;
      latest_rent: number | null;
      beds: number | null;
      baths: number | null;
    }>(supabase, buildingIds, ["beds", "baths"]),
    supabase
      .from("building_images")
      .select("building_id, url")
      .in("building_id", buildingIds)
      .eq("is_primary", true),
  ]);

  if (units.length === 0) return [];

  const imageByBuilding: Record<string, string> = {};
  for (const img of images || []) {
    imageByBuilding[img.building_id] = img.url;
  }

  // Aggregate data by building
  const buildingData: Record<
    string,
    { minPrice: number; maxPrice: number; minBeds: number; maxBeds: number; unitCount: number }
  > = {};

  for (const unit of units) {
    const price = unit.latest_rent;
    if (!price) continue;

    // Apply price filter (±30% of the reference building's range)
    if (minPrice > 0 && price < minPrice * 0.7) continue;
    if (maxPrice > 0 && price > maxPrice * 1.3) continue;

    if (!buildingData[unit.building_id]) {
      buildingData[unit.building_id] = {
        minPrice: price,
        maxPrice: price,
        minBeds: unit.beds || 0,
        maxBeds: unit.beds || 0,
        unitCount: 0,
      };
    }

    const bd = buildingData[unit.building_id];
    bd.minPrice = Math.min(bd.minPrice, price);
    bd.maxPrice = Math.max(bd.maxPrice, price);
    bd.minBeds = Math.min(bd.minBeds, unit.beds || 0);
    bd.maxBeds = Math.max(bd.maxBeds, unit.beds || 0);
    bd.unitCount++;
  }

  // Format response — only include buildings with real images
  return buildings
    .filter((b) => buildingData[b.id] && imageByBuilding[b.id])
    .map((b) => {
      const data = buildingData[b.id];
      const neighborhood = getFirstRelation(b.neighborhoods);

      return {
        id: b.id,
        name: b.name,
        address: b.address_1,
        neighborhood: neighborhood?.name || "",
        image: imageByBuilding[b.id],
        minPrice: data.minPrice,
        minBeds: data.minBeds,
        maxBeds: data.maxBeds,
        unitCount: data.unitCount,
        petPolicy: b.pet_policy,
        parkingPolicy: b.parking_policy,
      };
    })
    .slice(0, MAX_LISTINGS);
}
