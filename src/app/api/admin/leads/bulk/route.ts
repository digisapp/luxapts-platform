import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getAdminInboxService } from "@/lib/email/admin-inbox";
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
      action: "status" | "assign" | "delete";
      value?: string;
    };

    if (!Array.isArray(lead_ids) || lead_ids.length === 0) {
      return apiError("lead_ids required");
    }

    if (!["status", "assign", "delete"].includes(action)) {
      return apiError("Invalid action");
    }

    // Validate all UUIDs
    if (!lead_ids.every(isValidUUID)) {
      return apiError("Invalid lead_id format");
    }

    const supabase = createAdminClient();

    if (action === "delete") {
      // Deleting nulls emails.lead_id (010), so clear the "New lead" alerts
      // first; afterwards they could no longer be matched to these leads and
      // would sit in the inbox's Unread for good.
      await getAdminInboxService()
        .markLeadAlertsRead(lead_ids)
        .catch((err) => console.error("Could not clear lead alerts:", err));

      // A tour request was bridged to an open showing lead (019). Deleting
      // only nulls its source_lead_id, leaving showers able to claim a tour
      // for a lead that no longer exists, so those get cancelled. They are
      // looked up now (the link is gone after the delete) but cancelled only
      // once the delete succeeds. Claimed ones are left alone: a shower is
      // already working them.
      const { data: openShowings, error: showingError } = await supabase
        .from("showing_leads")
        .select("id")
        .in("source_lead_id", lead_ids)
        .eq("status", "open");
      if (showingError) {
        console.error("Bulk delete showing-lead lookup error:", showingError);
        return apiError("Failed to delete", 500);
      }

      // lead_events, lead_targets and agent_assignments cascade; emails and
      // chat_sessions keep their rows with lead_id set to null.
      const { data: deleted, error } = await supabase
        .from("leads")
        .delete()
        .in("id", lead_ids)
        .select("id");

      if (error) {
        console.error("Bulk delete error:", error);
        return apiError("Failed to delete", 500);
      }

      if (openShowings && openShowings.length > 0) {
        const { error: cancelError } = await supabase
          .from("showing_leads")
          .update({ status: "cancelled" })
          .in("id", openShowings.map((s) => s.id))
          .eq("status", "open");
        if (cancelError) {
          console.error("Could not cancel showing leads of deleted leads:", cancelError);
        }
      }

      return NextResponse.json({ deleted: deleted?.length ?? 0 });
    }

    if (!value) {
      return apiError("value required");
    }

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

      // A lead past "new" has been worked: its "New lead" alert in the
      // inbox no longer belongs in Unread.
      if (value !== "new") {
        await getAdminInboxService()
          .markLeadAlertsRead(lead_ids)
          .catch((err) => console.error("Could not clear lead alerts:", err));
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
