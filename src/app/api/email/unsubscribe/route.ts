import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { isValidUUID } from "@/lib/utils";
import { verifyUnsubscribeToken } from "@/lib/email/unsubscribe";

export const dynamic = "force-dynamic";

function page(title: string, message: string, status: number) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} · Staycio</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;color:#e5e5e5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:64px 24px;text-align:center;">
    <h1 style="font-size:20px;font-weight:600;margin:0 0 12px;color:#fff;">${title}</h1>
    <p style="font-size:14px;line-height:1.6;color:#a3a3a3;margin:0;">${message}</p>
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

// GET /api/email/unsubscribe?lead=<uuid>&t=<hmac>
// Public, one-click (CAN-SPAM). The token is an HMAC of the lead id keyed on
// CRON_SECRET, so the link cannot be walked to unsubscribe other leads.
export async function GET(req: NextRequest) {
  try {
    const leadId = req.nextUrl.searchParams.get("lead") || "";
    const token = req.nextUrl.searchParams.get("t") || "";

    if (!isValidUUID(leadId) || !verifyUnsubscribeToken(leadId, token)) {
      return page(
        "Invalid unsubscribe link",
        "This link is not valid or has expired. Please reply to the email you received and we will remove you manually.",
        400
      );
    }

    const supabase = createAdminClient();
    const { error } = await supabase
      .from("leads")
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq("id", leadId)
      .is("unsubscribed_at", null);

    if (error) {
      console.error("Unsubscribe update error:", error);
      return page(
        "Something went wrong",
        "We could not process your request right now. Please try again shortly.",
        500
      );
    }

    return page(
      "You're unsubscribed",
      "You will no longer receive marketing emails from Staycio. Transactional messages about tours you request may still be sent.",
      200
    );
  } catch (err) {
    console.error("Unsubscribe error:", err);
    return page(
      "Something went wrong",
      "We could not process your request right now. Please try again shortly.",
      500
    );
  }
}
