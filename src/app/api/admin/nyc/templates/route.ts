import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { apiError } from "@/lib/api-helpers";
import { templateSchema } from "@/lib/crm/validation";

const MAX_TEMPLATES = 40;

export async function POST(req: Request) {
  const auth = await checkAdminAuth();
  if (!auth.isAdmin) return apiError(auth.error, auth.status);

  const parsed = templateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "Invalid template.");

  const supabase = createAdminClient();
  const { count } = await supabase.from("crm_templates").select("id", { count: "exact", head: true });
  if ((count ?? 0) >= MAX_TEMPLATES) return apiError(`You can keep up to ${MAX_TEMPLATES} templates.`);

  const { data, error } = await supabase
    .from("crm_templates")
    .insert({ ...parsed.data, position: count ?? 0 })
    .select("id, name, channel, subject, body, position")
    .single();
  if (error) {
    console.error("NYC template create error:", error);
    return apiError("Could not save the template.", 500);
  }
  return NextResponse.json({ template: data }, { status: 201 });
}
