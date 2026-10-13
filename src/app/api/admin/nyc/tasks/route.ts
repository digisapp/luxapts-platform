import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { apiError } from "@/lib/api-helpers";
import { countDue, countNewReplies, getAgenda } from "@/lib/crm/service";
import { nyDateKey } from "@/lib/crm/dates";

/**
 * The Today agenda: open follow-ups due within a week, overdue first.
 * ?count=1 returns only the tab badges: follow-ups due, and replies from
 * the last three days still waiting on an answer.
 */
export async function GET(req: Request) {
  const auth = await checkAdminAuth();
  if (!auth.isAdmin) return apiError(auth.error, auth.status);
  const today = nyDateKey();
  const supabase = createAdminClient();
  try {
    if (new URL(req.url).searchParams.get("count") === "1") {
      const [due, newReplies] = await Promise.all([countDue(supabase, today), countNewReplies(supabase)]);
      return NextResponse.json({ today, due, newReplies });
    }
    return NextResponse.json({ today, tasks: await getAgenda(supabase, today) });
  } catch (err) {
    console.error("NYC agenda error:", err);
    return apiError("Could not load follow-ups.", 500);
  }
}
