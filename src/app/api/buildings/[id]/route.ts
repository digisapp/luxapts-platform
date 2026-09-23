import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { isValidUUID } from "@/lib/utils";
import { apiError } from "@/lib/api-helpers";
import { fetchAvailableUnitPrices } from "@/lib/search/fetch-enrichments";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Validate UUID to prevent invalid queries
    if (!isValidUUID(id)) {
      return apiError("Invalid building ID");
    }

    const supabase = createAdminClient();

    // Fetch building with relations first (needed to validate existence)
    const buildingRes = await supabase
      .from("buildings")
      .select(`
        *,
        cities:city_id (id, name, slug, state),
        neighborhoods:neighborhood_id (id, name, slug)
      `)
      .eq("id", id)
      .eq("status", "active")
      .single();

    if (buildingRes.error || !buildingRes.data) {
      return apiError("Building not found", 404);
    }

    // Fetch amenities, floorplans, units, and facts in parallel
    const [amenitiesRes, floorplansRes, unitsRes, factsRes] = await Promise.all([
      supabase
        .from("building_amenities")
        .select("details, amenities(id, name, category, icon)")
        .eq("building_id", id),
      supabase
        .from("floorplans")
        .select("*")
        .eq("building_id", id)
        .order("beds", { ascending: true }),
      supabase
        .from("units")
        .select("*")
        .eq("building_id", id)
        .eq("is_available", true),
      supabase
        .from("building_facts")
        .select("key, value, source, updated_at")
        .eq("building_id", id),
    ]);

    // Log non-fatal parallel query errors (don't fail the response — fallbacks are used below)
    if (amenitiesRes.error) console.error("Amenities query error:", amenitiesRes.error.message);
    if (floorplansRes.error) console.error("Floorplans query error:", floorplansRes.error.message);
    if (unitsRes.error) console.error("Units query error:", unitsRes.error.message);
    if (factsRes.error) console.error("Facts query error:", factsRes.error.message);

    // Get latest prices for units (depends on unitsRes).
    // Reads one row per unit from units_with_latest_price instead of pulling
    // the whole unit_price_snapshots history through an unbounded `.in()`:
    // that URL 400'd past ~150 unit ids and was truncated at the 1000-row cap.
    const unitPrices: Record<string, { rent: number; captured_at: string }> = {};
    if (unitsRes.data?.length) {
      const priced = await fetchAvailableUnitPrices<{
        id: string;
        building_id: string;
        latest_rent: number | null;
        price_captured_at: string | null;
      }>(supabase, [id], ["price_captured_at"]);

      for (const p of priced) {
        if (p.latest_rent != null) {
          unitPrices[p.id] = {
            rent: p.latest_rent,
            captured_at: p.price_captured_at ?? "",
          };
        }
      }
    }

    // Calculate price range
    const prices = Object.values(unitPrices).map((p) => p.rent);
    const priceRange = prices.length
      ? { min: Math.min(...prices), max: Math.max(...prices) }
      : null;

    // Public route: never expose which account owns a partner listing
    const publicBuilding: Record<string, unknown> = { ...buildingRes.data };
    delete publicBuilding.partner_user_id;

    return NextResponse.json({
      building: {
        ...publicBuilding,
        amenities: (amenitiesRes.data || []).map((a) => ({
          ...a.amenities,
          details: a.details,
        })),
        floorplans: floorplansRes.data || [],
        units: (unitsRes.data || []).map((u) => ({
          ...u,
          latest_price: unitPrices[u.id] || null,
        })),
        facts: factsRes.data || [],
        price_range: priceRange,
      },
    });
  } catch (error) {
    console.error("Get building error:", error);
    return apiError("Internal server error", 500);
  }
}
