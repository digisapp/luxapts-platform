import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { apiError } from "@/lib/api-helpers";
import { isValidUUID } from "@/lib/utils";
import { actorName, getContactBundle } from "@/lib/crm/service";
import { contactPatchSchema } from "@/lib/crm/validation";

type Context = { params: Promise<{ id: string }> };

/** The contact, its timeline and its follow-ups (the contact page reloads with this). */
export async function GET(_req: Request, { params }: Context) {
  const auth = await checkAdminAuth();
  if (!auth.isAdmin) return apiError(auth.error, auth.status);
  const { id } = await params;
  if (!isValidUUID(id)) return apiError("Invalid contact id.");
  try {
    const bundle = await getContactBundle(createAdminClient(), id);
    if (!bundle) return apiError("Contact not found.", 404);
    return NextResponse.json(bundle);
  } catch (err) {
    console.error("NYC contact load error:", err);
    return apiError("Could not load the contact.", 500);
  }
}

/** Edit a contact. A stage move is also logged on the timeline. */
export async function PATCH(req: Request, { params }: Context) {
  const auth = await checkAdminAuth();
  if (!auth.isAdmin) return apiError(auth.error, auth.status);
  const { id } = await params;
  if (!isValidUUID(id)) return apiError("Invalid contact id.");

  const parsed = contactPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "Invalid changes.");
  const patch = parsed.data;
  if (Object.keys(patch).length === 0) return apiError("Nothing to change.");

  const supabase = createAdminClient();
  const { data: before, error: readError } = await supabase
    .from("crm_contacts")
    .select("stage")
    .eq("id", id)
    .maybeSingle();
  if (readError) return apiError("Could not load the contact.", 500);
  if (!before) return apiError("Contact not found.", 404);

  const { data: contact, error } = await supabase
    .from("crm_contacts")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error || !contact) {
    console.error("NYC contact update error:", error);
    return apiError("Could not save the changes.", 500);
  }

  if (patch.stage && patch.stage !== before.stage) {
    const { error: logError } = await supabase.from("crm_activities").insert({
      contact_id: id,
      kind: "stage",
      body: patch.stage,
      actor: await actorName(supabase, auth.userId),
      created_by: auth.userId,
      meta: { from: before.stage, to: patch.stage },
    });
    if (logError) console.error("NYC stage log error:", logError);
  }

  return NextResponse.json({ contact });
}

export async function DELETE(_req: Request, { params }: Context) {
  const auth = await checkAdminAuth();
  if (!auth.isAdmin) return apiError(auth.error, auth.status);
  const { id } = await params;
  if (!isValidUUID(id)) return apiError("Invalid contact id.");

  // Recoverable: the contact moves to Recently deleted (migration 036).
  const { data, error } = await createAdminClient().rpc("crm_bulk_delete", { p_ids: [id] });
  if (error) {
    console.error("NYC contact delete error:", error);
    return apiError("Could not delete the contact.", 500);
  }
  if (!data) return apiError("Contact not found, or already deleted.", 404);
  return NextResponse.json({ deleted: 1 });
}
