import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { apiError } from "@/lib/api-helpers";
import { getOverview, listContext } from "@/lib/crm/service";

/** Filter menus, saved lists and every list's count, for the sidebar. */
export async function GET() {
  const auth = await checkAdminAuth();
  if (!auth.isAdmin) return apiError(auth.error, auth.status);
  try {
    return NextResponse.json(await getOverview(createAdminClient(), listContext()));
  } catch (err) {
    console.error("NYC overview error:", err);
    return apiError("Could not load the list counts.", 500);
  }
}
