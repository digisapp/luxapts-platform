import { apiError, apiSuccess } from "@/lib/api-helpers";
import { checkShowerAuth } from "@/lib/shower/auth";
import { createAdminClient } from "@/lib/supabase/server";

// GET /api/shower/certifications — list all certifications for the current shower
export async function GET() {
  try {
    const auth = await checkShowerAuth();
    if (!auth.isShower) {
      return apiError(auth.error, auth.status);
    }

    const adminClient = createAdminClient();

    const { data, error } = await adminClient
      .from("shower_certifications")
      .select(`
        id, status, knowledge_attempts, knowledge_best_score, knowledge_passed_at,
        shadow_count, shadow_completed_at, certified_at, expires_at,
        buildings:building_id (
          id, name, address,
          building_certification_content (
            id, key_selling_points, amenity_notes,
            pet_policy_notes, parking_notes, pricing_notes, shadows_required
          )
        )
      `)
      .eq("shower_id", auth.showerId)
      .order("certified_at", { ascending: false, nullsFirst: false });

    if (error) {
      console.error("Get certifications error:", error);
      return apiError("Failed to load certifications", 500);
    }

    return apiSuccess({ certifications: data || [] });
  } catch (error) {
    console.error("Certifications route error:", error);
    return apiError("Internal server error", 500);
  }
}
