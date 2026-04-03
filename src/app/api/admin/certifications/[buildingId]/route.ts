import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api-helpers";
import { checkAdminAuth } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { z } from "zod";

const quizQuestionSchema = z.object({
  question: z.string().min(1).max(500),
  options: z.array(z.string().min(1).max(200)).min(2).max(6),
  correct_index: z.number().int().min(0),
  explanation: z.string().max(500).optional(),
});

const certContentSchema = z.object({
  key_selling_points: z.string().max(2000).optional(),
  amenity_notes: z.string().max(2000).optional(),
  pet_policy_notes: z.string().max(1000).optional(),
  parking_notes: z.string().max(1000).optional(),
  pricing_notes: z.string().max(1000).optional(),
  shadows_required: z.number().int().min(0).max(10).optional(),
  quiz_questions: z.array(quizQuestionSchema).max(20).optional(),
});

// GET /api/admin/certifications/[buildingId] — get cert content for a building
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ buildingId: string }> }
) {
  try {
    const auth = await checkAdminAuth();
    if (!auth.isAdmin) return apiError(auth.error, auth.status);

    const { buildingId } = await params;
    const adminClient = createAdminClient();

    const { data: building } = await adminClient
      .from("buildings")
      .select("id, name, address")
      .eq("id", buildingId)
      .single();

    if (!building) return apiError("Building not found", 404);

    const { data: content } = await adminClient
      .from("building_certification_content")
      .select("*")
      .eq("building_id", buildingId)
      .single();

    return apiSuccess({ building, content: content || null });
  } catch (error) {
    console.error("Get cert content error:", error);
    return apiError("Internal server error", 500);
  }
}

// PUT /api/admin/certifications/[buildingId] — create or update cert content
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ buildingId: string }> }
) {
  try {
    const auth = await checkAdminAuth();
    if (!auth.isAdmin) return apiError(auth.error, auth.status);

    const { buildingId } = await params;
    const rawBody = await req.json();
    const parsed = certContentSchema.safeParse(rawBody);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message || "Invalid request");
    }

    const body = parsed.data;

    // Validate correct_index is within options bounds
    if (body.quiz_questions) {
      for (const q of body.quiz_questions) {
        if (q.correct_index < 0 || q.correct_index >= q.options.length) {
          return apiError(`Question "${q.question.slice(0, 40)}..." has invalid correct_index`);
        }
      }
    }

    const adminClient = createAdminClient();

    // Verify building exists
    const { data: building } = await adminClient
      .from("buildings")
      .select("id")
      .eq("id", buildingId)
      .single();

    if (!building) return apiError("Building not found", 404);

    const upsertData = {
      building_id: buildingId,
      ...(body.key_selling_points !== undefined && { key_selling_points: body.key_selling_points }),
      ...(body.amenity_notes !== undefined && { amenity_notes: body.amenity_notes }),
      ...(body.pet_policy_notes !== undefined && { pet_policy_notes: body.pet_policy_notes }),
      ...(body.parking_notes !== undefined && { parking_notes: body.parking_notes }),
      ...(body.pricing_notes !== undefined && { pricing_notes: body.pricing_notes }),
      ...(body.shadows_required !== undefined && { shadows_required: body.shadows_required }),
      ...(body.quiz_questions !== undefined && { quiz_questions: body.quiz_questions }),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await adminClient
      .from("building_certification_content")
      .upsert(upsertData, { onConflict: "building_id" })
      .select("*")
      .single();

    if (error || !data) {
      console.error("Upsert cert content error:", error);
      return apiError("Failed to save certification content", 500);
    }

    return apiSuccess({ content: data });
  } catch (error) {
    console.error("Save cert content error:", error);
    return apiError("Internal server error", 500);
  }
}
