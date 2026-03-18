import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { isValidUUID } from "@/lib/utils";
import { apiError } from "@/lib/api-helpers";

export async function POST(req: Request) {
  try {
    const auth = await checkAdminAuth();
    if (!auth.isAdmin) {
      return apiError(auth.error || "Unauthorized", auth.status);
    }

    const body = await req.json();
    const { lead_ids, action, value } = body as {
      lead_ids: string[];
      action: "status" | "assign";
      value: string;
    };

    if (!Array.isArray(lead_ids) || lead_ids.length === 0) {
      return apiError("lead_ids required");
    }

    if (!["status", "assign"].includes(action)) {
      return apiError("Invalid action");
    }

    if (!value) {
      return apiError("value required");
    }

    // Validate all UUIDs
    if (!lead_ids.every(isValidUUID)) {
      return apiError("Invalid lead_id format");
    }

    const supabase = createAdminClient();

    if (action === "status") {
      const validStatuses = ["new", "contacted", "touring", "applied", "leased", "lost"];
      if (!validStatuses.includes(value)) {
        return apiError("Invalid status");
      }

      // Bulk update status
      const { error } = await supabase
        .from("leads")
        .update({ status: value })
        .in("id", lead_ids);

      if (error) {
        console.error("Bulk status update error:", error);
        return apiError("Failed to update", 500);
      }

      // Insert lead events for each
      const events = lead_ids.map((lead_id) => ({
        lead_id,
        type: "status_changed",
        payload: { new_status: value, bulk: true },
      }));
      await supabase.from("lead_events").insert(events);

      return NextResponse.json({ updated: lead_ids.length });
    }

    if (action === "assign") {
      if (!isValidUUID(value)) {
        return apiError("Invalid agent UUID");
      }

      // Create agent assignments
      const assignments = lead_ids.map((lead_id) => ({
        lead_id,
        agent_user_id: value,
        status: "assigned" as const,
      }));

      const { error } = await supabase.from("agent_assignments").insert(assignments);

      if (error) {
        console.error("Bulk assign error:", error);
        return apiError("Failed to assign", 500);
      }

      // Insert lead events
      const events = lead_ids.map((lead_id) => ({
        lead_id,
        type: "agent_assigned",
        payload: { agent_user_id: value, bulk: true },
      }));
      await supabase.from("lead_events").insert(events);

      return NextResponse.json({ assigned: lead_ids.length });
    }

    return apiError("Unknown action");
  } catch (error) {
    console.error("Bulk action error:", error);
    return apiError("Internal server error", 500);
  }
}
