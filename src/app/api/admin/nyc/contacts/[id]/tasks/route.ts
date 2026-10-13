import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { apiError } from "@/lib/api-helpers";
import { isValidUUID } from "@/lib/utils";
import { taskCreateSchema } from "@/lib/crm/validation";

type Context = { params: Promise<{ id: string }> };

/** Set a follow-up. crm_tasks_sync_next() moves the contact's next_task_on. */
export async function POST(req: Request, { params }: Context) {
  const auth = await checkAdminAuth();
  if (!auth.isAdmin) return apiError(auth.error, auth.status);
  const { id } = await params;
  if (!isValidUUID(id)) return apiError("Invalid contact id.");

  const parsed = taskCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "Invalid follow-up.");

  const { data, error } = await createAdminClient()
    .from("crm_tasks")
    .insert({ contact_id: id, ...parsed.data, created_by: auth.userId })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23503") return apiError("Contact not found.", 404);
    console.error("NYC task create error:", error);
    return apiError("Could not set the follow-up.", 500);
  }
  return NextResponse.json({ task: data }, { status: 201 });
}
