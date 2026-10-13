import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { apiError } from "@/lib/api-helpers";
import { isValidUUID } from "@/lib/utils";

type Context = { params: Promise<{ id: string }> };

/** Bring a contact back from Recently deleted. */
export async function POST(_req: Request, { params }: Context) {
  const auth = await checkAdminAuth();
  if (!auth.isAdmin) return apiError(auth.error, auth.status);
  const { id } = await params;
  if (!isValidUUID(id)) return apiError("Invalid contact id.");

  const { data, error } = await createAdminClient().rpc("crm_bulk_restore", { p_ids: [id] });
  if (error) {
    console.error("NYC restore error:", error);
    return apiError("Could not restore the contact.", 500);
  }
  if (!data) return apiError("This contact is not in Recently deleted.", 404);
  return NextResponse.json({ restored: 1 });
}
