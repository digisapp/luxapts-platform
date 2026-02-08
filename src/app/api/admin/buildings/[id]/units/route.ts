import { NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { isValidUUID } from "@/lib/utils";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: Request, context: RouteContext) {
  const authResult = await checkAdminAuth();
  if (!authResult.isAdmin) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }

  const { id } = await context.params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid building ID" }, { status: 400 });
  }

  const body = await req.json();
  const { unitId, is_available } = body;

  if (!unitId || !isValidUUID(unitId)) {
    return NextResponse.json({ error: "Valid unitId required" }, { status: 400 });
  }

  if (typeof is_available !== "boolean") {
    return NextResponse.json({ error: "is_available must be a boolean" }, { status: 400 });
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
    return NextResponse.json({ error: "Unit not found in this building" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("units")
    .update({ is_available })
    .eq("id", unitId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to update unit" }, { status: 500 });
  }

  return NextResponse.json({ unit: data });
}
