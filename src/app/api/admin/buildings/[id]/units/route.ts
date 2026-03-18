import { NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { isValidUUID } from "@/lib/utils";
import { apiError } from "@/lib/api-helpers";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: Request, context: RouteContext) {
  const authResult = await checkAdminAuth();
  if (!authResult.isAdmin) {
    return apiError(authResult.error || "Unauthorized", authResult.status);
  }

  const { id } = await context.params;
  if (!isValidUUID(id)) {
    return apiError("Invalid building ID");
  }

  const body = await req.json();
  const { unitId, is_available } = body;

  if (!unitId || !isValidUUID(unitId)) {
    return apiError("Valid unitId required");
  }

  if (typeof is_available !== "boolean") {
    return apiError("is_available must be a boolean");
  }

  const supabase = createAdminClient();

  // Verify unit belongs to this building
  const { data: unit, error: unitError } = await supabase
    .from("units")
    .select("id")
    .eq("id", unitId)
    .eq("building_id", id)
    .single();

  if (unitError || !unit) {
    return apiError("Unit not found in this building", 404);
  }

  const { data, error } = await supabase
    .from("units")
    .update({ is_available })
    .eq("id", unitId)
    .select()
    .single();

  if (error) {
    return apiError("Failed to update unit", 500);
  }

  return NextResponse.json({ unit: data });
}
