import { NextResponse } from "next/server";
import { searchRequestSchema } from "@/lib/validations";
import { apiError } from "@/lib/api-helpers";
import { cachedSearch } from "@/lib/search/cache";

export async function POST(req: Request) {
  try {
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
