import { NextResponse } from "next/server";
import { createXAIClient } from "@/lib/xai/client";

interface ParseQueryBody {
  query: string;
}

interface ParsedFilters {
  city_slug?: string;
  beds_min?: number;
  beds_max?: number;
  budget_min?: number;
  budget_max?: number;
  pet_friendly?: boolean;
  sort?: string;
  summary?: string;
}

const PARSE_SYSTEM_PROMPT = `You are a search query parser for LuxApts, a luxury apartment rental platform.
Your job is to extract search filters from natural language queries.

Available cities (use exact slugs):
- "miami" for Miami
- "new-york" for New York City, NYC, Manhattan, Brooklyn, etc.

Parse the user's query and return a JSON object with these optional fields:
- city_slug: string (miami, new-york)
- beds_min: number (0 for studio, 1, 2, 3, etc.)
- beds_max: number
- budget_min: number (monthly rent in dollars)
- budget_max: number (monthly rent in dollars)
- pet_friendly: boolean (true if they mention pets, dogs, cats)
- sort: string (price_low, price_high, sqft_high, newest)
- summary: string (brief 1-sentence summary of what they're looking for)

Examples:
Query: "2 bedroom in Miami under $3,500"
Result: {"city_slug": "miami", "beds_min": 2, "beds_max": 2, "budget_max": 3500, "summary": "2 bedroom apartments in Miami under $3,500/month"}

Query: "pet-friendly studio in NYC"
Result: {"city_slug": "new-york", "beds_min": 0, "beds_max": 0, "pet_friendly": true, "summary": "Pet-friendly studio apartments in New York"}

Query: "spacious apartment $2000-4000"
Result: {"budget_min": 2000, "budget_max": 4000, "sort": "sqft_high", "summary": "Spacious apartments between $2,000-$4,000/month"}

Query: "cheapest 1 bed in miami"
Result: {"city_slug": "miami", "beds_min": 1, "beds_max": 1, "sort": "price_low", "summary": "Most affordable 1 bedroom apartments in Miami"}

Always return valid JSON only, no additional text.`;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ParseQueryBody;

    if (!body.query?.trim()) {
      return NextResponse.json(
        { error: "Query is required" },
        { status: 400 }
      );
    }

    // Check if xAI is configured
    if (!process.env.XAI_API_KEY) {
      // Return basic parsing without AI
      return NextResponse.json({
        filters: parseBasicQuery(body.query),
        ai_powered: false,
      });
    }

    const client = createXAIClient();

    const response = await client.chat.completions.create({
      model: "grok-3",
      messages: [
        { role: "system", content: PARSE_SYSTEM_PROMPT },
        { role: "user", content: body.query },
      ],
      temperature: 0.1,
    });

    const content = response.choices[0].message.content || "{}";

    // Parse the JSON response
    let filters: ParsedFilters;
    try {
      // Extract JSON from response (in case there's extra text)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      filters = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    } catch {
      filters = parseBasicQuery(body.query);
    }

    return NextResponse.json({
      filters,
      ai_powered: true,
    });
  } catch (error) {
    console.error("Parse query error:", error);
    return NextResponse.json(
      { error: "Failed to parse query" },
      { status: 500 }
    );
  }
}

// Basic keyword parsing fallback
function parseBasicQuery(query: string): ParsedFilters {
  const q = query.toLowerCase();
  const filters: ParsedFilters = {};

  // City detection
  if (q.includes("miami")) {
    filters.city_slug = "miami";
  } else if (q.includes("nyc") || q.includes("new york") || q.includes("manhattan") || q.includes("brooklyn")) {
    filters.city_slug = "new-york";
  }

  // Bedroom detection
  if (q.includes("studio")) {
    filters.beds_min = 0;
    filters.beds_max = 0;
  } else {
    const bedMatch = q.match(/(\d+)\s*(bed|br|bedroom)/);
    if (bedMatch) {
      const beds = parseInt(bedMatch[1]);
      filters.beds_min = beds;
      filters.beds_max = beds;
    }
  }

  // Budget detection
  const priceMatch = q.match(/\$?([\d,]+)/g);
  if (priceMatch) {
    const prices = priceMatch.map(p => parseInt(p.replace(/[$,]/g, "")));
    if (q.includes("under") || q.includes("below") || q.includes("max")) {
      filters.budget_max = Math.max(...prices);
    } else if (q.includes("above") || q.includes("over") || q.includes("min")) {
      filters.budget_min = Math.min(...prices);
    } else if (prices.length >= 2) {
      filters.budget_min = Math.min(...prices);
      filters.budget_max = Math.max(...prices);
    } else if (prices.length === 1) {
      filters.budget_max = prices[0];
    }
  }

  // Pet detection
  if (q.includes("pet") || q.includes("dog") || q.includes("cat")) {
    filters.pet_friendly = true;
  }

  // Sort detection
  if (q.includes("cheap") || q.includes("affordable") || q.includes("lowest")) {
    filters.sort = "price_low";
  } else if (q.includes("spacious") || q.includes("large") || q.includes("biggest")) {
    filters.sort = "sqft_high";
  }

  filters.summary = `Search results for: "${query}"`;

  return filters;
}
