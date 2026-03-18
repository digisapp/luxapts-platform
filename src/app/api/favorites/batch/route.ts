import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { batchFavoritesSchema } from "@/lib/validations";
import { apiError } from "@/lib/api-helpers";

// POST - Batch sync favorites (reduces N+1 API calls to 1)
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return apiError("Unauthorized", 401);
    }

    const rawBody = await req.json();
    const parsed = batchFavoritesSchema.safeParse(rawBody);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || "Invalid request";
      return apiError(firstError);
    }

    const { favorites } = parsed.data;
    const adminClient = createAdminClient();

    // Fetch existing favorites for this user
    const { data: existing } = await adminClient
      .from("user_favorites")
      .select("building_id, unit_id")
      .eq("user_id", user.id);

    const existingSet = new Set(
      (existing || []).map(
        (f) => `${f.building_id || ""}-${f.unit_id || ""}`
      )
    );

    // Filter to only new favorites
    const newFavorites = favorites.filter(
      (f) => !existingSet.has(`${f.building_id || ""}-${f.unit_id || ""}`)
    );

    if (newFavorites.length === 0) {
      return NextResponse.json({ added: 0 });
    }

    // Batch insert all new favorites at once
    const rows = newFavorites.map((f) => ({
      user_id: user.id,
      building_id: f.building_id || null,
      unit_id: f.unit_id || null,
    }));

    const { error } = await adminClient.from("user_favorites").insert(rows);

    if (error) {
      console.error("Batch favorites insert error:", error);
      return apiError(error.message, 500);
    }

    return NextResponse.json({ added: newFavorites.length }, { status: 201 });
  } catch (error) {
    console.error("Batch favorites error:", error);
    return apiError("Internal server error", 500);
  }
}
