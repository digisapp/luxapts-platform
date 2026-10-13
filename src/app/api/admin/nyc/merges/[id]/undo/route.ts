import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { apiError } from "@/lib/api-helpers";
import { isValidUUID } from "@/lib/utils";

type Context = { params: Promise<{ id: string }> };

/** Split a merge back into the two contacts it joined. */
export async function POST(_req: Request, { params }: Context) {
  const auth = await checkAdminAuth();
  if (!auth.isAdmin) return apiError(auth.error, auth.status);
  const { id } = await params;
  if (!isValidUUID(id)) return apiError("Invalid merge id.");

  const { error } = await createAdminClient().rpc("crm_undo_merge", { p_merge_id: id });
  if (error) {
    if (/already undone/i.test(error.message)) return apiError("This merge was already undone.", 409);
    console.error("NYC undo merge error:", error);
    return apiError("Could not undo the merge.", 500);
  }
  return NextResponse.json({ undone: true });
}
