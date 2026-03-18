import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import { isValidUUID } from "@/lib/utils";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: Request, context: RouteContext) {
  const { id } = await context.params;

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid assignment ID" }, { status: 400 });
  }

  // Get current user
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { status } = body;

  if (!status || !["accepted", "declined"].includes(status)) {
    return NextResponse.json(
      { error: "Status must be 'accepted' or 'declined'" },
      { status: 400 }
    );
  }

  const adminClient = createAdminClient();

  // Verify the assignment belongs to this agent
  const { data: assignment, error: fetchError } = await adminClient
    .from("agent_assignments")
    .select("id, lead_id, agent_user_id, status")
    .eq("id", id)
    .single();

  if (fetchError || !assignment) {
    return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
  }

  if (assignment.agent_user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (assignment.status !== "assigned") {
    return NextResponse.json(
      { error: "Assignment already responded to" },
      { status: 400 }
    );
  }

  // Update assignment status
  const { error: updateError } = await adminClient
    .from("agent_assignments")
    .update({ status })
    .eq("id", id);

  if (updateError) {
    console.error("Assignment update error:", updateError);
    return NextResponse.json(
      { error: "Failed to update assignment" },
      { status: 500 }
    );
  }

  // Log the event
  await adminClient.from("lead_events").insert({
    lead_id: assignment.lead_id,
    type: status === "accepted" ? "agent_accepted" : "agent_declined",
    payload: { agent_user_id: user.id },
  });

  return NextResponse.json({ success: true, status });
}
