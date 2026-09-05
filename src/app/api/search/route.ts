import { NextResponse } from "next/server";
import { searchRequestSchema } from "@/lib/validations";
import { apiError } from "@/lib/api-helpers";
import { cachedSearch } from "@/lib/search/cache";
import { rateLimit, getClientIp, RATE_LIMITS, isInternalRequest } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    if (!isInternalRequest(req)) {
      const rl = rateLimit(`search:${getClientIp(req)}`, RATE_LIMITS.search);
      if (!rl.success) {
        return apiError("Too many requests", 429);
      }
    }

    const rawBody = await req.json();

    const parsed = searchRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message || "Invalid request");
    }

    const started = Date.now();
    const result = await cachedSearch(parsed.data);

    // Search analytics: no writer has existed since migration 017 dropped the
    // public insert policy, so the admin analytics dashboard read an empty
    // table. Service-role insert, fire-and-forget — never blocks the response.
    void (async () => {
      try {
        const { createAdminClient } = await import("@/lib/supabase/server");
        await createAdminClient().from("search_events").insert({
          city_slug: parsed.data.city_slug ?? null,
          filters: parsed.data,
          results_count: result.results?.length ?? 0,
          response_time_ms: Date.now() - started,
        });
      } catch (err) {
        console.error("search_events insert failed:", err);
      }
    })();

    return NextResponse.json(result);
  } catch (error) {
    console.error("Search error:", error);
    return apiError("Internal server error", 500);
  }
}
