import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { apiError } from "@/lib/api-helpers";
import { senderSchema } from "@/lib/crm/validation";

/** Save who the templates say is writing ({my_name}, {company}). */
export async function PUT(req: Request) {
  const auth = await checkAdminAuth();
  if (!auth.isAdmin) return apiError(auth.error, auth.status);

  const parsed = senderSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "Invalid settings.");

  const now = new Date().toISOString();
  const { error } = await createAdminClient()
    .from("crm_settings")
    .upsert(
      [
        { key: "sender_name", value: parsed.data.name, updated_at: now },
        { key: "company", value: parsed.data.company, updated_at: now },
      ],
      { onConflict: "key" }
    );
  if (error) {
    console.error("NYC settings save error:", error);
    return apiError("Could not save.", 500);
  }
  return NextResponse.json({ sender: parsed.data });
}
