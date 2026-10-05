import { NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { isValidUUID } from "@/lib/utils";
import { apiError } from "@/lib/api-helpers";
import { brokerIncentivePatchSchema, INCENTIVE_COLUMNS } from "@/lib/broker-incentives";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: Request, context: RouteContext) {
  const authResult = await checkAdminAuth();
  if (!authResult.isAdmin) {
    return apiError(authResult.error || "Unauthorized", authResult.status);
  }

  const { id } = await context.params;
  if (!isValidUUID(id)) return apiError("Invalid incentive ID");

  const rawBody = await req.json().catch(() => null);
  const parsed = brokerIncentivePatchSchema.safeParse(rawBody);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message || "Invalid request");
  }
  // Only fields actually sent: an omitted field is left as it is.
  const updates = Object.fromEntries(
    Object.entries(parsed.data).filter(([, v]) => v !== undefined)
  );
  if (Object.keys(updates).length === 0) return apiError("No valid fields to update");

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("broker_incentives")
    .update(updates)
    .eq("id", id)
    .select(INCENTIVE_COLUMNS)
    .maybeSingle();

  if (error) {
    if (error.code === "23503") return apiError("That building no longer exists");
    console.error("Update broker incentive error:", error);
    return apiError("Failed to save", 500);
  }
  if (!data) return apiError("Not found", 404);

  return NextResponse.json({ incentive: data });
}

export async function DELETE(_req: Request, context: RouteContext) {
  const authResult = await checkAdminAuth();
  if (!authResult.isAdmin) {
    return apiError(authResult.error || "Unauthorized", authResult.status);
  }

  const { id } = await context.params;
  if (!isValidUUID(id)) return apiError("Invalid incentive ID");

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("broker_incentives")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) {
    console.error("Delete broker incentive error:", error);
    return apiError("Failed to delete", 500);
  }
  if (!data?.length) return apiError("Not found", 404);

  return NextResponse.json({ deleted: id });
}
