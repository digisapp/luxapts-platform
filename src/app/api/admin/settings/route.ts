import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { apiError } from "@/lib/api-helpers";

/**
 * GET /api/admin/settings
 * Fetch platform settings (feature toggles)
 */
export async function GET() {
  try {
    const auth = await checkAdminAuth();
    if (!auth.isAdmin) {
      return apiError(auth.error, auth.status);
    }

    const supabase = createAdminClient();
    const { data: settings, error } = await supabase
      .from("platform_settings")
      .select("key, value");

    if (error) {
      console.error("Fetch settings error:", error);
      return apiError("Failed to fetch settings", 500);
    }

    // Convert array to key-value map
    const settingsMap: Record<string, unknown> = {};
    for (const s of settings || []) {
      settingsMap[s.key] = s.value;
    }

    return NextResponse.json({ settings: settingsMap });
  } catch (error) {
    console.error("Get settings error:", error);
    return apiError("Internal server error", 500);
  }
}

/**
 * PUT /api/admin/settings
 * Update a platform setting
 * Body: { key: string, value: any }
 */
export async function PUT(req: NextRequest) {
  try {
    const auth = await checkAdminAuth();
    if (!auth.isAdmin) {
      return apiError(auth.error, auth.status);
    }

    const { key, value } = (await req.json()) as { key: string; value: unknown };

    if (!key) {
      return apiError("key is required");
    }

    const supabase = createAdminClient();
    const { error } = await supabase
      .from("platform_settings")
      .upsert(
        { key, value, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );

    if (error) {
      console.error("Update setting error:", error);
      return apiError("Failed to update setting", 500);
    }

    return NextResponse.json({ success: true, key, value });
  } catch (error) {
    console.error("Update settings error:", error);
    return apiError("Internal server error", 500);
  }
}
