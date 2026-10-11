import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { isValidUUID } from "@/lib/utils";
import { getAdminInboxService } from "@/lib/email/admin-inbox";
import { textToHtml } from "@/lib/email/branded";
import { firstNameOf } from "@/lib/email/names";
import { apiError } from "@/lib/api-helpers";

/**
 * POST /api/admin/leads/[id]/email — one email to one lead from the leads
 * list. It goes through the admin inbox exactly like a message written in
 * /admin/email: sent as the building the lead signed up on, stored in Sent
 * with a per-thread Reply-To (their answer threads under it), any automatic
 * note still queued for them pulled back, and a "new" lead moved to
 * "contacted" with its alert cleared.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkAdminAuth();
    if (!auth.isAdmin) {
      return apiError(auth.error || "Unauthorized", auth.status);
    }

    const { id } = await params;
    if (!isValidUUID(id)) {
      return apiError("Invalid lead ID");
    }

    const body = await req.json().catch(() => ({}));
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const emailBody = typeof body.body === "string" ? body.body.trim() : "";

    if (!subject || !emailBody) {
      return apiError("subject and body required");
    }

    const supabase = createAdminClient();

    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("user_email, name, unsubscribed_at")
      .eq("id", id)
      .single();

    if (leadError || !lead) {
      return apiError("Lead not found", 404);
    }

    if (!lead.user_email) {
      return apiError("Lead has no email address");
    }

    // CAN-SPAM: never mail someone who used the unsubscribe link.
    if (lead.unsubscribed_at) {
      return apiError("This lead unsubscribed from email", 409);
    }

    // Greeted by first name, then the message as typed, in the inbox's
    // plain paragraphs.
    const first = firstNameOf(lead.name);
    const bodyText = first ? `Hi ${first},\n\n${emailBody}` : emailBody;

    const result = await getAdminInboxService().sendNewEmail({
      to: lead.user_email,
      subject,
      bodyHtml: textToHtml(bodyText),
      bodyText,
      leadId: id,
      sentBy: auth.userId,
    });
    if (!result.success) {
      return apiError(result.error, result.status ?? 502);
    }

    await supabase.from("lead_events").insert({
      lead_id: id,
      type: "email_sent",
      payload: { subject, to: lead.user_email, email_id: result.id },
    });

    // `warning`: sent, but a queued automatic note could not be pulled back.
    return NextResponse.json({ success: true, id: result.id, warning: result.warning ?? null });
  } catch (error) {
    console.error("Lead email error:", error);
    return apiError("Internal server error", 500);
  }
}
