import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import { apiError, apiSuccess } from "@/lib/api-helpers";
import { z } from "zod";

const registerSchema = z.object({
  display_name: z.string().min(2).max(100),
  phone: z.string().min(10).max(20),
  bio: z.string().max(500).optional(),
  photo_url: z.string().url().optional(),
  agreement_accepted: z.literal(true, {
    message: "You must accept the Independent Contractor Agreement",
  }),
});

// POST /api/showers/register — create shower profile
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return apiError("Unauthorized", 401);
    }

    const rawBody = await req.json();
    const parsed = registerSchema.safeParse(rawBody);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message || "Invalid request");
    }

    const { display_name, phone, bio, photo_url } = parsed.data;

    const adminClient = createAdminClient();

    // Check if already registered
    const existing = await adminClient
      .from("showers")
      .select("id, status")
      .eq("user_id", user.id)
      .single();

    if (existing.data) {
      return apiError(
        existing.data.status === "pending"
          ? "Your application is already submitted and pending review"
          : "You already have a shower profile",
        409
      );
    }

    const { data: shower, error: insertError } = await adminClient
      .from("showers")
      .insert({
        user_id: user.id,
        display_name,
        phone,
        bio: bio || null,
        photo_url: photo_url || null,
        status: "pending",
        agreement_accepted: true,
        agreement_accepted_at: new Date().toISOString(),
      })
      .select("id, status, display_name")
      .single();

    if (insertError || !shower) {
      console.error("Shower register error:", insertError);
      return apiError("Failed to create profile", 500);
    }

    return apiSuccess({ shower_id: shower.id, status: shower.status }, 201);
  } catch (error) {
    console.error("Register shower error:", error);
    return apiError("Internal server error", 500);
  }
}

// GET /api/showers/register — check current user's shower status
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return apiError("Unauthorized", 401);
    }

    const adminClient = createAdminClient();
    const { data: shower } = await adminClient
      .from("showers")
      .select("id, status, tier, display_name, total_showings, avg_rating, created_at")
      .eq("user_id", user.id)
      .single();

    if (!shower) {
      return NextResponse.json({ registered: false });
    }

    return NextResponse.json({ registered: true, shower });
  } catch (error) {
    console.error("Get shower status error:", error);
    return apiError("Internal server error", 500);
  }
}
