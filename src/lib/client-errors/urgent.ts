// The urgent counterpart to the daily digest: one email as soon as a page is
// actually broken for several visitors — the bad-deploy case — instead of
// the next morning. Small things wait for the digest.

import type { SupabaseClient } from "@supabase/supabase-js";
import { escapeHtml } from "@/lib/utils";
import { getFromEmail, getResendClient } from "@/lib/resend/client";
import { getErrorAlertRecipients } from "@/lib/email/recipients";

/** Only errors that show the visitor an error screen instead of the page */
export const URGENT_SOURCES = ["boundary", "root"] as const;
/** Distinct visitor sessions within the window that make it urgent */
export const URGENT_SESSIONS = 3;
const WINDOW_MS = 60 * 60 * 1000;
/** At most one urgent email per error message per day */
const COOLDOWN_MS = 24 * 60 * 60 * 1000;
const ALERT_EVENT = "client_error_alert";

export interface UrgentReport {
  source: string;
  message: string;
  path: string;
  release: string | null;
}

export function buildUrgentAlert(report: UrgentReport, sessions: number) {
  const where = report.path || "/";
  const subject = `Staycio: pages breaking on ${where} — ${sessions} visitors in the last hour`;
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#171717;max-width:600px;line-height:1.5">
  <p style="margin:0 0 4px;font-size:13px;color:#6b6b6b">Staycio · Urgent site error</p>
  <h1 style="margin:0 0 12px;font-size:20px;font-weight:600">${sessions} visitors got an error screen on ${escapeHtml(where)} in the last hour</h1>
  <p style="margin:0 0 4px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;word-break:break-word">${escapeHtml(report.message)}</p>
  <p style="margin:0 0 20px;font-size:13px;color:#6b6b6b">${report.source === "root" ? "Whole-site crash" : "Error screen"}${report.release ? ` · deploy ${escapeHtml(report.release)}` : ""}</p>
  <p style="margin:0 0 20px;font-size:14px">If this started after a deploy, rolling back in Vercel is the fastest fix.</p>
  <p style="margin:0 0 20px"><a href="https://staycio.com/admin/errors" style="display:inline-block;background:#14212b;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:500">Open Site Errors</a></p>
  <p style="margin:0;font-size:12px;color:#6b6b6b">One email per error per day. Everything else is in the daily digest.</p>
</div>`;
  const text = [
    `${sessions} visitors got an error screen on ${where} in the last hour`,
    report.message,
    `${report.source === "root" ? "Whole-site crash" : "Error screen"}${report.release ? ` · deploy ${report.release}` : ""}`,
    "",
    "If this started after a deploy, rolling back in Vercel is the fastest fix.",
    "Open Site Errors: https://staycio.com/admin/errors",
  ].join("\n");
  return { subject, html, text };
}

/**
 * Called after a report is stored. Sends at most one email per message per
 * day once URGENT_SESSIONS distinct sessions hit the same error screen
 * within an hour. Never throws.
 */
export async function maybeSendUrgentAlert(
  supabase: SupabaseClient,
  report: UrgentReport,
  now: number = Date.now()
): Promise<"sent" | "skipped"> {
  try {
    if (!(URGENT_SOURCES as readonly string[]).includes(report.source)) return "skipped";
    const recipients = getErrorAlertRecipients();
    if (recipients.length === 0) return "skipped";

    const { data: recent, error: recentError } = await supabase
      .from("analytics_events")
      .select("session_id")
      .eq("event_name", "client_error")
      .eq("properties->>message", report.message)
      .in("properties->>source", [...URGENT_SOURCES])
      .gte("created_at", new Date(now - WINDOW_MS).toISOString())
      .limit(500);
    if (recentError) throw recentError;
    const sessions = new Set(
      (recent ?? []).map((r: { session_id: string }) => r.session_id).filter((s) => s && s !== "none")
    ).size;
    if (sessions < URGENT_SESSIONS) return "skipped";

    const { data: already, error: markerError } = await supabase
      .from("analytics_events")
      .select("id")
      .eq("event_name", ALERT_EVENT)
      .eq("properties->>message", report.message)
      .gte("created_at", new Date(now - COOLDOWN_MS).toISOString())
      .limit(1);
    if (markerError) throw markerError;
    if (already && already.length > 0) return "skipped";

    // Marker first, so a burst of reports arriving together sends one email
    const { data: marker } = await supabase
      .from("analytics_events")
      .insert({
        session_id: "system",
        event_name: ALERT_EVENT,
        event_category: "error",
        properties: { message: report.message, source: report.source, path: report.path, sessions },
      })
      .select("id")
      .single();

    const alert = buildUrgentAlert(report, sessions);
    // Resend v6 reports API failures in `error`; it does not throw
    const { error: sendError } = await getResendClient().emails.send({
      from: getFromEmail(),
      to: recipients,
      subject: alert.subject,
      html: alert.html,
      text: alert.text,
    });
    if (sendError) {
      // Let the next report try again rather than going quiet for a day
      if (marker?.id) await supabase.from("analytics_events").delete().eq("id", marker.id);
      console.error("urgent alert rejected:", sendError);
      return "skipped";
    }
    return "sent";
  } catch (err) {
    console.error("urgent alert failed:", err);
    return "skipped";
  }
}
