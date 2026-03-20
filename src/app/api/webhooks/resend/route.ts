import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import crypto from "crypto";

/**
 * Resend Webhook — handles both inbound emails and delivery status updates.
 * Configure in Resend dashboard: https://yourdomain.com/api/webhooks/resend
 */
export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const body = JSON.parse(rawBody);

    // Verify webhook signature if configured
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = req.headers.get("svix-signature");
      const timestamp = req.headers.get("svix-timestamp");
      const svixId = req.headers.get("svix-id");

      if (!signature || !timestamp || !svixId) {
        return NextResponse.json({ error: "Missing signature headers" }, { status: 401 });
      }

      const toSign = `${svixId}.${timestamp}.${rawBody}`;
      const secret = webhookSecret.startsWith("whsec_")
        ? Buffer.from(webhookSecret.slice(6), "base64")
        : Buffer.from(webhookSecret);
      const expectedSignature = crypto
        .createHmac("sha256", secret)
        .update(toSign)
        .digest("base64");

      const signatures = signature.split(" ").map((s) => s.replace("v1,", ""));
      const isValid = signatures.some((s) => {
        try {
          return crypto.timingSafeEqual(
            Buffer.from(s, "base64"),
            Buffer.from(expectedSignature, "base64")
          );
        } catch {
          return false;
        }
      });

      if (!isValid) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    const eventType = body.type as string;
    const supabase = createAdminClient();

    // ── Inbound email ──
    if (eventType === "email.received") {
      const data = body.data;
      const fromEmail = data.from?.email || data.from || "";
      const fromName = data.from?.name || "";
      const toEmail = Array.isArray(data.to) ? data.to[0] : data.to || "";
      const subject = data.subject || "(No Subject)";
      const bodyHtml = data.html || data.body || "";
      const bodyText = data.text || "";
      const headers = data.headers || {};

      const inReplyTo = headers["in-reply-to"] || "";
      const references = headers["references"] || "";

      // Try to match to existing thread
      let threadId: string | null = null;
      let leadId: string | null = null;

      const { data: priorEmail } = await supabase
        .from("emails")
        .select("thread_id, lead_id")
        .or(`from_email.eq.${fromEmail},to_email.eq.${fromEmail}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (priorEmail) {
        threadId = priorEmail.thread_id;
        leadId = priorEmail.lead_id;
      } else {
        threadId = crypto.randomUUID();
      }

      // Try to match sender to a lead
      if (!leadId) {
        const { data: lead } = await supabase
          .from("leads")
          .select("id")
          .eq("user_email", fromEmail)
          .limit(1)
          .single();
        if (lead) leadId = lead.id;
      }

      // Mark the last outbound email in this thread as "replied"
      if (threadId && priorEmail) {
        await supabase
          .from("emails")
          .update({ status: "replied", updated_at: new Date().toISOString() })
          .eq("thread_id", threadId)
          .eq("direction", "outbound")
          .neq("status", "replied");
      }

      const { error: insertError } = await supabase.from("emails").insert({
        thread_id: threadId,
        direction: "inbound",
        status: "received",
        delivery_status: null,
        from_email: fromEmail,
        from_name: fromName,
        to_email: toEmail,
        subject,
        body_html: bodyHtml,
        body_text: bodyText,
        lead_id: leadId,
        is_read: false,
        headers: {
          "message-id": headers["message-id"],
          "in-reply-to": inReplyTo,
          references,
        },
      });

      if (insertError) {
        console.error("Failed to store inbound email:", insertError);
        return NextResponse.json({ error: "Failed to store email" }, { status: 500 });
      }

      return NextResponse.json({ success: true, thread_id: threadId });
    }

    // ── Delivery status events ──
    if (
      eventType === "email.delivered" ||
      eventType === "email.bounced" ||
      eventType === "email.complained"
    ) {
      const resendId = body.data?.email_id;
      if (resendId) {
        const statusMap: Record<string, string> = {
          "email.delivered": "delivered",
          "email.bounced": "bounced",
          "email.complained": "complained",
        };
        await supabase
          .from("emails")
          .update({
            delivery_status: statusMap[eventType],
            updated_at: new Date().toISOString(),
          })
          .eq("resend_id", resendId);
      }
      return NextResponse.json({ success: true, type: eventType });
    }

    // Acknowledge other events
    return NextResponse.json({ success: true, type: eventType });
  } catch (error) {
    console.error("Resend webhook error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
