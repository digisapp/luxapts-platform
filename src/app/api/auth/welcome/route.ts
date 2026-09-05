import { NextResponse } from "next/server";
import { z } from "zod";
import { Resend } from "resend";
import { getFromEmail } from "@/lib/resend/client";
import { welcomeEmail } from "@/lib/email/templates";
import { apiError } from "@/lib/api-helpers";
import { rateLimit, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

const Schema = z.object({
  name: z.string().max(100).optional().nullable(),
});

// POST /api/auth/welcome — send welcome email after signup
// Requires an authenticated session; the email is always sent to the session
// user's own address (any client-supplied email is ignored) so the endpoint
// cannot be used to spam arbitrary inboxes.
export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rl = rateLimit(`welcome:${ip}`, RATE_LIMITS.welcome);
  if (!rl.success) return apiError("Too many requests", 429);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return apiError("Unauthorized", 401);

  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);

  // Prefer the name from user metadata (set at signup); fall back to the body.
  const metadataName = user.user_metadata?.full_name;
  const name =
    (typeof metadataName === "string" && metadataName.trim()) ||
    (parsed.success ? parsed.data.name ?? null : null);

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ ok: true });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  try {
    await resend.emails.send({
      from: getFromEmail(),
      to: [user.email],
      subject: "Welcome to Staycio 🏢",
      html: welcomeEmail({ name, email: user.email }),
    });
  } catch (err) {
    console.error("Welcome email failed:", err);
    // Don't fail — not critical
  }

  return NextResponse.json({ ok: true });
}
