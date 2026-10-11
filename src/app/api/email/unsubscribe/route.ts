import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { escapeHtml, isValidUUID } from "@/lib/utils";
import { verifyUnsubscribeToken } from "@/lib/email/unsubscribe";

export const dynamic = "force-dynamic";

function page(title: string, message: string, status: number, form = "") {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${title} · Staycio</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;color:#e5e5e5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:64px 24px;text-align:center;">
    <h1 style="font-size:20px;font-weight:600;margin:0 0 12px;color:#fff;">${title}</h1>
    <p style="font-size:14px;line-height:1.6;color:#a3a3a3;margin:0;">${message}</p>${form}
  </div>
</body>
</html>`;
  return new NextResponse(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

const INVALID = [
  "Invalid unsubscribe link",
  "This link is not valid or has expired. Please reply to the email you received and we will remove you manually.",
] as const;
const FAILED = ["Something went wrong", "We could not process your request right now. Please try again shortly."] as const;

/** The lead id when the link's token is genuine. */
function verifiedLead(req: NextRequest): { leadId: string; token: string } | null {
  const leadId = req.nextUrl.searchParams.get("lead") || "";
  const token = req.nextUrl.searchParams.get("t") || "";
  return isValidUUID(leadId) && verifyUnsubscribeToken(leadId, token) ? { leadId, token } : null;
}

// GET /api/email/unsubscribe?lead=<uuid>&t=<hmac>
// Asks, does not act. Mail scanners and link previewers open every link in
// a message; a GET that unsubscribed took people off the list who never
// clicked. The button POSTs back to the same URL. The token is an HMAC of
// the lead id keyed on CRON_SECRET, so the link cannot be walked to
// unsubscribe other leads.
export async function GET(req: NextRequest) {
  const link = verifiedLead(req);
  if (!link) return page(...INVALID, 400);
  const action = `/api/email/unsubscribe?lead=${encodeURIComponent(link.leadId)}&t=${encodeURIComponent(link.token)}`;
  const form = `
    <form method="post" action="${escapeHtml(action)}" style="margin:24px 0 0;">
      <input type="hidden" name="List-Unsubscribe" value="One-Click" />
      <button type="submit" style="font:inherit;font-size:14px;font-weight:600;padding:10px 20px;border-radius:8px;border:0;background:#fff;color:#0a0a0a;cursor:pointer;">Unsubscribe</button>
    </form>`;
  return page(
    "Unsubscribe from Staycio emails?",
    "You will stop receiving marketing emails from Staycio. Transactional messages about tours you request may still be sent.",
    200,
    form
  );
}

// POST: the button above, or RFC 8058 one-click unsubscribe (mail clients
// POST `List-Unsubscribe=One-Click` to the List-Unsubscribe URL). The lead
// and token are in the query string either way, so the body is not needed.
export async function POST(req: NextRequest) {
  try {
    const link = verifiedLead(req);
    if (!link) return page(...INVALID, 400);

    const supabase = createAdminClient();
    const { error } = await supabase
      .from("leads")
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq("id", link.leadId)
      .is("unsubscribed_at", null);

    if (error) {
      console.error("Unsubscribe update error:", error);
      return page(...FAILED, 500);
    }

    return page(
      "You're unsubscribed",
      "You will no longer receive marketing emails from Staycio. Transactional messages about tours you request may still be sent.",
      200
    );
  } catch (err) {
    console.error("Unsubscribe error:", err);
    return page(...FAILED, 500);
  }
}
