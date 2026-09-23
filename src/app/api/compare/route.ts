import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-helpers";
import { getFirstRelation } from "@/lib/db-helpers";
import { isValidUUID } from "@/lib/utils";
import { fetchAvailableUnitPrices } from "@/lib/search/fetch-enrichments";

interface CompareBody {
  building_a_id: string;
  building_b_id: string;
  beds?: number;
}

interface PricedUnit {
  id: string;
  building_id: string;
  latest_rent: number | null;
  beds: number | null;
  price_captured_at: string | null;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as CompareBody | null;

    if (!body?.building_a_id || !body.building_b_id) {
      return apiError("building_a_id and building_b_id are required");
    }
    if (!isValidUUID(body.building_a_id) || !isValidUUID(body.building_b_id)) {
      return apiError("Invalid building ID");
    }

    // Optional bed-count filter advertised in the chat tool schema
    const bedsFilter =
      typeof body.beds === "number" && Number.isInteger(body.beds) && body.beds >= 0 && body.beds <= 10
        ? body.beds
        : null;

    const supabase = createAdminClient();

    // Fetch both buildings
    const [aRes, bRes] = await Promise.all([
      supabase
        .from("buildings")
        .select("id, name, pet_policy, parking_policy, city_id, neighborhood_id, address_1, zip")
        .eq("id", body.building_a_id)
        .single(),
      supabase
        .from("buildings")
        .select("id, name, pet_policy, parking_policy, city_id, neighborhood_id, address_1, zip")
        .eq("id", body.building_b_id)
        .single(),
    ]);

    if (aRes.error || bRes.error) {
      return apiError("Building not found", 404);
    }

    // Fetch amenities for both buildings
    const [aAmenitiesRes, bAmenitiesRes] = await Promise.all([
      supabase
        .from("building_amenities")
        .select("amenities(name)")
        .eq("building_id", body.building_a_id),
      supabase
        .from("building_amenities")
        .select("amenities(name)")
        .eq("building_id", body.building_b_id),
    ]);

    const extractAmenityName = (x: unknown): string | undefined => {
      const item = x as { amenities: { name: string } | { name: string }[] | null };
      return getFirstRelation(item.amenities)?.name;
    };

    const aAmenities = new Set(
      (aAmenitiesRes.data || [])
        .map(extractAmenityName)
        .filter(Boolean) as string[]
    );
    const bAmenities = new Set(
      (bAmenitiesRes.data || [])
        .map(extractAmenityName)
        .filter(Boolean) as string[]
    );

    // Calculate price stats for each building from its currently available
    // units only (chunked + paged by building — no unit-id list in any URL).
    // Previously every unit ever scraped was counted, including long-leased
    // ones, and the id list was sent unchunked.
    async function getPriceStats(buildingId: string) {
      let units: PricedUnit[];
      try {
        units = await fetchAvailableUnitPrices<PricedUnit>(supabase, [buildingId], ["beds", "price_captured_at"]);
      } catch (error) {
        console.error("Compare price stats error:", error);
        return { by_beds: {}, captured_at_max: null as string | null };
      }

      // Group by beds, tracking the newest capture with a real comparison
      const rentsByBeds: Record<string, number[]> = {};
      let captured_at_max: string | null = null;
      for (const u of units) {
        if (u.latest_rent == null || u.beds == null) continue;
        if (bedsFilter !== null && u.beds !== bedsFilter) continue;
        const key = String(u.beds);
        if (!rentsByBeds[key]) rentsByBeds[key] = [];
        rentsByBeds[key].push(u.latest_rent);
        if (u.price_captured_at && (!captured_at_max || u.price_captured_at > captured_at_max)) {
          captured_at_max = u.price_captured_at;
        }
      }

      // Calculate stats
      const stats: Record<string, { min: number; median: number; max: number }> = {};
      for (const [beds, rents] of Object.entries(rentsByBeds)) {
        rents.sort((x, y) => x - y);
        const min = rents[0];
        const max = rents[rents.length - 1];
        const mid = Math.floor(rents.length / 2);
        const median = rents.length % 2
          ? rents[mid]
          : Math.round((rents[mid - 1] + rents[mid]) / 2);
        stats[beds] = { min, median, max };
      }

      return { by_beds: stats, captured_at_max };
    }

    const [aStats, bStats] = await Promise.all([
      getPriceStats(body.building_a_id),
      getPriceStats(body.building_b_id),
    ]);

    // Calculate deltas
    const amenities_only_in_a = [...aAmenities].filter((x) => !bAmenities.has(x));
    const amenities_only_in_b = [...bAmenities].filter((x) => !aAmenities.has(x));

    const captured_at_max = [aStats.captured_at_max, bStats.captured_at_max]
      .filter(Boolean)
      .sort()
      .reverse()[0] || null;

    return NextResponse.json({
      captured_at_max,
      building_a: {
        ...aRes.data,
        amenities: [...aAmenities],
        policies: {
          pets: aRes.data.pet_policy,
          parking: aRes.data.parking_policy,
        },
        price_stats: { by_beds: aStats.by_beds },
        price_captured_at_max: aStats.captured_at_max,
      },
      building_b: {
        ...bRes.data,
        amenities: [...bAmenities],
        policies: {
          pets: bRes.data.pet_policy,
          parking: bRes.data.parking_policy,
        },
        price_stats: { by_beds: bStats.by_beds },
        price_captured_at_max: bStats.captured_at_max,
      },
      deltas: {
        amenities_only_in_a,
        amenities_only_in_b,
      },
    });
  } catch (error) {
    console.error("Compare error:", error);
    return apiError("Internal server error", 500);
  }
}
