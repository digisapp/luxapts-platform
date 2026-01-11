import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

interface SearchBody {
  city_slug: string;
  neighborhood_slugs?: string[];
  beds_min?: number;
  beds_max?: number;
  baths_min?: number;
  budget_min?: number;
  budget_max?: number;
  amenities_any?: string[];
  amenities_all?: string[];
  pet_friendly?: boolean;
  parking_required?: boolean;
  move_in_date?: string;
  sort?: "best_match" | "price_low" | "price_high" | "newest" | "sqft_high";
  limit?: number;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SearchBody;
    const limit = Math.min(Math.max(body.limit ?? 20, 1), 50);

    if (!body.city_slug) {
      return NextResponse.json(
        { error: "city_slug is required" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // 1. Resolve city
    const cityRes = await supabase
      .from("cities")
      .select("id, slug, name")
      .eq("slug", body.city_slug)
      .single();

    if (cityRes.error || !cityRes.data) {
      return NextResponse.json({ error: "City not found" }, { status: 404 });
    }

    const cityId = cityRes.data.id;

    // 2. Get building IDs in city (with optional neighborhood filter)
    let buildingsQuery = supabase
      .from("buildings")
      .select("id")
      .eq("city_id", cityId)
      .eq("status", "active");

    if (body.neighborhood_slugs?.length) {
      const neighborhoodRes = await supabase
        .from("neighborhoods")
        .select("id")
        .eq("city_id", cityId)
        .in("slug", body.neighborhood_slugs);

      if (neighborhoodRes.data?.length) {
        const neighborhoodIds = neighborhoodRes.data.map((n) => n.id);
        buildingsQuery = buildingsQuery.in("neighborhood_id", neighborhoodIds);
      }
    }

    // Filter by pet/parking policies if needed
    if (body.pet_friendly) {
      buildingsQuery = buildingsQuery.not("pet_policy", "is", null);
    }
    if (body.parking_required) {
      buildingsQuery = buildingsQuery.not("parking_policy", "is", null);
    }

    const buildingsRes = await buildingsQuery;
    if (buildingsRes.error) {
      return NextResponse.json({ error: buildingsRes.error.message }, { status: 500 });
    }

    const buildingIds = buildingsRes.data?.map((b) => b.id) || [];
    if (!buildingIds.length) {
      return NextResponse.json({
        city: body.city_slug,
        captured_at_max: null,
        results: [],
      });
    }

    // 3. Get available units in these buildings
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

    // Apply bed/bath filters
    if (typeof body.beds_min === "number") {
      unitsQuery = unitsQuery.gte("beds", body.beds_min);
    }
    if (typeof body.beds_max === "number") {
      unitsQuery = unitsQuery.lte("beds", body.beds_max);
    }
    if (typeof body.baths_min === "number") {
      unitsQuery = unitsQuery.gte("baths", body.baths_min);
    }

    // Apply move-in date filter
    if (body.move_in_date) {
      unitsQuery = unitsQuery.lte("available_on", body.move_in_date);
    }

    const unitsRes = await unitsQuery.limit(limit * 2); // Fetch extra for price filtering

    if (unitsRes.error) {
      return NextResponse.json({ error: unitsRes.error.message }, { status: 500 });
    }

    const unitIds = unitsRes.data?.map((u) => u.id) || [];
    if (!unitIds.length) {
      return NextResponse.json({
        city: body.city_slug,
        captured_at_max: null,
        results: [],
      });
    }

    // 4. Get latest price snapshots
    const snapsRes = await supabase
      .from("unit_price_snapshots")
      .select("unit_id, rent, net_effective_rent, lease_term_months, captured_at")
      .in("unit_id", unitIds)
      .order("captured_at", { ascending: false });

    if (snapsRes.error) {
      return NextResponse.json({ error: snapsRes.error.message }, { status: 500 });
    }

    // Map latest snapshot per unit
    const snapByUnit = new Map<string, {
      rent: number;
      net_effective_rent: number | null;
      lease_term_months: number | null;
      captured_at: string;
    }>();

    for (const s of snapsRes.data || []) {
      if (!snapByUnit.has(s.unit_id)) {
        snapByUnit.set(s.unit_id, s);
      }
    }

    // 5. Get unit images (primary image for each unit)
    const unitImagesRes = await supabase
      .from("unit_images")
      .select("id, unit_id, url, alt_text, category, is_primary, sort_order")
      .in("unit_id", unitIds)
      .order("is_primary", { ascending: false })
      .order("sort_order", { ascending: true });

    // Map images by unit (get primary or first available)
    const imagesByUnit = new Map<string, {
      id: string;
      url: string;
      alt_text: string | null;
      category: string | null;
    }[]>();

    for (const img of unitImagesRes.data || []) {
      if (!imagesByUnit.has(img.unit_id)) {
        imagesByUnit.set(img.unit_id, []);
      }
      imagesByUnit.get(img.unit_id)!.push(img);
    }

    // 6. Get building images (as fallback when unit has no images)
    const buildingImagesRes = await supabase
      .from("building_images")
      .select("id, building_id, url, alt_text, category, is_primary, sort_order")
      .in("building_id", buildingIds)
      .order("is_primary", { ascending: false })
      .order("sort_order", { ascending: true });

    // Map images by building
    const imagesByBuilding = new Map<string, {
      id: string;
      url: string;
      alt_text: string | null;
      category: string | null;
    }[]>();

    for (const img of buildingImagesRes.data || []) {
      if (!imagesByBuilding.has(img.building_id)) {
        imagesByBuilding.set(img.building_id, []);
      }
      imagesByBuilding.get(img.building_id)!.push(img);
    }

    // 7. Get floorplans for units that have them
    const floorplanIds = [...new Set(
      (unitsRes.data || [])
        .map(u => u.floorplan_id)
        .filter((id): id is string => id !== null)
    )];

    let floorplansByUnit = new Map<string, {
      id: string;
      name: string;
      layout_image_url: string | null;
    }>();

    if (floorplanIds.length > 0) {
      const floorplansRes = await supabase
        .from("floorplans")
        .select("id, name, layout_image_url")
        .in("id", floorplanIds);

      const floorplansById = new Map(
        (floorplansRes.data || []).map(fp => [fp.id, fp])
      );

      for (const unit of unitsRes.data || []) {
        if (unit.floorplan_id && floorplansById.has(unit.floorplan_id)) {
          floorplansByUnit.set(unit.id, floorplansById.get(unit.floorplan_id)!);
        }
      }
    }

    // 8. Combine and filter by budget
    let results = (unitsRes.data || [])
      .map((u) => {
        const pricing = snapByUnit.get(u.id) || null;
        const unitImages = imagesByUnit.get(u.id) || [];
        const buildingImages = imagesByBuilding.get(u.building_id) || [];
        const floorplan = floorplansByUnit.get(u.id) || null;
        return { unit: u, pricing, unitImages, buildingImages, floorplan };
      })
      .filter((row) => {
        const rent = row.pricing?.rent;
        if (!rent) return false;
        if (typeof body.budget_min === "number" && rent < body.budget_min) return false;
        if (typeof body.budget_max === "number" && rent > body.budget_max) return false;
        return true;
      });

    // 9. Sort results
    const sort = body.sort || "best_match";
    results.sort((a, b) => {
      switch (sort) {
        case "price_low":
          return (a.pricing?.rent || 0) - (b.pricing?.rent || 0);
        case "price_high":
          return (b.pricing?.rent || 0) - (a.pricing?.rent || 0);
        case "sqft_high":
          return (b.unit.sqft || 0) - (a.unit.sqft || 0);
        case "newest":
          return new Date(b.pricing?.captured_at || 0).getTime() -
                 new Date(a.pricing?.captured_at || 0).getTime();
        default: // best_match - could add scoring here
          return 0;
      }
    });

    // Apply limit
    results = results.slice(0, limit);

    // 10. Format response
    const captured_at_max = snapsRes.data?.[0]?.captured_at || null;

    const formattedResults = results.map((row) => ({
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
      // Use unit images if available, otherwise building images
      images: row.unitImages.length > 0 ? row.unitImages : row.buildingImages,
      floorplan: row.floorplan,
    }));

    return NextResponse.json({
      city: body.city_slug,
      captured_at_max,
      results: formattedResults,
    });
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
