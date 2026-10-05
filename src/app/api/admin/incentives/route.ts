import { NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-helpers";
import { brokerIncentiveSchema, INCENTIVE_COLUMNS } from "@/lib/broker-incentives";

/** Add a building's broker (OP) commission terms. */
export async function POST(req: Request) {
  const authResult = await checkAdminAuth();
  if (!authResult.isAdmin) {
    return apiError(authResult.error || "Unauthorized", authResult.status);
  }

  const rawBody = await req.json().catch(() => null);
  const parsed = brokerIncentiveSchema.safeParse(rawBody);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message || "Invalid request");
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("broker_incentives")
    .insert(parsed.data)
    .select(INCENTIVE_COLUMNS)
    .single();

  if (error || !data) {
    // 23503: building_id points at a building that no longer exists.
    if (error?.code === "23503") return apiError("That building no longer exists");
    console.error("Create broker incentive error:", error);
    return apiError("Failed to save", 500);
  }

  return NextResponse.json({ incentive: data }, { status: 201 });
}
