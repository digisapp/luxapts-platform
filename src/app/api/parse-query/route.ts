import { NextResponse } from "next/server";
import { z } from "zod";
import { createXAIClient } from "@/lib/xai/client";
import { apiError } from "@/lib/api-helpers";
import { rateLimit, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { CITY_SLUGS, isKnownCitySlug, normalizeCitySlug } from "@/lib/constants/cities";
import { getNeighborhoodCatalog, resolveNeighborhoods } from "@/lib/search/neighborhood-resolver";
import { AMENITY_KEYWORDS } from "@/lib/constants/amenities";
import { canonicalAmenityKey } from "@/lib/search/amenity-filter";
import { sanitizeMoveInDate } from "@/lib/search/move-in-date";

const PARSE_MODEL = process.env.XAI_PARSE_MODEL || "grok-4.20-0309-non-reasoning";
const PARSE_FALLBACK_MODEL = "grok-4.3";

// The amenity vocabulary the search filter actually understands. The prompt
// used to list invented slugs ("washer-dryer", "bike-room") that matched
// nothing in the catalog.
const AMENITY_KEY_LIST = Object.keys(AMENITY_KEYWORDS).join(", ");

const RequestSchema = z.object({
  query: z.string().min(1).max(500),
  city_slug: z.string().optional(),
});

// Relative phrasing ("October 1", "next month", "ASAP") can only be resolved
// against a concrete date, and the model has no reliable clock of its own.
const parseSystemPrompt = (today: string) => `You are a search query parser for a luxury apartment rental platform.
Extract structured search filters from natural language queries.

Return a JSON object with ONLY these keys (omit any key you cannot fill):
{
  "city_slug": string,          // one of: ${CITY_SLUGS.join(", ")}
  "neighborhoods": string[],    // neighborhood/district/area names exactly as written in the query
  "beds_min": integer, "beds_max": integer,
  "baths_min": number,
  "budget_min": integer, "budget_max": integer,   // monthly USD
  "pet_friendly": boolean, "parking_required": boolean,
  "move_in_date": string,       // YYYY-MM-DD — the date they want to be moved in by
  "amenities": string[],        // use these exact names only: ${AMENITY_KEY_LIST}
  "sort": "best_match" | "price_low" | "price_high" | "newest" | "sqft_high",
  "summary": string             // brief human-readable confirmation, e.g. "2BR in Miami under $3,500, pet-friendly, with pool, available by Oct 1"
}

Rules:
- city_slug: map any city mention to the closest slug ("NYC"/"Manhattan" → "new-york", "LA" → "los-angeles", "SF" → "san-francisco"). Williamsburg, DUMBO, Greenpoint, Fort Greene and Downtown Brooklyn are in "brooklyn". If a neighborhood implies a city, set city_slug too.
- neighborhoods: include a name whenever the query mentions a neighborhood, district or area ("Williamsburg", "Brickell", "SoMa", "downtown", "walk to downtown"). Never invent one.
- beds: "studio" → beds_min=0, beds_max=0; "1BR" → beds_min=1, beds_max=1; "2+" → beds_min=2
- budget: "$3k" → 3000; "under $4,000" → budget_max=4000; a bare amount like "$2,800" is budget_max
- pet_friendly: true if the user mentions pets, dogs, cats or "pet-friendly"
- move_in_date: today is ${today}. Resolve timing against it — "moving October 1" → the next October 1 falling on or after today, "moving in November" → the 1st of the next November, "next month" → the 1st of next month, "ASAP"/"now"/"immediately" → today. Omit the key entirely when the query says nothing about when they move.
- sort: "cheapest" → price_low; "biggest" → sqft_high; "newest" → newest

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

    const { query } = parsed.data;
    const contextCity = normalizeCitySlug(parsed.data.city_slug);
    const today = new Date().toISOString().slice(0, 10);

    const client = createXAIClient();
    const messages = [
      { role: "system" as const, content: parseSystemPrompt(today) },
      {
        role: "user" as const,
        content: contextCity
          ? `Parse this query (current city context: ${contextCity}): "${query}"`
          : `Parse this query: "${query}"`,
      },
    ];
    const complete = (model: string) =>
      client.chat.completions.create({
        model,
        response_format: { type: "json_object" },
        messages,
        max_tokens: 300,
        temperature: 0,
      });

    // Extraction doesn't need a reasoning model: the non-reasoning snapshot
    // answers in ~1s versus 3-5s for grok-4.3 at the same price, and the
    // search page is waiting on this round trip. Fall back if the snapshot
    // is ever retired.
    let completion;
    try {
      completion = await complete(PARSE_MODEL);
    } catch (err) {
      console.warn(`parse-query: ${PARSE_MODEL} failed, retrying with ${PARSE_FALLBACK_MODEL}:`, err);
      completion = await complete(PARSE_FALLBACK_MODEL);
    }

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed_json: Record<string, unknown> = {};
    try {
      parsed_json = JSON.parse(raw);
    } catch {
      // If model returns garbage, fall back to empty filters
    }

    // Sanitise and extract only valid fields
    const filters: Record<string, unknown> = {};

    // Accept the key the model actually emits ("city" is a common drift).
    const citySlug = normalizeCitySlug(parsed_json.city_slug ?? parsed_json.city);
    if (citySlug && isKnownCitySlug(citySlug)) {
      filters.city_slug = citySlug;
    }
    if (typeof parsed_json.beds_min === "number" && parsed_json.beds_min >= 0) filters.beds_min = Math.round(parsed_json.beds_min);
    if (typeof parsed_json.beds_max === "number" && parsed_json.beds_max >= 0) filters.beds_max = Math.round(parsed_json.beds_max);
    if (typeof parsed_json.baths_min === "number" && parsed_json.baths_min > 0) filters.baths_min = parsed_json.baths_min;
    if (typeof parsed_json.budget_min === "number" && parsed_json.budget_min > 0) filters.budget_min = Math.round(parsed_json.budget_min);
    if (typeof parsed_json.budget_max === "number" && parsed_json.budget_max > 0) filters.budget_max = Math.round(parsed_json.budget_max);
    if (parsed_json.pet_friendly === true) filters.pet_friendly = true;
    if (parsed_json.parking_required === true) filters.parking_required = true;
    const moveInDate = sanitizeMoveInDate(parsed_json.move_in_date, today);
    if (moveInDate) filters.move_in_date = moveInDate;
    if (Array.isArray(parsed_json.amenities) && parsed_json.amenities.length > 0) {
      // Canonicalize to the display keys so the UI's amenity badges and the
      // keyword matcher both recognise them ("washer-dryer" → "Washer Dryer").
      const amenities = [
        ...new Set(
          parsed_json.amenities
            .filter((a): a is string => typeof a === "string" && a.trim().length > 0)
            .map((a) => canonicalAmenityKey(a.trim()).slice(0, 100))
        ),
      ].slice(0, 10);
      if (amenities.length) filters.amenities = amenities;
    }
    const validSorts = ["best_match", "price_low", "price_high", "newest", "sqft_high"];
    if (typeof parsed_json.sort === "string" && validSorts.includes(parsed_json.sort)) {
      filters.sort = parsed_json.sort;
    }

    if (Array.isArray(parsed_json.neighborhoods) && parsed_json.neighborhoods.length > 0) {
      const names = parsed_json.neighborhoods
        .filter((n): n is string => typeof n === "string" && n.trim().length > 0)
        .slice(0, 5);
      if (names.length) {
        const catalog = await getNeighborhoodCatalog();
        const target = (filters.city_slug as string | undefined) ?? (contextCity || undefined);
        const resolved = resolveNeighborhoods(names, target, catalog);
        if (resolved.slugs.length) {
          filters.neighborhood_slugs = resolved.slugs;
          if (resolved.city_slug) filters.city_slug = resolved.city_slug;
        }
      }
    }

    const summary = typeof parsed_json.summary === "string" ? parsed_json.summary : null;

    return NextResponse.json({ filters, summary });
  } catch (error) {
    console.error("parse-query error:", error);
    // Return empty filters so the UI falls back to regular search
    return NextResponse.json({ filters: {}, summary: null });
  }
}
