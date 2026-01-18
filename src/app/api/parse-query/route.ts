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
  amenities?: string[];
  sort?: string;
  summary?: string;
}

const PARSE_SYSTEM_PROMPT = `You are a search query parser for LuxApts, a luxury apartment rental platform.
Your job is to extract search filters from natural language queries.

Available cities (use exact slugs):
- "miami" for Miami
- "new-york" for New York City, NYC, Manhattan, Brooklyn, etc.

Available amenities (use exact names from this list):

POOLS & WATER:
- Pool (pool, swimming, lap pool, infinity pool, rooftop pool)
- Hot Tub (hot tub, jacuzzi, whirlpool)
- Cold Plunge (cold plunge, ice bath, plunge pool)
- Sauna (sauna, infrared sauna)
- Steam Room (steam room)
- Spa (spa, wellness center)

FITNESS & SPORTS:
- Gym (gym, fitness center, workout, weight room)
- Yoga (yoga studio, pilates, meditation room)
- Basketball (basketball court, sport court)
- Tennis (tennis, pickleball)
- Golf (golf simulator)
- Running Track (running track, jogging track)
- Spin (spin studio, cycling, peloton)
- Boxing (boxing gym, mma, martial arts)
- Rock Climbing (climbing wall, bouldering)

OUTDOOR:
- Rooftop (rooftop deck, sky lounge, terrace)
- Pool Deck (pool deck, sundeck, sun deck)
- Cabana (cabanas, poolside lounge)
- BBQ (bbq, grill, outdoor kitchen)
- Garden (garden, courtyard, green space)
- Fire Pit (fire pit, outdoor fireplace)

PET:
- Pet Spa (pet spa, dog wash, dog grooming, pet grooming)
- Dog Park (dog park, dog run, bark park)

SOCIAL:
- Lounge (resident lounge, club room, sky lounge)
- Game Room (game room, billiards, pool table)
- Movie Theater (movie theater, screening room, cinema)
- Library (library, reading room)
- Wine Room (wine room, wine cellar, wine locker)
- Private Dining (private dining, chef's kitchen, demonstration kitchen)
- Coworking (coworking, business center, conference room)
- Podcast (podcast studio, recording studio)
- Karaoke (karaoke room)

SERVICES:
- Concierge (concierge, 24-hour service)
- Doorman (doorman, attended lobby)
- Valet (valet parking)
- Package Room (package room, package lockers)
- Dry Cleaning (dry cleaning service, laundry service)

PARKING:
- Parking (parking garage, covered parking)
- EV Charging (ev charging, tesla charger)
- Bike Storage (bike storage, bike room)

FAMILY:
- Playroom (children's playroom, kids room, play area)
- Daycare (daycare, childcare)

IN-UNIT FEATURES:
- Washer Dryer (in-unit laundry, washer/dryer, w/d)
- Balcony (balcony, patio, terrace, private outdoor)
- Floor To Ceiling Windows (floor-to-ceiling windows, large windows, panoramic)
- High Ceilings (high ceilings, tall ceilings, loft)
- Walk-in Closet (walk-in closet, custom closet, california closet)
- Hardwood Floors (hardwood floors, wood floors)
- Stainless Steel (stainless steel appliances, chef's kitchen, gourmet kitchen)
- Granite (granite, marble, quartz countertops)
- Smart Home (smart home, nest, smart locks, keyless)
- Central Air (central air, hvac, climate control)
- Fireplace (fireplace, gas fireplace)
- Den (den, home office, study)
- Soaking Tub (soaking tub, spa tub, freestanding tub)
- Double Vanity (double vanity, dual sink, his and hers)

VIEWS:
- City View (city view, skyline view, manhattan view)
- Water View (water view, ocean view, bay view, river view, waterfront)
- Park View (park view, central park, garden view)

Parse the user's query and return a JSON object with these optional fields:
- city_slug: string (miami, new-york)
- beds_min: number (0 for studio, 1, 2, 3, etc.)
- beds_max: number
- budget_min: number (monthly rent in dollars)
- budget_max: number (monthly rent in dollars)
- pet_friendly: boolean (true if they mention pets, dogs, cats)
- amenities: string[] (array of amenity names from the list above)
- sort: string (price_low, price_high, sqft_high, newest)
- summary: string (brief 1-sentence summary of what they're looking for)

Examples:
Query: "2 bedroom in Miami under $3,500"
Result: {"city_slug": "miami", "beds_min": 2, "beds_max": 2, "budget_max": 3500, "summary": "2 bedroom apartments in Miami under $3,500/month"}

Query: "pet-friendly studio in NYC"
Result: {"city_slug": "new-york", "beds_min": 0, "beds_max": 0, "pet_friendly": true, "summary": "Pet-friendly studio apartments in New York"}

Query: "apartment with pool and gym in miami"
Result: {"city_slug": "miami", "amenities": ["Pool", "Gym"], "summary": "Apartments with pool and gym in Miami"}

Query: "building with cold plunge and rooftop in miami"
Result: {"city_slug": "miami", "amenities": ["Cold Plunge", "Rooftop"], "summary": "Apartments with cold plunge and rooftop in Miami"}

Query: "place with podcast room and coworking"
Result: {"amenities": ["Podcast", "Coworking"], "summary": "Apartments with podcast room and coworking space"}

Query: "luxury apartment with golf simulator"
Result: {"amenities": ["Golf"], "summary": "Luxury apartments with golf simulator"}

Query: "spacious apartment $2000-4000"
Result: {"budget_min": 2000, "budget_max": 4000, "sort": "sqft_high", "summary": "Spacious apartments between $2,000-$4,000/month"}

Query: "cheapest 1 bed in miami"
Result: {"city_slug": "miami", "beds_min": 1, "beds_max": 1, "sort": "price_low", "summary": "Most affordable 1 bedroom apartments in Miami"}

Query: "2 bed with washer dryer and gym in NYC under $5000"
Result: {"city_slug": "new-york", "beds_min": 2, "beds_max": 2, "budget_max": 5000, "amenities": ["Washer Dryer", "Gym"], "summary": "2 bedroom apartments with in-unit laundry and gym in NYC under $5,000/month"}

Query: "dog friendly place with dog park"
Result: {"pet_friendly": true, "amenities": ["Dog Park"], "summary": "Dog-friendly apartments with dog park"}

Query: "luxury high rise with doorman and concierge"
Result: {"amenities": ["Doorman", "Concierge"], "summary": "Luxury high-rise apartments with doorman and concierge"}

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

// Amenity keyword mapping for basic parsing
const AMENITY_KEYWORDS: Record<string, string[]> = {
  // Pools & Water
  "Pool": ["pool", "swimming", "lap pool", "infinity", "rooftop pool"],
  "Hot Tub": ["hot tub", "jacuzzi", "whirlpool"],
  "Cold Plunge": ["cold plunge", "plunge pool", "ice bath"],
  "Sauna": ["sauna", "infrared sauna"],
  "Steam Room": ["steam room", "steam"],
  "Spa": ["spa", "wellness"],

  // Fitness & Sports
  "Gym": ["gym", "fitness", "workout", "exercise", "weight room"],
  "Yoga": ["yoga", "pilates", "meditation"],
  "Basketball": ["basketball", "sport court"],
  "Tennis": ["tennis", "pickleball"],
  "Golf": ["golf simulator", "golf sim"],
  "Running Track": ["running track", "jogging track"],
  "Spin": ["spin", "cycling", "peloton"],
  "Boxing": ["boxing", "mma", "martial arts"],
  "Rock Climbing": ["climbing wall", "rock climbing", "bouldering"],

  // Outdoor
  "Rooftop": ["rooftop", "roof deck", "sky deck", "sky lounge", "terrace"],
  "Pool Deck": ["pool deck", "sundeck", "sun deck"],
  "Cabana": ["cabana", "poolside"],
  "BBQ": ["bbq", "grill", "barbecue", "outdoor kitchen"],
  "Garden": ["garden", "courtyard"],
  "Fire Pit": ["fire pit", "firepit"],

  // Pet
  "Pet Spa": ["pet spa", "dog grooming", "pet grooming", "dog wash", "pet wash"],
  "Dog Park": ["dog park", "dog run", "bark park"],

  // Social
  "Lounge": ["lounge", "club room", "resident lounge"],
  "Game Room": ["game room", "billiard", "pool table", "gaming"],
  "Movie Theater": ["movie theater", "screening room", "theater", "cinema"],
  "Library": ["library", "reading room"],
  "Wine Room": ["wine room", "wine cellar", "wine locker", "wine storage"],
  "Private Dining": ["private dining", "chef", "demonstration kitchen"],
  "Coworking": ["coworking", "co-working", "business center", "conference room", "work from home"],
  "Podcast": ["podcast", "recording studio"],
  "Karaoke": ["karaoke"],

  // Services
  "Concierge": ["concierge", "24-hour", "24 hour"],
  "Doorman": ["doorman", "door attendant", "attended lobby"],
  "Valet": ["valet", "valet parking"],
  "Package Room": ["package room", "package locker", "amazon locker"],
  "Dry Cleaning": ["dry cleaning", "laundry service"],

  // Parking
  "Parking": ["parking", "garage"],
  "EV Charging": ["ev charging", "electric vehicle", "tesla charger", "ev charger"],
  "Bike Storage": ["bike storage", "bicycle", "bike room"],

  // Family
  "Playroom": ["playroom", "children", "kids room", "play area"],
  "Daycare": ["daycare", "childcare"],

  // In-Unit
  "Washer Dryer": ["washer", "dryer", "laundry", "w/d", "in-unit laundry"],
  "Balcony": ["balcony", "patio", "private outdoor", "terrace"],
  "Floor To Ceiling Windows": ["floor-to-ceiling", "floor to ceiling", "large windows", "panoramic"],
  "High Ceilings": ["high ceiling", "tall ceiling", "loft"],
  "Walk-in Closet": ["walk-in closet", "walk in closet", "custom closet", "california closet"],
  "Hardwood Floors": ["hardwood", "wood floor"],
  "Stainless Steel": ["stainless steel", "stainless appliances", "chef kitchen", "gourmet kitchen"],
  "Granite": ["granite", "marble", "quartz", "stone countertop"],
  "Smart Home": ["smart home", "smart lock", "nest", "keyless"],
  "Central Air": ["central air", "central ac", "hvac", "climate control"],
  "Fireplace": ["fireplace"],
  "Den": ["den", "home office", "study"],
  "Soaking Tub": ["soaking tub", "spa tub", "freestanding tub"],
  "Double Vanity": ["double vanity", "dual sink", "his and hers"],

  // Views
  "City View": ["city view", "skyline view", "manhattan view"],
  "Water View": ["water view", "ocean view", "bay view", "river view", "waterfront"],
  "Park View": ["park view", "central park"],
};

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

  // Amenity detection
  const detectedAmenities: string[] = [];
  for (const [amenity, keywords] of Object.entries(AMENITY_KEYWORDS)) {
    if (keywords.some(keyword => q.includes(keyword))) {
      detectedAmenities.push(amenity);
    }
  }
  if (detectedAmenities.length > 0) {
    filters.amenities = detectedAmenities;
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
