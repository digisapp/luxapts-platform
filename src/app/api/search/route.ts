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

    const result = await cachedSearch(parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Search error:", error);
    return apiError("Internal server error", 500);
  }
}
