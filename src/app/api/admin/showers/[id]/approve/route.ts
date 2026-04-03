import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api-helpers";
import { checkAdminAuth } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { z } from "zod";

const approveSchema = z.object({
  action: z.enum(["approve", "suspend", "terminate"]),
  reason: z.string().max(500).optional(),
});

// POST /api/admin/showers/[id]/approve — approve, suspend, or terminate a shower
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkAdminAuth();
    if (!auth.isAdmin) return apiError(auth.error, auth.status);

    const { id: showerId } = await params;
    const rawBody = await req.json();
    const parsed = approveSchema.safeParse(rawBody);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message || "Invalid request");
    }

    const { action, reason } = parsed.data;
    const adminClient = createAdminClient();

    const statusMap: Record<string, string> = {
      approve: "approved",
      suspend: "suspended",
      terminate: "terminated",
    };

    const updateData: Record<string, unknown> = {
      status: statusMap[action],
      updated_at: new Date().toISOString(),
    };

    if (action === "approve") {
      updateData.approved_at = new Date().toISOString();
      updateData.approved_by = auth.userId;
      updateData.suspension_reason = null;
    } else {
      updateData.suspension_reason = reason || null;
    }

    const { data, error } = await adminClient
      .from("showers")
      .update(updateData)
      .eq("id", showerId)
      .select("id, status, display_name")
      .single();

    if (error || !data) {
      console.error("Approve shower error:", error);
      return apiError("Failed to update shower", 500);
    }

    return apiSuccess({ shower: data });
  } catch (error) {
    console.error("Admin approve shower error:", error);
    return apiError("Internal server error", 500);
  }
}
