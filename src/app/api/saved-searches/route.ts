import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-helpers";
import { z } from "zod";
import { isValidUUID } from "@/lib/utils";

// This route backs useSavedSearches' DB sync and the saved-search-alerts
// cron job (which reads user_saved_searches for email_alerts = true).

const filtersSchema = z
  .object({
    city: z.string().max(100).optional(),
    neighborhood: z.string().max(100).optional(),
    bedsMin: z.number().int().min(0).max(10).optional(),
    bedsMax: z.number().int().min(0).max(10).optional(),
    budgetMin: z.number().min(0).max(1_000_000).optional(),
    budgetMax: z.number().min(0).max(1_000_000).optional(),
    petFriendly: z.boolean().optional(),
  })
  .strict();

const createSearchSchema = z.object({
  name: z.string().min(1).max(200),
  query_params: filtersSchema,
  email_alerts: z.boolean().optional(),
});

const updateSearchSchema = z.object({
  id: z.string().refine(isValidUUID, "Invalid id"),
  name: z.string().min(1).max(200).optional(),
  query_params: filtersSchema.optional(),
  email_alerts: z.boolean().optional(),
});

const MAX_SEARCHES = 10;

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

// GET - Fetch user's saved searches
export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return apiError("Unauthorized", 401);

    const adminClient = createAdminClient();
    const { data: searches, error } = await adminClient
      .from("user_saved_searches")
      .select("id, name, query_params, email_alerts, created_at, updated_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching saved searches:", error);
      return apiError("Failed to fetch saved searches", 500);
    }

    return NextResponse.json({ searches: searches || [] });
  } catch (error) {
    console.error("Get saved searches error:", error);
    return apiError("Internal server error", 500);
  }
}

// POST - Create a saved search
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (!user) return apiError("Unauthorized", 401);

    const parsed = createSearchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message || "Invalid request");
    }

    const adminClient = createAdminClient();

    // Upsert-by-name semantics: the hook syncs by name, so replace an
    // existing search with the same name rather than duplicating it.
    const { data: existing } = await adminClient
      .from("user_saved_searches")
      .select("id")
      .eq("user_id", user.id)
      .eq("name", parsed.data.name)
      .maybeSingle();

    if (existing) {
      const { data: search, error } = await adminClient
        .from("user_saved_searches")
        .update({
          query_params: parsed.data.query_params,
          email_alerts: parsed.data.email_alerts ?? false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select("id, name, query_params, email_alerts, created_at, updated_at")
        .single();

      if (error) {
        console.error("Error updating saved search:", error);
        return apiError("Failed to save search", 500);
      }
      return NextResponse.json({ search });
    }

    // Enforce the same cap the client uses
    const { count } = await adminClient
      .from("user_saved_searches")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    if ((count ?? 0) >= MAX_SEARCHES) {
      return apiError(`Maximum of ${MAX_SEARCHES} saved searches reached`, 400);
    }

    const { data: search, error } = await adminClient
      .from("user_saved_searches")
      .insert({
        user_id: user.id,
        name: parsed.data.name,
        query_params: parsed.data.query_params,
        email_alerts: parsed.data.email_alerts ?? false,
      })
      .select("id, name, query_params, email_alerts, created_at, updated_at")
      .single();

    if (error) {
      console.error("Error creating saved search:", error);
      return apiError("Failed to save search", 500);
    }

    return NextResponse.json({ search }, { status: 201 });
  } catch (error) {
    console.error("Create saved search error:", error);
    return apiError("Internal server error", 500);
  }
}

// PUT - Update a saved search (e.g. toggle email alerts)
export async function PUT(req: Request) {
  try {
    const user = await requireUser();
    if (!user) return apiError("Unauthorized", 401);

    const parsed = updateSearchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message || "Invalid request");
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.query_params !== undefined) updates.query_params = parsed.data.query_params;
    if (parsed.data.email_alerts !== undefined) updates.email_alerts = parsed.data.email_alerts;

    const adminClient = createAdminClient();
    const { data: search, error } = await adminClient
      .from("user_saved_searches")
      .update(updates)
      .eq("id", parsed.data.id)
      .eq("user_id", user.id)
      .select("id, name, query_params, email_alerts, created_at, updated_at")
      .single();

    if (error) {
      console.error("Error updating saved search:", error);
      return apiError("Failed to update search", 500);
    }

    return NextResponse.json({ search });
  } catch (error) {
    console.error("Update saved search error:", error);
    return apiError("Internal server error", 500);
  }
}

// DELETE - Remove a saved search (?id=...)
export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    if (!user) return apiError("Unauthorized", 401);

    const id = new URL(req.url).searchParams.get("id");
    if (!id || !isValidUUID(id)) {
      return apiError("Valid id query param is required");
    }

    const adminClient = createAdminClient();
    const { error } = await adminClient
      .from("user_saved_searches")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      console.error("Error deleting saved search:", error);
      return apiError("Failed to delete search", 500);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete saved search error:", error);
    return apiError("Internal server error", 500);
  }
}
