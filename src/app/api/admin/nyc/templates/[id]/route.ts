import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { apiError } from "@/lib/api-helpers";
import { isValidUUID } from "@/lib/utils";
import { templateSchema } from "@/lib/crm/validation";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Context) {
  const auth = await checkAdminAuth();
  if (!auth.isAdmin) return apiError(auth.error, auth.status);
  const { id } = await params;
  if (!isValidUUID(id)) return apiError("Invalid template id.");

  const parsed = templateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "Invalid template.");

  const { data, error } = await createAdminClient()
    .from("crm_templates")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, name, channel, subject, body, position")
    .maybeSingle();
  if (error) {
    console.error("NYC template update error:", error);
    return apiError("Could not save the template.", 500);
  }
  if (!data) return apiError("Template not found.", 404);
  return NextResponse.json({ template: data });
}

export async function DELETE(_req: Request, { params }: Context) {
  const auth = await checkAdminAuth();
  if (!auth.isAdmin) return apiError(auth.error, auth.status);
  const { id } = await params;
  if (!isValidUUID(id)) return apiError("Invalid template id.");

  const { data, error } = await createAdminClient().from("crm_templates").delete().eq("id", id).select("id");
  if (error) {
    console.error("NYC template delete error:", error);
    return apiError("Could not delete the template.", 500);
  }
  if (!data?.length) return apiError("Template not found.", 404);
  return NextResponse.json({ deleted: 1 });
}
