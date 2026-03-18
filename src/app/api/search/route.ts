import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { searchRequestSchema } from "@/lib/validations";
import { apiError } from "@/lib/api-helpers";
import { filterBuildingsByAmenities } from "@/lib/search/amenity-filter";
import { fetchPriceSnapshots, fetchUnitImages, fetchBuildingImages, fetchFloorplans } from "@/lib/search/fetch-enrichments";

export async function POST(req: Request) {
  try {
    const rawBody = await req.json();

    const parsed = searchRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message || "Invalid request");
    }

    const body = parsed.data;
    const limit = body.limit ?? 50;
    const supabase = createAdminClient();
    const emptyResponse = () => NextResponse.json({ city: body.city_slug, captured_at_max: null, results: [] });

    // 1. Resolve city
    const cityRes = await supabase
      .from("cities")
      .select("id, slug, name")
      .eq("slug", body.city_slug)
      .single();

    if (cityRes.error || !cityRes.data) return apiError("City not found", 404);

    // 2. Get building IDs in city (with optional neighborhood/policy filters)
    let buildingsQuery = supabase
      .from("buildings")
      .select("id")
      .eq("city_id", cityRes.data.id)
      .eq("status", "active");

    if (body.neighborhood_slugs?.length) {
      const neighborhoodRes = await supabase
        .from("neighborhoods")
        .select("id")
        .eq("city_id", cityRes.data.id)
        .in("slug", body.neighborhood_slugs);

      if (neighborhoodRes.data?.length) {
        buildingsQuery = buildingsQuery.in("neighborhood_id", neighborhoodRes.data.map(n => n.id));
      }
    }

    if (body.pet_friendly) {
      buildingsQuery = buildingsQuery.not("pet_policy", "is", null)
        .not("pet_policy", "ilike", "%no pet%")
        .not("pet_policy", "ilike", "%not allowed%")
        .not("pet_policy", "ilike", "%no animal%");
    }
    if (body.parking_required) {
      buildingsQuery = buildingsQuery.not("parking_policy", "is", null);
    }

    const buildingsRes = await buildingsQuery;
    if (buildingsRes.error) return apiError(buildingsRes.error.message, 500);

    let buildingIds = buildingsRes.data?.map(b => b.id) || [];
    if (!buildingIds.length) return emptyResponse();

    // 3. Filter by amenities
    buildingIds = await filterBuildingsByAmenities(
      supabase, buildingIds, body.amenities_any, body.amenities_all,
    );
    if (!buildingIds.length) return emptyResponse();

    // 4. Get available units in these buildings
    let unitsQuery = supabase
      .from("units")
      .select(`
        id, building_id, floorplan_id, unit_number, beds, baths, sqft,
        is_available, available_on,
        buildings:building_id (
          id, name, address_1, zip, lat, lng, pet_policy, parking_policy,
          neighborhoods:neighborhood_id ( slug, name )
        )
      `)
      .eq("is_available", true)
      .in("building_id", buildingIds);

    if (typeof body.beds_min === "number") unitsQuery = unitsQuery.gte("beds", body.beds_min);
    if (typeof body.beds_max === "number") unitsQuery = unitsQuery.lte("beds", body.beds_max);
    if (typeof body.baths_min === "number") unitsQuery = unitsQuery.gte("baths", body.baths_min);
    if (body.move_in_date) unitsQuery = unitsQuery.lte("available_on", body.move_in_date);

    const unitsRes = await unitsQuery.limit(limit * 2);
    if (unitsRes.error) return apiError(unitsRes.error.message, 500);

    const unitIds = unitsRes.data?.map(u => u.id) || [];
    if (!unitIds.length) return emptyResponse();

    // 5. Fetch enrichments in parallel
    const [{ snapByUnit, capturedAtMax }, imagesByUnit, imagesByBuilding, floorplansByUnit] =
      await Promise.all([
        fetchPriceSnapshots(supabase, unitIds),
        fetchUnitImages(supabase, unitIds),
        fetchBuildingImages(supabase, buildingIds),
        fetchFloorplans(supabase, unitsRes.data || []),
      ]);

    // 6. Combine, filter by budget + require real images
    let results = (unitsRes.data || [])
      .map(u => ({
        unit: u,
        pricing: snapByUnit.get(u.id) || null,
        unitImages: imagesByUnit.get(u.id) || [],
        buildingImages: imagesByBuilding.get(u.building_id) || [],
        floorplan: floorplansByUnit.get(u.id) || null,
      }))
      .filter(row => {
        if (row.unitImages.length === 0 && row.buildingImages.length === 0) return false;
        const rent = row.pricing?.rent;
        if (!rent) return false;
        if (typeof body.budget_min === "number" && rent < body.budget_min) return false;
        if (typeof body.budget_max === "number" && rent > body.budget_max) return false;
        return true;
      });

    // 7. Sort
    const sort = body.sort || "best_match";
    results.sort((a, b) => {
      switch (sort) {
        case "price_low": return (a.pricing?.rent || 0) - (b.pricing?.rent || 0);
        case "price_high": return (b.pricing?.rent || 0) - (a.pricing?.rent || 0);
        case "sqft_high": return (b.unit.sqft || 0) - (a.unit.sqft || 0);
        case "newest": return new Date(b.pricing?.captured_at || 0).getTime() - new Date(a.pricing?.captured_at || 0).getTime();
        default: return 0;
      }
    });

    results = results.slice(0, limit);

    // 8. Format response
    return NextResponse.json({
      city: body.city_slug,
      captured_at_max: capturedAtMax,
      results: results.map(row => ({
        building: row.unit.buildings,
        unit: {
          id: row.unit.id,
          unit_number: row.unit.unit_number,
          beds: row.unit.beds,
          baths: row.unit.baths,
          sqft: row.unit.sqft,
          available_on: row.unit.available_on,
          floorplan_id: row.unit.floorplan_id,
        },
        pricing: row.pricing,
        images: row.unitImages.length > 0 ? row.unitImages : row.buildingImages,
        floorplan: row.floorplan,
      })),
    });
  } catch (error) {
    console.error("Search error:", error);
    return apiError("Internal server error", 500);
  }
}
