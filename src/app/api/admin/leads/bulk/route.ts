import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { isValidUUID } from "@/lib/utils";

export async function POST(req: Request) {
  try {
    const auth = await checkAdminAuth();
    if (!auth.isAdmin) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const { lead_ids, action, value } = body as {
      lead_ids: string[];
      action: "status" | "assign";
      value: string;
    };

    if (!Array.isArray(lead_ids) || lead_ids.length === 0) {
      return NextResponse.json({ error: "lead_ids required" }, { status: 400 });
    }

    if (!["status", "assign"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    if (!value) {
      return NextResponse.json({ error: "value required" }, { status: 400 });
    }

    // Validate all UUIDs
    if (!lead_ids.every(isValidUUID)) {
      return NextResponse.json({ error: "Invalid lead_id format" }, { status: 400 });
    }

    const supabase = createAdminClient();

    if (action === "status") {
      const validStatuses = ["new", "contacted", "touring", "applied", "leased", "lost"];
      if (!validStatuses.includes(value)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }

      // Bulk update status
      const { error } = await supabase
        .from("leads")
        .update({ status: value })
        .in("id", lead_ids);

      if (error) {
        console.error("Bulk status update error:", error);
        return NextResponse.json({ error: "Failed to update" }, { status: 500 });
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
        return NextResponse.json({ error: "Invalid agent UUID" }, { status: 400 });
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
        return NextResponse.json({ error: "Failed to assign" }, { status: 500 });
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

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Bulk action error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
