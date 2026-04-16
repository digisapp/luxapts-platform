import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkPartnerAuth } from "@/lib/partner/auth";
import { apiError } from "@/lib/api-helpers";

// GET /api/partner/buildings — list the partner's own buildings with unit/inquiry counts
export async function GET() {
  try {
    const auth = await checkPartnerAuth();
    if (!auth.isPartner) return apiError(auth.error, auth.status);

    const supabase = createAdminClient();

    const [buildingsRes, unitsRes, imageCountsRes] = await Promise.all([
      supabase
        .from("buildings")
        .select(`
          id, name, address_1, zip, status, website_url,
          year_built, description, pet_policy, parking_policy,
          leasing_phone, leasing_email,
          cities:city_id (id, name, slug),
          neighborhoods:neighborhood_id (id, name, slug)
        `)
        .eq("partner_user_id", auth.userId)
        .order("name"),
      supabase
        .from("units")
        .select("building_id, is_available")
        .in(
          "building_id",
          // Subquery workaround: fetch building IDs first, then reuse
          (await supabase
            .from("buildings")
            .select("id")
            .eq("partner_user_id", auth.userId)
          ).data?.map((b) => b.id) || []
        ),
      supabase
        .from("building_images")
        .select("building_id")
        .in(
          "building_id",
          (await supabase
            .from("buildings")
            .select("id")
            .eq("partner_user_id", auth.userId)
          ).data?.map((b) => b.id) || []
        ),
    ]);

    if (buildingsRes.error) {
      console.error("Partner buildings fetch error:", buildingsRes.error);
      return apiError("Failed to load buildings", 500);
    }

    const unitCountMap: Record<string, { total: number; available: number }> = {};
    for (const u of unitsRes.data || []) {
      if (!unitCountMap[u.building_id]) unitCountMap[u.building_id] = { total: 0, available: 0 };
      unitCountMap[u.building_id].total++;
      if (u.is_available) unitCountMap[u.building_id].available++;
    }

    const imageCountMap: Record<string, number> = {};
    for (const img of imageCountsRes.data || []) {
      imageCountMap[img.building_id] = (imageCountMap[img.building_id] || 0) + 1;
    }

    const buildings = (buildingsRes.data || []).map((b) => ({
      ...b,
      unit_count: unitCountMap[b.id]?.total || 0,
      available_unit_count: unitCountMap[b.id]?.available || 0,
      image_count: imageCountMap[b.id] || 0,
    }));

    return NextResponse.json({ buildings });
  } catch (error) {
    console.error("Partner buildings route error:", error);
    return apiError("Internal server error", 500);
  }
}
