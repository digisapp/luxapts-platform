import { searchDocuments } from "@/lib/xai/collections";

// Shared tool executor for AI chat endpoints
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  baseUrl: string
): Promise<unknown> {
  try {
    let response: Response;

    switch (name) {
      case "search_listings":
        response = await fetch(`${baseUrl}/api/search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        });
        break;

      case "compare_buildings":
        response = await fetch(`${baseUrl}/api/compare`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        });
        break;

      case "get_building_details":
        response = await fetch(`${baseUrl}/api/buildings/${args.building_id}`, {
          method: "GET",
        });
        break;

      case "search_knowledge": {
        const collectionId = process.env.XAI_COLLECTION_ID;
        if (!collectionId) {
          return { message: "Knowledge base not configured. Use search_listings for structured search instead." };
        }
        const results = await searchDocuments(
          args.query as string,
          [collectionId],
          "hybrid"
        );
        return results;
      }

      case "create_lead":
        response = await fetch(`${baseUrl}/api/leads`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        });
        break;

      default:
        return { error: `Unknown tool: ${name}` };
    }

    if (!response.ok) {
      const errorText = await response.text();
      return { error: `API error: ${errorText}` };
    }

    return await response.json();
  } catch (error) {
    console.error(`Tool execution error (${name}):`, error);
    return { error: `Failed to execute ${name}` };
  }
}
