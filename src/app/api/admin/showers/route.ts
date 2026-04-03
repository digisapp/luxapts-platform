import { apiError, apiSuccess } from "@/lib/api-helpers";
import { checkAdminAuth } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/server";

// GET /api/admin/showers — list all showers
export async function GET(req: Request) {
  try {
    const auth = await checkAdminAuth();
    if (!auth.isAdmin) return apiError(auth.error, auth.status);

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    const adminClient = createAdminClient();

    let query = adminClient
      .from("showers")
      .select(`
        id, display_name, phone, bio, photo_url,
        status, tier, total_showings, avg_rating, strike_count,
        agreement_accepted, agreement_accepted_at,
        approved_at, suspension_reason, created_at, updated_at,
        user_id
      `)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status as "pending" | "approved" | "suspended" | "terminated");
    }

    if (search) {
      const sanitized = search.replace(/[%_\\]/g, "");
      if (sanitized) {
        query = query.ilike("display_name", `%${sanitized}%`);
      }
    }

    const { data, error, count } = await query;

    if (error) {
      console.error("List showers error:", error);
      return apiError("Failed to load showers", 500);
    }

    return apiSuccess({ showers: data || [], total: count });
  } catch (error) {
    console.error("Admin showers GET error:", error);
    return apiError("Internal server error", 500);
  }
}
