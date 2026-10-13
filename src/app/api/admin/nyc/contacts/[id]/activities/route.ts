import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { apiError } from "@/lib/api-helpers";
import { isValidUUID } from "@/lib/utils";
import { actorName } from "@/lib/crm/service";
import { activityCreateSchema } from "@/lib/crm/validation";

type Context = { params: Promise<{ id: string }> };

/**
 * Log a note, call, text, email or WhatsApp on a contact's timeline. Calls,
 * texts and emails default to outbound; the crm_activity_touch trigger then
 * stamps the contact as contacted (or replied, for inbound).
 */
export async function POST(req: Request, { params }: Context) {
  const auth = await checkAdminAuth();
  if (!auth.isAdmin) return apiError(auth.error, auth.status);
  const { id } = await params;
  if (!isValidUUID(id)) return apiError("Invalid contact id.");

  const parsed = activityCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "Invalid entry.");
  const a = parsed.data;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("crm_activities")
    .insert({
      contact_id: id,
      kind: a.kind,
      direction: a.kind === "note" ? null : (a.direction ?? "outbound"),
      outcome: a.outcome ?? null,
      body: a.body || null,
      actor: await actorName(supabase, auth.userId),
      created_by: auth.userId,
    })
    .select("*")
    .single();
  if (error) {
    // 23503: the contact was deleted in another tab.
    if (error.code === "23503") return apiError("Contact not found.", 404);
    console.error("NYC activity create error:", error);
    return apiError("Could not log it.", 500);
  }
  return NextResponse.json({ activity: data }, { status: 201 });
}
