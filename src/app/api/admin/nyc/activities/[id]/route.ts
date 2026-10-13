import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { apiError } from "@/lib/api-helpers";
import { isValidUUID } from "@/lib/utils";

type Context = { params: Promise<{ id: string }> };

/**
 * Delete a note written here. Calls, texts and imported history stay: they
 * are the record the "contacted" and "replied" stamps were computed from.
 */
export async function DELETE(_req: Request, { params }: Context) {
  const auth = await checkAdminAuth();
  if (!auth.isAdmin) return apiError(auth.error, auth.status);
  const { id } = await params;
  if (!isValidUUID(id)) return apiError("Invalid entry id.");

  const { data, error } = await createAdminClient()
    .from("crm_activities")
    .delete()
    .eq("id", id)
    .eq("kind", "note")
    .is("import_key", null)
    .select("id");
  if (error) {
    console.error("NYC activity delete error:", error);
    return apiError("Could not delete the note.", 500);
  }
  if (!data?.length) return apiError("Only notes written here can be deleted.", 404);
  return NextResponse.json({ deleted: 1 });
}
