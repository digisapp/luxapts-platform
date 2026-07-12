import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-helpers";

const UpdateProfileSchema = z.object({
  full_name: z.string().min(1).max(100).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
});

// GET /api/account — fetch current user profile
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return apiError("Unauthorized", 401);

  const adminClient = createAdminClient();
  const { data: profile, error } = await adminClient
    .from("profiles")
    .select("id, role, full_name, phone, created_at")
    .eq("id", user.id)
    .single();

  if (error) return apiError("Failed to load profile", 500);

  return NextResponse.json({
    id: user.id,
    email: user.email,
    full_name: profile?.full_name ?? null,
    phone: profile?.phone ?? null,
    role: profile?.role ?? "renter",
    created_at: profile?.created_at ?? user.created_at,
  });
}

// PATCH /api/account — update profile fields
export async function PATCH(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return apiError("Unauthorized", 401);

  const body = await req.json();
  const parsed = UpdateProfileSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "Invalid input", 400);

  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from("profiles")
    .update({
      ...(parsed.data.full_name !== undefined && { full_name: parsed.data.full_name }),
      ...(parsed.data.phone !== undefined && { phone: parsed.data.phone }),
    })
    .eq("id", user.id);

  if (error) return apiError("Failed to update profile", 500);
  return NextResponse.json({ ok: true });
}
