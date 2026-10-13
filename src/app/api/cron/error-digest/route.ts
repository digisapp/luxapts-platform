import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getResendClient, getFromEmail } from "@/lib/resend/client";
import { getErrorAlertRecipients } from "@/lib/email/recipients";
import { loadClientErrorRows } from "@/lib/client-errors/load";
import { groupClientErrors, summarizeClientErrors } from "@/lib/client-errors/group";
import { buildErrorDigest } from "@/lib/client-errors/digest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/error-digest — once a day (vercel.json), emails a summary of
 * the browser errors visitors hit in the last 24 hours, to ERROR_ALERT_EMAIL
 * (else LEAD_NOTIFY_EMAIL). Sends nothing on a clean day or with no
 * recipient set; /admin/errors and its sidebar count work either way.
 */
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const recipients = getErrorAlertRecipients();
  if (recipients.length === 0) {
    return NextResponse.json({ sent: false, reason: "No ERROR_ALERT_EMAIL or LEAD_NOTIFY_EMAIL set" });
  }

  const now = Date.now();
  // 30 days back, so an error that also happened last week isn't called new
  const since = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { rows, error: loadError } = await loadClientErrorRows(createAdminClient(), since);
  if (loadError) {
    console.error("error-digest: load failed:", loadError);
    return NextResponse.json({ sent: false, reason: "Could not load error reports" }, { status: 500 });
  }

  const digest = buildErrorDigest(groupClientErrors(rows, now), summarizeClientErrors(rows, now), now);
  if (!digest) {
    return NextResponse.json({ sent: false, reason: "No errors in the last 24 hours" });
  }

  try {
    // Resend v6 reports API failures in `error`; it does not throw
    const { error } = await getResendClient().emails.send({
      from: getFromEmail(),
      to: recipients,
      subject: digest.subject,
      html: digest.html,
      text: digest.text,
    });
    if (error) {
      console.error("error-digest: send rejected:", error);
      return NextResponse.json({ sent: false, reason: "Email provider rejected the digest" }, { status: 502 });
    }
  } catch (err) {
    console.error("error-digest: send failed:", err);
    return NextResponse.json({ sent: false, reason: "Email send failed" }, { status: 502 });
  }

  return NextResponse.json({ sent: true, recipients: recipients.length, subject: digest.subject });
}
