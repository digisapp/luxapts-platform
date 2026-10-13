import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { apiError } from "@/lib/api-helpers";
import { isValidUUID } from "@/lib/utils";
import { actorName } from "@/lib/crm/service";
import { taskPatchSchema } from "@/lib/crm/validation";

type Context = { params: Promise<{ id: string }> };

/** Complete, reopen, reschedule or rename a follow-up. */
export async function PATCH(req: Request, { params }: Context) {
  const auth = await checkAdminAuth();
  if (!auth.isAdmin) return apiError(auth.error, auth.status);
  const { id } = await params;
  if (!isValidUUID(id)) return apiError("Invalid follow-up id.");

  const parsed = taskPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "Invalid change.");
  const { completed, ...rest } = parsed.data;

  const update: Record<string, unknown> = { ...rest };
  if (completed !== undefined) update.completed_at = completed ? new Date().toISOString() : null;
  if (Object.keys(update).length === 0) return apiError("Nothing to change.");

  const supabase = createAdminClient();
  const { data: task, error } = await supabase
    .from("crm_tasks")
    .update(update)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) {
    console.error("NYC task update error:", error);
    return apiError("Could not update the follow-up.", 500);
  }
  if (!task) return apiError("Follow-up not found.", 404);

  if (completed) {
    const { error: logError } = await supabase.from("crm_activities").insert({
      contact_id: task.contact_id,
      kind: "task",
      body: task.title,
      actor: await actorName(supabase, auth.userId),
      created_by: auth.userId,
    });
    if (logError) console.error("NYC task log error:", logError);
  }

  return NextResponse.json({ task });
}

export async function DELETE(_req: Request, { params }: Context) {
  const auth = await checkAdminAuth();
  if (!auth.isAdmin) return apiError(auth.error, auth.status);
  const { id } = await params;
  if (!isValidUUID(id)) return apiError("Invalid follow-up id.");

  const { data, error } = await createAdminClient().from("crm_tasks").delete().eq("id", id).select("id");
  if (error) {
    console.error("NYC task delete error:", error);
    return apiError("Could not delete the follow-up.", 500);
  }
  if (!data?.length) return apiError("Follow-up not found.", 404);
  return NextResponse.json({ deleted: 1 });
}
