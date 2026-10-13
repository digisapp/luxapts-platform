import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DB_TIMEOUT_MS = 5000;

/**
 * GET /api/health — for an external uptime monitor. 200 when the app is
 * serving and the database answers; 503 when it doesn't. The homepage alone
 * can't tell: it can render while every listing query fails.
 */
export async function GET() {
  const started = Date.now();
  const headers = { "Cache-Control": "no-store" };
  try {
    const query = createAdminClient().from("cities").select("id", { head: true, count: "exact" }).limit(1);
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`database did not answer within ${DB_TIMEOUT_MS}ms`)), DB_TIMEOUT_MS)
    );
    const { error } = await Promise.race([query, timeout]);
    if (error) throw new Error(error.message);
    return NextResponse.json({ status: "ok", database: "ok", ms: Date.now() - started }, { headers });
  } catch (err) {
    console.error("health check failed:", err);
    return NextResponse.json(
      { status: "down", database: "unreachable", ms: Date.now() - started },
      { status: 503, headers }
    );
  }
}
