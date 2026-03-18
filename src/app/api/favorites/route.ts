import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-helpers";

// GET - Fetch user's favorites
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return apiError("Unauthorized", 401);
    }

    const adminClient = createAdminClient();

    // Check if user_favorites table exists by querying it
    const { data: favorites, error } = await adminClient
      .from("user_favorites")
      .select(`
        id,
        building_id,
        unit_id,
        created_at,
        buildings:building_id (
          id,
          name,
          address_1,
          neighborhoods:neighborhood_id (name),
          cities:city_id (slug)
        )
      `)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      // Table might not exist yet
      if (error.code === "42P01") {
        return NextResponse.json({ favorites: [] });
      }
      console.error("Error fetching favorites:", error);
      return apiError(error.message, 500);
    }

    return NextResponse.json({ favorites: favorites || [] });
  } catch (error) {
    console.error("Get favorites error:", error);
    return apiError("Internal server error", 500);
  }
}

// POST - Add a favorite
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return apiError("Unauthorized", 401);
    }

    const body = await req.json();
    const { building_id, unit_id } = body;

    if (!building_id && !unit_id) {
      return apiError("building_id or unit_id is required");
    }

    const adminClient = createAdminClient();

    // Check if already favorited
    let query = adminClient
      .from("user_favorites")
      .select("id")
      .eq("user_id", user.id);

    if (building_id) {
      query = query.eq("building_id", building_id);
    }
    if (unit_id) {
      query = query.eq("unit_id", unit_id);
    }

    const { data: existing } = await query.maybeSingle();

    if (existing) {
      return NextResponse.json({ message: "Already favorited" });
    }

    // Add favorite
    const { data: favorite, error } = await adminClient
      .from("user_favorites")
      .insert({
        user_id: user.id,
        building_id: building_id || null,
        unit_id: unit_id || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Error adding favorite:", error);
      return apiError(error.message, 500);
    }

    return NextResponse.json({ favorite }, { status: 201 });
  } catch (error) {
    console.error("Add favorite error:", error);
    return apiError("Internal server error", 500);
  }
}

// DELETE - Remove a favorite
export async function DELETE(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return apiError("Unauthorized", 401);
    }

    const { searchParams } = new URL(req.url);
    const building_id = searchParams.get("building_id");
    const unit_id = searchParams.get("unit_id");

    if (!building_id && !unit_id) {
      return apiError("building_id or unit_id is required");
    }

    const adminClient = createAdminClient();

    let query = adminClient
      .from("user_favorites")
      .delete()
      .eq("user_id", user.id);

    if (building_id) {
      query = query.eq("building_id", building_id);
    }
    if (unit_id) {
      query = query.eq("unit_id", unit_id);
    }

    const { error } = await query;

    if (error) {
      console.error("Error removing favorite:", error);
      return apiError(error.message, 500);
    }

    return NextResponse.json({ message: "Favorite removed" });
  } catch (error) {
    console.error("Remove favorite error:", error);
    return apiError("Internal server error", 500);
  }
}
