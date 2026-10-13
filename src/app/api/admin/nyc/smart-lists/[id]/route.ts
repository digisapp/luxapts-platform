import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { apiError } from "@/lib/api-helpers";
import { isValidUUID } from "@/lib/utils";

type Context = { params: Promise<{ id: string }> };

/** Delete a saved list (its contacts are untouched). */
export async function DELETE(_req: Request, { params }: Context) {
  const auth = await checkAdminAuth();
  if (!auth.isAdmin) return apiError(auth.error, auth.status);
  const { id } = await params;
  if (!isValidUUID(id)) return apiError("Invalid list id.");

  const { data, error } = await createAdminClient().from("crm_smart_lists").delete().eq("id", id).select("id");
  if (error) {
    console.error("NYC smart list delete error:", error);
    return apiError("Could not delete the list.", 500);
  }
  if (!data?.length) return apiError("List not found.", 404);
  return NextResponse.json({ deleted: 1 });
}
