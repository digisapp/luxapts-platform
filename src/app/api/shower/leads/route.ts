import { apiError, apiSuccess } from "@/lib/api-helpers";
import { checkShowerAuth } from "@/lib/shower/auth";
import { createAdminClient } from "@/lib/supabase/server";

// GET /api/shower/leads — get the open lead feed for the current shower
// Only returns leads for buildings the shower is certified for
export async function GET() {
  try {
    const auth = await checkShowerAuth();
    if (!auth.isShower) {
      return apiError(auth.error, auth.status);
    }

    const adminClient = createAdminClient();

    // Get buildings this shower is certified for
    const { data: certifiedBuildings } = await adminClient
      .from("shower_certifications")
      .select("building_id")
      .eq("shower_id", auth.showerId)
      .eq("status", "certified")
      .gt("expires_at", new Date().toISOString());

    const buildingIds = (certifiedBuildings || []).map((c) => c.building_id);

    if (buildingIds.length === 0) {
      return apiSuccess({ open_leads: [], claimed_leads: [], past_leads: [] });
    }

    // Fetch open leads for certified buildings (hide client info until claimed)
    const now = new Date().toISOString();
    const { data: openLeads, error: openError } = await adminClient
      .from("showing_leads")
      .select(`
        id, preferred_date, preferred_time, unit_type, notes, created_at, expires_at,
        buildings:building_id (id, name, address)
      `)
      .in("building_id", buildingIds)
      .eq("status", "open")
      .or(`expires_at.is.null,expires_at.gte.${now}`)
      .gte("preferred_date", new Date().toISOString().split("T")[0])
      .order("preferred_date", { ascending: true })
      .order("preferred_time", { ascending: true });

    if (openError) {
      console.error("Get open leads error:", openError);
      return apiError("Failed to load leads", 500);
    }

    // Fetch this shower's claimed/active leads (with full client info)
    const { data: claimedLeads, error: claimedError } = await adminClient
      .from("showing_claims")
      .select(`
        id, claimed_at, status,
        showing_leads:showing_lead_id (
          id, client_name, client_email, client_phone,
          preferred_date, preferred_time, unit_type, special_instructions, status,
          buildings:building_id (id, name, address)
        )
      `)
      .eq("shower_id", auth.showerId)
      .eq("status", "active")
      .order("claimed_at", { ascending: false });

    if (claimedError) {
      console.error("Get claimed leads error:", claimedError);
    }

    // Fetch past showings (last 10)
    const { data: pastLeads } = await adminClient
      .from("showing_claims")
      .select(`
        id, claimed_at, status,
        showing_leads:showing_lead_id (
          id, preferred_date, preferred_time, status,
          buildings:building_id (id, name)
        ),
        showing_debriefs:showing_lead_id (
          id, submitted_at, admin_approved_at, client_rating
        )
      `)
      .eq("shower_id", auth.showerId)
      .neq("status", "active")
      .order("claimed_at", { ascending: false })
      .limit(10);

    return apiSuccess({
      open_leads: openLeads || [],
      claimed_leads: claimedLeads || [],
      past_leads: pastLeads || [],
    });
  } catch (error) {
    console.error("Shower leads feed error:", error);
    return apiError("Internal server error", 500);
  }
}
