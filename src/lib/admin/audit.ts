import { createAdminClient } from "@/lib/supabase/server";

/**
 * Log an admin action to the audit_logs table.
 * Never throws — audit failures must never crash the main request.
 *
 * @param actorId  - auth.users.id of the admin performing the action
 * @param action   - structured name: "<entity>.<verb>" (e.g. "shower.approve")
 * @param entityType - the type of record being acted on (e.g. "shower", "lead")
 * @param entityId - UUID of the record being acted on
 * @param payload  - additional context (before/after values, reason, etc.) — no raw PII
 */
export async function logAuditEvent(
  actorId: string,
  action: string,
  entityType: string,
  entityId: string,
  payload: Record<string, unknown> = {}
): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("audit_logs").insert({
      actor_id: actorId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      payload,
    });
    if (error) {
      console.error(`Audit log insert failed [${action}]:`, error.message);
    }
  } catch (err) {
    console.error("Audit log unexpected error:", err);
  }
}

// Typed action constants to prevent typos across call sites
export const AuditAction = {
  // Shower program
  SHOWER_APPROVE: "shower.approve",
  SHOWER_SUSPEND: "shower.suspend",
  SHOWER_TERMINATE: "shower.terminate",
  SHOWER_STRIKE_ADD: "shower.strike_add",
  SHOWER_STRIKE_DELETE: "shower.strike_delete",

  // Showing pipeline
  DEBRIEF_APPROVE: "debrief.approve",
  SHOWING_LEAD_POST: "showing_lead.post",
  SHOWING_LEAD_CANCEL: "showing_lead.cancel",
  COMMISSION_RECORD: "commission.record",
  EARNING_APPROVE: "earning.approve",
  EARNING_MARK_PAID: "earning.mark_paid",

  // Leads CRM
  LEAD_STATUS_CHANGE: "lead.status_change",
  LEAD_ASSIGN: "lead.assign",

  // Buildings
  BUILDING_CREATE: "building.create",
  BUILDING_UPDATE: "building.update",
  BUILDING_STATUS_CHANGE: "building.status_change",

  // Email
  EMAIL_CAMPAIGN_SEND: "email_campaign.send",

  // Settings
  SETTINGS_UPDATE: "settings.update",
} as const;
