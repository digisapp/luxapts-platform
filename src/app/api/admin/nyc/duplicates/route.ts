import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { apiError } from "@/lib/api-helpers";
import { safeParseInt } from "@/lib/utils";
import { getDuplicatePairs } from "@/lib/crm/service";

/** Suggested duplicate pairs: ?confidence=high|check&offset=N. */
export async function GET(req: Request) {
  const auth = await checkAdminAuth();
  if (!auth.isAdmin) return apiError(auth.error, auth.status);
  const params = new URL(req.url).searchParams;
  const confidence = params.get("confidence") === "check" ? "check" : "high";
  try {
    return NextResponse.json(
      await getDuplicatePairs(createAdminClient(), confidence, safeParseInt(params.get("offset"), 0, 0, 100_000))
    );
  } catch (err) {
    console.error("NYC duplicates error:", err);
    return apiError("Could not load duplicates.", 500);
  }
}

const actionSchema = z.discriminatedUnion("action", [
  // Keep one record, fold the other into it (undoable).
  z.object({ action: z.literal("merge"), keep: z.uuid(), merge: z.uuid() }),
  // "Not the same person": never suggest this pair again.
  z.object({ action: z.literal("dismiss"), a: z.uuid(), b: z.uuid() }),
  // Undo of the above.
  z.object({ action: z.literal("undismiss"), a: z.uuid(), b: z.uuid() }),
]);

export async function POST(req: Request) {
  const auth = await checkAdminAuth();
  if (!auth.isAdmin) return apiError(auth.error, auth.status);
  const parsed = actionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "Invalid request.");
  const supabase = createAdminClient();

  if (parsed.data.action === "merge") {
    const { keep, merge } = parsed.data;
    if (keep === merge) return apiError("Pick two different contacts.");
    const { data, error } = await supabase.rpc("crm_merge_contacts", { p_keep: keep, p_merge: merge, p_actor: auth.userId });
    if (error) {
      // The function's own messages ("already merged", "not found") are meant for people.
      const known = /cannot be merged|not found|Only contacts/i.test(error.message);
      if (!known) console.error("NYC merge error:", error);
      return apiError(known ? error.message : "Could not merge.", known ? 409 : 500);
    }
    return NextResponse.json({ merge_id: data });
  }

  const [a, b] = [parsed.data.a, parsed.data.b].sort();
  if (a === b) return apiError("Pick two different contacts.");
  if (parsed.data.action === "undismiss") {
    const { error } = await supabase.from("crm_duplicate_dismissals").delete().eq("a", a).eq("b", b);
    if (error) {
      console.error("NYC undismiss error:", error);
      return apiError("Could not undo that.", 500);
    }
    return NextResponse.json({ dismissed: false });
  }
  const { error } = await supabase.from("crm_duplicate_dismissals").upsert({ a, b }, { onConflict: "a,b", ignoreDuplicates: true });
  if (error) {
    console.error("NYC dismiss error:", error);
    return apiError("Could not save that.", 500);
  }
  return NextResponse.json({ dismissed: true });
}
