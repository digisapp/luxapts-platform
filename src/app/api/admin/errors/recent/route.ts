import { NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { apiError } from "@/lib/api-helpers";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/errors/recent — browser errors in the last 24 hours, for the
 * "Site Errors" sidebar badge. Map-unavailable reports are a browser
 * limitation, not a bug, so they don't count.
 */
export async function GET() {
  try {
    const auth = await checkAdminAuth();
    if (!auth.isAdmin) return apiError(auth.error, auth.status);

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error } = await createAdminClient()
      .from("analytics_events")
      .select("id", { count: "exact", head: true })
      .eq("event_name", "client_error")
      .neq("properties->>source", "map")
      .gte("created_at", since);
    if (error) throw error;

    return NextResponse.json({ count: count ?? 0 });
  } catch (error) {
    console.error("Recent errors count error:", error);
    return apiError("Failed to count errors", 500);
  }
}
