// Shared by the two Twilio webhooks: read the form body and check that the
// request really came from Twilio.

import { twilioConfig, validTwilioSignature } from "./twilio";

export async function readTwilioRequest(
  req: Request
): Promise<{ ok: true; params: Record<string, string> } | { ok: false; status: number }> {
  const config = twilioConfig();
  if (!config) return { ok: false, status: 503 };
  const form = await req.formData().catch(() => null);
  if (!form) return { ok: false, status: 400 };
  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) if (typeof value === "string") params[key] = value;

  // Twilio signs the exact URL it was given. Behind Vercel req.url is the
  // public URL, but accept the configured app URL too in case a proxy
  // rewrote the host.
  const reqUrl = new URL(req.url);
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const candidates = [req.url, appUrl ? `${appUrl}${reqUrl.pathname}${reqUrl.search}` : ""].filter(Boolean);
  if (!validTwilioSignature(candidates, params, req.headers.get("x-twilio-signature"), config.authToken)) {
    return { ok: false, status: 403 };
  }
  return { ok: true, params };
}
