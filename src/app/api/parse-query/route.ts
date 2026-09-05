import { NextResponse } from "next/server";
import { z } from "zod";
import { createXAIClient } from "@/lib/xai/client";
import { apiError } from "@/lib/api-helpers";
import { rateLimit, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";

const RequestSchema = z.object({
  query: z.string().min(1).max(500),
  city_slug: z.string().optional(),
});

const PARSE_SYSTEM_PROMPT = `You are a search query parser for a luxury apartment rental platform.
Extract structured search filters from natural language queries.

Available cities (use exact slug): miami, new-york, los-angeles, austin, dallas, nashville, atlanta, brooklyn, chicago, san-francisco

Common amenities to extract: pool, gym, rooftop, doorman, concierge, parking, washer-dryer, balcony, fireplace, pet-friendly, elevator, storage, bike-room, package-room

Rules:
- If a city is mentioned, map it to the closest city slug (e.g. "NYC" → "new-york", "LA" → "los-angeles", "SF" → "san-francisco")
- For beds: "studio" → beds_min=0, beds_max=0; "1BR" → beds_min=1, beds_max=1; "2+" → beds_min=2
- For budget: extract monthly dollar amounts. "$3k" → 3000. "under $4,000" → budget_max=4000
- pet_friendly: true if user mentions pets, dogs, cats, or "pet-friendly"
- For sort hints: "cheapest" → price_low; "biggest" → sqft_high; "newest" → newest
- summary: a brief, human-readable confirmation of what you parsed (e.g. "2BR in Miami under $3,500, pet-friendly, with pool")

Respond ONLY with valid JSON. No markdown, no explanation.`;

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rl = rateLimit(`parse:${ip}`, RATE_LIMITS.search);
  if (!rl.success) {
    return apiError("Too many requests", 429);
  }

  try {
    const body = await req.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
    }

    const { query, city_slug } = parsed.data;

    const client = createXAIClient();
    const completion = await client.chat.completions.create({
      model: "grok-4.3",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: PARSE_SYSTEM_PROMPT },
        {
          role: "user",
          content: city_slug
            ? `Parse this query (current city context: ${city_slug}): "${query}"`
            : `Parse this query: "${query}"`,
        },
      ],
      max_tokens: 300,
      temperature: 0,
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed_json: Record<string, unknown> = {};
    try {
      parsed_json = JSON.parse(raw);
    } catch {
      // If model returns garbage, fall back to empty filters
    }

    // Sanitise and extract only valid fields
    const filters: Record<string, unknown> = {};

    const validCities = ["miami","new-york","los-angeles","austin","dallas","nashville","atlanta","brooklyn","chicago","san-francisco"];
    if (typeof parsed_json.city_slug === "string" && validCities.includes(parsed_json.city_slug)) {
      filters.city_slug = parsed_json.city_slug;
    }
    if (typeof parsed_json.beds_min === "number" && parsed_json.beds_min >= 0) filters.beds_min = Math.round(parsed_json.beds_min);
    if (typeof parsed_json.beds_max === "number" && parsed_json.beds_max >= 0) filters.beds_max = Math.round(parsed_json.beds_max);
    if (typeof parsed_json.baths_min === "number" && parsed_json.baths_min > 0) filters.baths_min = parsed_json.baths_min;
    if (typeof parsed_json.budget_min === "number" && parsed_json.budget_min > 0) filters.budget_min = Math.round(parsed_json.budget_min);
    if (typeof parsed_json.budget_max === "number" && parsed_json.budget_max > 0) filters.budget_max = Math.round(parsed_json.budget_max);
    if (parsed_json.pet_friendly === true) filters.pet_friendly = true;
    if (parsed_json.parking_required === true) filters.parking_required = true;
    if (Array.isArray(parsed_json.amenities) && parsed_json.amenities.length > 0) {
      filters.amenities = parsed_json.amenities.filter((a): a is string => typeof a === "string").slice(0, 10);
    }
    const validSorts = ["best_match", "price_low", "price_high", "newest", "sqft_high"];
    if (typeof parsed_json.sort === "string" && validSorts.includes(parsed_json.sort)) {
      filters.sort = parsed_json.sort;
    }

    const summary = typeof parsed_json.summary === "string" ? parsed_json.summary : null;

    return NextResponse.json({ filters, summary });
  } catch (error) {
    console.error("parse-query error:", error);
    // Return empty filters so the UI falls back to regular search
    return NextResponse.json({ filters: {}, summary: null });
  }
}
