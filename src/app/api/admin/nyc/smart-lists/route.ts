import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { apiError } from "@/lib/api-helpers";
import { smartListCreateSchema } from "@/lib/crm/validation";
import { hasFilters } from "@/lib/crm/filters";

const MAX_LISTS = 30;

/** Save the current filters as a named list. */
export async function POST(req: Request) {
  const auth = await checkAdminAuth();
  if (!auth.isAdmin) return apiError(auth.error, auth.status);

  const parsed = smartListCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "Invalid list.");
  if (!hasFilters(parsed.data.filters)) return apiError("Set at least one filter first.");

  const supabase = createAdminClient();
  const { count } = await supabase.from("crm_smart_lists").select("id", { count: "exact", head: true });
  if ((count ?? 0) >= MAX_LISTS) return apiError(`You can keep up to ${MAX_LISTS} lists. Delete one first.`);

  const { data, error } = await supabase
    .from("crm_smart_lists")
    .insert({ name: parsed.data.name, filters: parsed.data.filters, position: count ?? 0 })
    .select("id, name, filters, position")
    .single();
  if (error) {
    console.error("NYC smart list create error:", error);
    return apiError("Could not save the list.", 500);
  }
  return NextResponse.json({ list: data }, { status: 201 });
}
