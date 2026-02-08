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
    return NextResponse.json({ error: "Invalid agent ID" }, { status: 400 });
  }

  const body = await req.json();

  const allowedFields = ["status", "commission_rate", "city_id"];
  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body) {
      updates[field] = body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 }
    );
  }

  // Validate status
  if (updates.status && !["active", "paused"].includes(updates.status as string)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  // Validate commission_rate
  if (updates.commission_rate !== undefined) {
    const rate = Number(updates.commission_rate);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      return NextResponse.json(
        { error: "Commission rate must be between 0 and 100" },
        { status: 400 }
      );
    }
    updates.commission_rate = rate;
  }

  // Validate city_id
  if (updates.city_id !== undefined && updates.city_id !== null) {
    if (!isValidUUID(updates.city_id as string)) {
      return NextResponse.json({ error: "Invalid city ID" }, { status: 400 });
    }
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("agents")
    .update(updates)
    .eq("user_id", id)
    .select()
    .single();

  if (error) {
    console.error("Agent update error:", error);
    return NextResponse.json(
      { error: "Failed to update agent" },
      { status: 500 }
    );
  }

  return NextResponse.json({ agent: data });
}
