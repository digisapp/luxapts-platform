import { Resend } from "resend";
import { escapeHtml } from "@/lib/utils";

let resendClient: Resend | null = null;

export function getResendClient() {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY is not configured");
    }
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

export function getFromEmail() {
  return process.env.FROM_EMAIL || "LuxApts <hello@luxapts.co>";
}

// Email templates
export const emailTemplates = {
  tourRequest: (data: {
    name: string;
    buildingName: string;
    date?: string;
  }) => ({
    subject: `Tour Request Confirmation - ${escapeHtml(data.buildingName)}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a1a1a;">Tour Request Received</h2>
        <p>Hi ${escapeHtml(data.name)},</p>
        <p>Thank you for your interest in <strong>${escapeHtml(data.buildingName)}</strong>.</p>
        <p>We've received your tour request${data.date ? ` for ${escapeHtml(data.date)}` : ""} and a member of our team will be in touch within 24 hours to confirm the details.</p>
        <p>If you have any questions, please reply to this email or call us directly.</p>
        <p>Best regards,<br>The LuxApts Team</p>
      </div>
    `,
  }),

  agentIntro: (data: {
    renterName: string;
    agentName: string;
    agentPhone?: string;
    agentEmail?: string;
  }) => ({
    subject: `Meet Your LuxApts Agent: ${escapeHtml(data.agentName)}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a1a1a;">Your Personal Agent</h2>
        <p>Hi ${escapeHtml(data.renterName)},</p>
        <p>We've assigned <strong>${escapeHtml(data.agentName)}</strong> to help you find your perfect apartment.</p>
        ${data.agentPhone ? `<p><strong>Phone:</strong> ${escapeHtml(data.agentPhone)}</p>` : ""}
        ${data.agentEmail ? `<p><strong>Email:</strong> ${escapeHtml(data.agentEmail)}</p>` : ""}
        <p>${escapeHtml(data.agentName)} will reach out shortly to discuss your requirements and schedule tours.</p>
        <p>Best regards,<br>The LuxApts Team</p>
      </div>
    `,
  }),

  newLeadNotification: (data: {
    leadName: string;
    leadEmail?: string;
    leadPhone?: string;
    city: string;
    source: string;
    leadId: string;
  }) => ({
    subject: `New Lead: ${escapeHtml(data.leadName) || "Anonymous"} (${escapeHtml(data.city)})`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a1a1a;">New Lead Received</h2>
        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px;">
          <p><strong>Name:</strong> ${escapeHtml(data.leadName) || "Not provided"}</p>
          <p><strong>Email:</strong> ${escapeHtml(data.leadEmail) || "Not provided"}</p>
          <p><strong>Phone:</strong> ${escapeHtml(data.leadPhone) || "Not provided"}</p>
          <p><strong>City:</strong> ${escapeHtml(data.city)}</p>
          <p><strong>Source:</strong> ${escapeHtml(data.source)}</p>
        </div>
        <p style="margin-top: 20px;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL}/admin/leads/${encodeURIComponent(data.leadId)}"
             style="background: #1a1a1a; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">
            View Lead
          </a>
        </p>
      </div>
    `,
  }),
};
