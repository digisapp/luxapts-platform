import { NextResponse } from "next/server";
import { rateLimit, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { semanticSearchSchema } from "@/lib/validations";
import { searchDocuments } from "@/lib/xai/collections";
import { createAdminClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const clientIp = getClientIp(req);
    const rateLimitResult = rateLimit(`search:${clientIp}`, RATE_LIMITS.search);

    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a moment." },
        { status: 429 }
      );
    }

    const rawBody = await req.json();
    const parsed = semanticSearchSchema.safeParse(rawBody);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || "Invalid request";
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    const { query, city_slug, limit = 10 } = parsed.data;

    const collectionId = process.env.XAI_COLLECTION_ID;
    if (!collectionId) {
      return NextResponse.json(
        { error: "Semantic search not configured" },
        { status: 503 }
      );
    }

    // Search the xAI collection
    const searchResults = await searchDocuments(query, [collectionId], "hybrid");

    if (!searchResults.results?.length) {
      return NextResponse.json({ buildings: [], total: 0 });
    }

    // Extract building IDs from metadata
    const buildingIds: string[] = [];
    for (const result of searchResults.results) {
      const bid = result.metadata?.building_id as string | undefined;
      if (bid && !buildingIds.includes(bid)) {
        // Filter by city if specified
        if (city_slug && result.metadata?.city !== city_slug) continue;
        buildingIds.push(bid);
      }
    }

    if (!buildingIds.length) {
      return NextResponse.json({ buildings: [], total: 0 });
    }

    // Fetch live building data from Supabase
    const supabase = createAdminClient();
    const { data: buildings, error } = await supabase
      .from("buildings")
      .select(
        `
        id, name, slug, address_1, description, hero_image_url,
        cities:city_id (name, slug, state),
        neighborhoods:neighborhood_id (name, slug)
      `
      )
      .in("id", buildingIds.slice(0, limit))
      .eq("status", "active");

    if (error) {
      console.error("Semantic search DB error:", error);
      return NextResponse.json(
        { error: "Failed to fetch building details" },
        { status: 500 }
      );
    }

    // Attach relevance scores from search results
    const scoreMap = new Map<string, number>();
    for (const result of searchResults.results) {
      const bid = result.metadata?.building_id as string | undefined;
      if (bid && result.score != null) {
        scoreMap.set(bid, result.score);
      }
    }

    const enriched = (buildings || []).map((b) => ({
      ...b,
      relevance_score: scoreMap.get(b.id) ?? 0,
    }));

    // Sort by relevance score descending
    enriched.sort((a, b) => b.relevance_score - a.relevance_score);

    return NextResponse.json({
      buildings: enriched,
      total: enriched.length,
      query,
    });
  } catch (error) {
    console.error("Semantic search error:", error);
    return NextResponse.json(
      { error: "Failed to perform semantic search" },
      { status: 500 }
    );
  }
}
