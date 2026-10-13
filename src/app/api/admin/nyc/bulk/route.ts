import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { apiError } from "@/lib/api-helpers";
import { actorName, collectIds, listContext } from "@/lib/crm/service";
import { bulkSchema } from "@/lib/crm/validation";

/**
 * Stage, tag, type or delete for many contacts at once: the selected ids,
 * or everyone a filter matches ("all 10,583 in this list"). Ids travel in
 * the RPC's POST body, so there is no URL-length ceiling.
 */
export async function POST(req: Request) {
  const auth = await checkAdminAuth();
  if (!auth.isAdmin) return apiError(auth.error, auth.status);

  const parsed = bulkSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "Invalid bulk action.");
  const { ids: givenIds, filters, action, value } = parsed.data;

  const supabase = createAdminClient();
  try {
    const ids = givenIds ?? (await collectIds(supabase, filters ?? {}, listContext()));
    if (ids.length === 0) return NextResponse.json({ updated: 0 });

    if (action === "delete") {
      const { data, error } = await supabase.rpc("crm_bulk_delete", { p_ids: ids });
      if (error) throw error;
      return NextResponse.json({ deleted: data ?? 0 });
    }

    if (action === "kind") {
      const { data, error } = await supabase.rpc("crm_bulk_set_kind", { p_ids: ids, p_kind: value });
      if (error) throw error;
      return NextResponse.json({ updated: data ?? 0 });
    }

    const { data, error } = await supabase.rpc("crm_bulk_update", {
      p_ids: ids,
      p_stage: action === "stage" ? value : null,
      p_add_tag: action === "add_tag" ? value : null,
      p_remove_tag: action === "remove_tag" ? value : null,
      p_actor: await actorName(supabase, auth.userId),
      p_actor_id: auth.userId,
    });
    if (error) throw error;
    return NextResponse.json({ updated: data ?? 0 });
  } catch (err) {
    console.error("NYC bulk action error:", err);
    return apiError("The bulk change failed. Nothing may have changed; refresh and retry.", 500);
  }
}
