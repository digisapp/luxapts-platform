import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isValidUUID } from "@/lib/utils";
import { apiError } from "@/lib/api-helpers";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: Request, context: RouteContext) {
  const { id } = await context.params;

  if (!isValidUUID(id)) {
    return apiError("Invalid assignment ID");
  }

  // Get current user
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return apiError("Unauthorized", 401);
  }

  const body = await req.json();
  const { status } = body;

  if (!status || !["accepted", "declined"].includes(status)) {
    return apiError("Status must be 'accepted' or 'declined'");
  }

  const adminClient = createAdminClient();

  // Verify the assignment belongs to this agent
  const { data: assignment, error: fetchError } = await adminClient
    .from("agent_assignments")
    .select("id, lead_id, agent_user_id, status")
    .eq("id", id)
    .single();

  if (fetchError || !assignment) {
    return apiError("Assignment not found", 404);
  }

  if (assignment.agent_user_id !== user.id) {
    return apiError("Forbidden", 403);
  }

  if (assignment.status !== "assigned") {
    return apiError("Assignment already responded to");
  }

  // Update assignment status
  const { error: updateError } = await adminClient
    .from("agent_assignments")
    .update({ status })
    .eq("id", id);

  if (updateError) {
    console.error("Assignment update error:", updateError);
    return apiError("Failed to update assignment", 500);
  }

  // Log the event
  await adminClient.from("lead_events").insert({
    lead_id: assignment.lead_id,
    type: status === "accepted" ? "agent_accepted" : "agent_declined",
    payload: { agent_user_id: user.id },
  });

  return NextResponse.json({ success: true, status });
}
