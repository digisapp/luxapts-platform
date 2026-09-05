import { searchDocuments } from "@/lib/xai/collections";
import { isValidUUID } from "@/lib/utils";
import { internalHeaders } from "@/lib/rate-limit";
import { cachedSearch } from "@/lib/search/cache";
import { searchRequestSchema } from "@/lib/validations";
import { normalizeCitySlug } from "@/lib/constants/cities";

// Per-request state passed through a single chat turn so tool usage can be
// bounded (e.g. at most one lead created per conversation turn).
export interface ToolContext {
  leadsCreated: number;
}

const MAX_LEADS_PER_REQUEST = 1;
const MAX_KNOWLEDGE_QUERY_LENGTH = 500;

// Shared tool executor for AI chat endpoints
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  baseUrl: string,
  ctx?: ToolContext
): Promise<unknown> {
  try {
    let response: Response;
    const jsonHeaders = { "Content-Type": "application/json", ...internalHeaders() };

    switch (name) {
      case "search_listings": {
        // Call the cached search directly instead of self-fetching /api/search —
        // avoids an extra function invocation + network hop. Validated with the
        // same schema the route uses. The model routinely writes "NYC"/"LA";
        // map shorthand onto the real database slugs before validating.
        const parsed = searchRequestSchema.safeParse({
          ...args,
          city_slug: normalizeCitySlug(args.city_slug),
        });
        if (!parsed.success) {
          return { error: parsed.error.issues[0]?.message || "Invalid search parameters" };
        }
        return await cachedSearch(parsed.data);
      }

      case "compare_buildings":
        response = await fetch(`${baseUrl}/api/compare`, {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify(args),
        });
        break;

      case "get_building_details":
        if (typeof args.building_id !== "string" || !isValidUUID(args.building_id)) {
          return { error: "Invalid building_id" };
        }
        response = await fetch(`${baseUrl}/api/buildings/${args.building_id}`, {
          method: "GET",
          headers: internalHeaders(),
        });
        break;

      case "search_knowledge": {
        const collectionId = process.env.XAI_COLLECTION_ID;
        if (!collectionId) {
          return { message: "Knowledge base not configured. Use search_listings for structured search instead." };
        }
        if (typeof args.query !== "string" || !args.query.trim()) {
          return { error: "Invalid query" };
        }
        const query = args.query.slice(0, MAX_KNOWLEDGE_QUERY_LENGTH);
        const results = await searchDocuments(query, [collectionId], "hybrid");
        return results;
      }

      case "create_lead":
        // Prevent a prompt-injected turn from mass-creating leads/emails.
        if (ctx && ctx.leadsCreated >= MAX_LEADS_PER_REQUEST) {
          return { error: "A lead has already been created for this conversation." };
        }
        response = await fetch(`${baseUrl}/api/leads`, {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify({ ...args, city_slug: normalizeCitySlug(args.city_slug) }),
        });
        if (ctx && response.ok) {
          ctx.leadsCreated++;
        }
        break;

      default:
        return { error: `Unknown tool: ${name}` };
    }

    if (!response.ok) {
      // Don't echo raw upstream error bodies back to the model/user.
      const errorText = await response.text();
      console.error(`Tool ${name} upstream error ${response.status}:`, errorText);
      return { error: `The ${name} request could not be completed.` };
    }

    return await response.json();
  } catch (error) {
    console.error(`Tool execution error (${name}):`, error);
    return { error: `Failed to execute ${name}` };
  }
}
