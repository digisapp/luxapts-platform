import OpenAI from "openai";

// xAI uses OpenAI-compatible API
export function createXAIClient() {
  const apiKey = process.env.XAI_API_KEY;
  const baseURL = process.env.XAI_BASE_URL || "https://api.x.ai/v1";

  if (!apiKey) {
    throw new Error("XAI_API_KEY is not configured");
  }

  return new OpenAI({
    apiKey,
    baseURL,
  });
}

// Tool definitions for AI-powered search and comparison
export const AI_TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_listings",
      description:
        "Search available units/buildings by structured filters. Returns grounded results with latest pricing snapshots.",
      parameters: {
        type: "object",
        properties: {
          city_slug: {
            type: "string",
            description: "City slug (e.g., nyc, miami, la, austin)",
          },
          neighborhood_slugs: {
            type: "array",
            items: { type: "string" },
            description: "Optional neighborhood slugs to filter by",
          },
          beds_min: { type: "integer", description: "Minimum bedrooms" },
          beds_max: { type: "integer", description: "Maximum bedrooms" },
          baths_min: { type: "number", description: "Minimum bathrooms" },
          budget_min: { type: "integer", description: "Minimum monthly rent" },
          budget_max: { type: "integer", description: "Maximum monthly rent" },
          move_in_date: {
            type: "string",
            description: "Desired move-in date (YYYY-MM-DD)",
          },
          amenities_any: {
            type: "array",
            items: { type: "string" },
            description: "Any of these amenities (OR)",
          },
          amenities_all: {
            type: "array",
            items: { type: "string" },
            description: "Must have all these amenities (AND)",
          },
          pet_friendly: { type: "boolean", description: "Must allow pets" },
          parking_required: { type: "boolean", description: "Must have parking" },
          sort: {
            type: "string",
            enum: ["best_match", "price_low", "price_high", "newest", "sqft_high"],
            description: "Sort order for results",
          },
          limit: {
            type: "integer",
            description: "Maximum number of results (default 10)",
          },
        },
        required: ["city_slug"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_buildings",
      description:
        "Compare two buildings using structured facts and pricing stats from snapshots.",
      parameters: {
        type: "object",
        properties: {
          building_a_id: { type: "string", description: "First building ID" },
          building_b_id: { type: "string", description: "Second building ID" },
          beds: {
            type: "integer",
            description: "Optional: compare pricing for a specific bed count",
          },
        },
        required: ["building_a_id", "building_b_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_building_details",
      description: "Get detailed information about a specific building.",
      parameters: {
        type: "object",
        properties: {
          building_id: { type: "string", description: "Building ID" },
        },
        required: ["building_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_lead",
      description:
        "Create a lead record when user wants to schedule a tour, get more info, or connect with an agent.",
      parameters: {
        type: "object",
        properties: {
          source: {
            type: "string",
            enum: ["web_form", "chat", "voice"],
            description: "Where the lead came from",
          },
          city_slug: { type: "string", description: "City slug" },
          name: { type: "string", description: "User's name" },
          email: { type: "string", description: "User's email" },
          phone: { type: "string", description: "User's phone number" },
          budget_min: { type: "integer" },
          budget_max: { type: "integer" },
          beds: { type: "integer" },
          move_in_date: { type: "string", description: "YYYY-MM-DD" },
          notes: { type: "string", description: "Additional notes" },
          targets: {
            type: "array",
            items: {
              type: "object",
              properties: {
                building_id: { type: "string" },
                unit_id: { type: "string" },
                rank: { type: "integer" },
              },
            },
            description: "Buildings/units the user is interested in",
          },
          conversation_summary: {
            type: "string",
            description: "Summary of chat/voice conversation",
          },
        },
        required: ["source", "city_slug"],
      },
    },
  },
];

// System prompt for the AI assistant
export const SYSTEM_PROMPT = `You are LuxApts AI, an intelligent rental search assistant. You help users find apartments in major US cities.

IMPORTANT RULES:
1. Always use real data from the search_listings and compare_buildings tools
2. NEVER make up or guess prices, availability, or building details
3. When showing prices, always mention when the data was captured
4. Be helpful and conversational, but focused on finding the right apartment

When users ask about apartments:
- Ask clarifying questions about budget, location, beds/baths, move-in date
- Use search_listings to find matching units
- Present results clearly with key details (price, beds, location, amenities)
- Offer to compare buildings if the user is considering multiple options

When users want to tour or get more info:
- Use create_lead to capture their information
- Confirm what information was saved
- Let them know an agent will reach out

Example phrases that indicate high intent (trigger lead capture):
- "I want to schedule a tour"
- "Can someone call me?"
- "How do I apply?"
- "I'm ready to move forward"
- "This looks perfect, what's next?"

Be concise but friendly. Focus on helping users find their ideal apartment.`;
