import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkPartnerAuth } from "@/lib/partner/auth";
import { apiError } from "@/lib/api-helpers";

// GET /api/partner/leads — inquiries/leads for this partner's buildings
export async function GET(req: Request) {
  try {
    const auth = await checkPartnerAuth();
    if (!auth.isPartner) return apiError(auth.error, auth.status);

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const limit = Math.min(parseInt(searchParams.get("limit") || "25"), 100);
    const offset = Math.max(parseInt(searchParams.get("offset") || "0"), 0);

    const supabase = createAdminClient();

    // Get partner's building IDs
    const { data: partnerBuildings } = await supabase
      .from("buildings")
      .select("id, name")
      .eq("partner_user_id", auth.userId);

    const buildingIds = (partnerBuildings || []).map((b) => b.id);
    if (buildingIds.length === 0) {
      return NextResponse.json({ leads: [], total: 0 });
    }

    // Get leads targeting partner's buildings via lead_targets
    let query = supabase
      .from("leads")
      .select(`
        id, name, user_email, user_phone, status, source,
        budget_min, budget_max, beds, move_in_date, created_at,
        cities:city_id (name),
        lead_targets!inner (building_id, rank)
      `, { count: "exact" })
      .in("lead_targets.building_id", buildingIds)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq("status", status);
    }

    const { data: leads, error, count } = await query;

    if (error) {
      console.error("Partner leads fetch error:", error);
      return apiError("Failed to load leads", 500);
    }

    // Attach building name to each lead's target for display
    const buildingNameMap = Object.fromEntries(
      (partnerBuildings || []).map((b) => [b.id, b.name])
    );

    const leadsWithBuildings = (leads || []).map((lead) => ({
      ...lead,
      targeted_buildings: (lead.lead_targets || []).map((t: { building_id: string; rank: number | null }) => ({
        building_id: t.building_id,
        building_name: buildingNameMap[t.building_id] || "Unknown",
        rank: t.rank,
      })),
    }));

    return NextResponse.json({ leads: leadsWithBuildings, total: count, limit, offset });
  } catch (error) {
    console.error("Partner leads route error:", error);
    return apiError("Internal server error", 500);
  }
}
