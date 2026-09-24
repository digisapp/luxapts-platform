import { NextResponse } from "next/server";
import { rateLimit, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { semanticSearchSchema } from "@/lib/validations";
import { searchDocuments } from "@/lib/xai/collections";
import { createAdminClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-helpers";
import { getFirstRelation } from "@/lib/db-helpers";
import { normalizeCitySlug } from "@/lib/constants/cities";

export async function POST(req: Request) {
  try {
    const clientIp = getClientIp(req);
    const rateLimitResult = await rateLimit(`search:${clientIp}`, RATE_LIMITS.search);

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
      return apiError(firstError);
    }

    const { query, limit = 10 } = parsed.data;
    const city_slug = normalizeCitySlug(parsed.data.city_slug);

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
        neighborhoods:neighborhood_id (name, slug),
        building_images!left (url, is_primary, sort_order)
      `
      )
      .in("id", buildingIds.slice(0, limit * 2))
      .eq("status", "active")
      .limit(limit);

    if (error) {
      console.error("Semantic search DB error:", error);
      return apiError("Failed to fetch building details", 500);
    }

    // Attach relevance scores from search results
    const scoreMap = new Map<string, number>();
    for (const result of searchResults.results) {
      const bid = result.metadata?.building_id as string | undefined;
      if (bid && result.score != null) {
        scoreMap.set(bid, result.score);
      }
    }

    // buildings.hero_image_url is unpopulated in production (null for every
    // row) — derive the card image from the primary building photo instead so
    // Smart Search results don't all render as placeholders.
    type ImageRow = { url: string; is_primary: boolean; sort_order: number };
    const enriched = (buildings || []).map((b) => {
      const { building_images, ...rest } = b as typeof b & { building_images: ImageRow[] | null };
      const primary = [...(building_images ?? [])].sort((x, y) => {
        if (x.is_primary !== y.is_primary) return x.is_primary ? -1 : 1;
        return x.sort_order - y.sort_order;
      })[0];
      return {
        ...rest,
        cities: getFirstRelation(rest.cities),
        neighborhoods: getFirstRelation(rest.neighborhoods),
        hero_image_url: rest.hero_image_url || primary?.url || null,
        relevance_score: scoreMap.get(b.id) ?? 0,
      };
    });

    // Sort by relevance score descending
    enriched.sort((a, b) => b.relevance_score - a.relevance_score);

    return NextResponse.json({
      buildings: enriched,
      total: enriched.length,
      query,
    });
  } catch (error) {
    console.error("Semantic search error:", error);
    return apiError("Failed to perform semantic search", 500);
  }
}
