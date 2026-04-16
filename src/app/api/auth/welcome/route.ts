import { NextResponse } from "next/server";
import { z } from "zod";
import { Resend } from "resend";
import { getFromEmail } from "@/lib/resend/client";
import { welcomeEmail } from "@/lib/email/templates";
import { apiError } from "@/lib/api-helpers";
import { rateLimit, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";

const Schema = z.object({
  email: z.string().email(),
  name: z.string().max(100).optional().nullable(),
});

// POST /api/auth/welcome — send welcome email after signup
// Called client-side immediately after supabase.auth.signUp succeeds.
// Rate-limited to prevent abuse.
export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rl = rateLimit(ip, RATE_LIMITS.search); // reuse the search rate limit (10/min)
  if (!rl.success) return apiError("Too many requests", 429);

  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return apiError("Invalid input", 400);

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ ok: true });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  try {
    await resend.emails.send({
      from: getFromEmail(),
      to: [parsed.data.email],
      subject: "Welcome to LuxApts 🏢",
      html: welcomeEmail({ name: parsed.data.name, email: parsed.data.email }),
    });
  } catch (err) {
    console.error("Welcome email failed:", err);
    // Don't fail — not critical
  }

  return NextResponse.json({ ok: true });
}
