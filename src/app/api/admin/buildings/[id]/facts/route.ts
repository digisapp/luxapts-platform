import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { apiError } from "@/lib/api-helpers";

// GET /api/admin/buildings/[id]/facts
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await checkAdminAuth();
  if (!authResult.isAdmin) return apiError(authResult.error || "Unauthorized", authResult.status);

  const { id } = await params;
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("building_facts")
    .select("id, key, value, created_at")
    .eq("building_id", id)
    .order("key");

  if (error) return apiError("Failed to load facts", 500);
  return NextResponse.json({ facts: data || [] });
}

const UpsertSchema = z.object({
  key: z.string().min(1).max(100).regex(/^[a-z0-9_]+$/, "Key must be lowercase letters, numbers, underscores"),
  value: z.string().min(1).max(500),
});

// POST /api/admin/buildings/[id]/facts — upsert a fact
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await checkAdminAuth();
  if (!authResult.isAdmin) return apiError(authResult.error || "Unauthorized", authResult.status);

  const { id } = await params;
  const body = await req.json();
  const parsed = UpsertSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "Invalid input", 400);

  const supabase = createAdminClient();

  // Upsert by building_id + key
  const { data, error } = await supabase
    .from("building_facts")
    .upsert(
      { building_id: id, key: parsed.data.key, value: String(parsed.data.value) },
      { onConflict: "building_id,key" }
    )
    .select("id, key, value, created_at")
    .single();

  if (error) {
    console.error("facts upsert error:", error);
    return apiError("Failed to save fact", 500);
  }

  return NextResponse.json({ fact: data }, { status: 201 });
}

// DELETE /api/admin/buildings/[id]/facts?key=xxx
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await checkAdminAuth();
  if (!authResult.isAdmin) return apiError(authResult.error || "Unauthorized", authResult.status);

  const { id } = await params;
  const key = new URL(req.url).searchParams.get("key");
  if (!key) return apiError("key is required", 400);

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("building_facts")
    .delete()
    .eq("building_id", id)
    .eq("key", key);

  if (error) return apiError("Failed to delete fact", 500);
  return NextResponse.json({ ok: true });
}
