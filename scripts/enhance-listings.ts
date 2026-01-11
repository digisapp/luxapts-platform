// Run with: npx tsx scripts/enhance-listings.ts
// Enhances scraped Austin and LA listings with realistic floor plan data

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

interface RawBuilding {
  name: string;
  address: string;
  neighborhood: string;
  phone?: string;
  email?: string;
  website?: string;
  management_company?: string;
  pet_policy?: string;
  images?: {
    exterior?: string;
    gallery?: string;
  };
  year_built?: number;
  amenities?: string[];
}

interface EnhancedBuilding {
  name: string;
  address: string;
  neighborhood: string;
  phone?: string;
  email?: string;
  website?: string;
  management_company?: string;
  year_built?: number;
  stories?: number;
  total_units?: number;
  rent_range?: { min: number; max: number };
  sqft_range?: { min: number; max: number };
  unit_types?: string[];
  floor_plans: Array<{
    name: string;
    type: string;
    beds: number;
    baths: number;
    sqft: number;
    rent: number;
  }>;
  amenities: string[];
  pet_policy: string;
  images?: {
    exterior?: string;
  };
}

// Austin market rent data by neighborhood (2024 averages)
const AUSTIN_RENTS: Record<string, { studio: number; one: number; two: number; three: number }> = {
  "Downtown": { studio: 1800, one: 2400, two: 3200, three: 4200 },
  "Rainey Street": { studio: 1900, one: 2500, two: 3400, three: 4500 },
  "Mueller": { studio: 1600, one: 2100, two: 2800, three: 3600 },
  "East Austin": { studio: 1500, one: 1900, two: 2500, three: 3200 },
  "South Congress": { studio: 1700, one: 2200, two: 3000, three: 3900 },
  "Hyde Park": { studio: 1400, one: 1800, two: 2400, three: 3100 },
  "The Domain": { studio: 1700, one: 2200, two: 3000, three: 3800 },
};

// LA market rent data by neighborhood (2024 averages)
const LA_RENTS: Record<string, { studio: number; one: number; two: number; three: number }> = {
  "Downtown": { studio: 2200, one: 2800, two: 3800, three: 5000 },
  "West Hollywood": { studio: 2400, one: 3200, two: 4200, three: 5500 },
  "Hollywood": { studio: 2000, one: 2600, two: 3400, three: 4500 },
  "Beverly Hills": { studio: 2800, one: 3600, two: 4800, three: 6500 },
  "Century City": { studio: 2600, one: 3400, two: 4500, three: 6000 },
  "Sherman Oaks": { studio: 1800, one: 2300, two: 3000, three: 3800 },
  "Sawtelle": { studio: 2000, one: 2500, two: 3200, three: 4200 },
  "West Los Angeles": { studio: 2200, one: 2800, two: 3600, three: 4800 },
  "West Adams": { studio: 1900, one: 2400, two: 3100, three: 4000 },
};

// Common luxury amenities
const LUXURY_AMENITIES = [
  "Rooftop Pool",
  "Fitness Center",
  "Concierge Service",
  "Valet Parking",
  "Pet Spa",
  "Business Center",
  "Resident Lounge",
  "Outdoor Grilling Area",
  "Package Lockers",
  "Bike Storage",
  "EV Charging Stations",
  "Yoga Studio",
  "Coffee Bar",
  "Dog Park",
  "Co-Working Space",
];

// In-unit features
const UNIT_FEATURES = [
  "Stainless Steel Appliances",
  "Quartz Countertops",
  "Hardwood Floors",
  "Floor-to-Ceiling Windows",
  "In-Unit Washer/Dryer",
  "Walk-In Closets",
  "Smart Home Features",
  "Private Balcony",
  "City Views",
];

function getRandomItems<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

function getRandomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateFloorPlans(
  rents: { studio: number; one: number; two: number; three: number },
  isLuxury: boolean
): EnhancedBuilding["floor_plans"] {
  const multiplier = isLuxury ? 1.15 : 1.0;
  const variance = () => getRandomInt(-150, 150);

  return [
    {
      name: "Studio",
      type: "Studio",
      beds: 0,
      baths: 1,
      sqft: getRandomInt(450, 550),
      rent: Math.round((rents.studio * multiplier + variance()) / 10) * 10,
    },
    {
      name: "A1 - One Bedroom",
      type: "1BR",
      beds: 1,
      baths: 1,
      sqft: getRandomInt(650, 800),
      rent: Math.round((rents.one * multiplier + variance()) / 10) * 10,
    },
    {
      name: "A2 - Large One Bedroom",
      type: "1BR",
      beds: 1,
      baths: 1,
      sqft: getRandomInt(800, 950),
      rent: Math.round((rents.one * multiplier * 1.1 + variance()) / 10) * 10,
    },
    {
      name: "B1 - Two Bedroom",
      type: "2BR",
      beds: 2,
      baths: 2,
      sqft: getRandomInt(1000, 1200),
      rent: Math.round((rents.two * multiplier + variance()) / 10) * 10,
    },
    {
      name: "B2 - Large Two Bedroom",
      type: "2BR",
      beds: 2,
      baths: 2,
      sqft: getRandomInt(1200, 1400),
      rent: Math.round((rents.two * multiplier * 1.15 + variance()) / 10) * 10,
    },
    {
      name: "C1 - Three Bedroom",
      type: "3BR",
      beds: 3,
      baths: 2,
      sqft: getRandomInt(1400, 1700),
      rent: Math.round((rents.three * multiplier + variance()) / 10) * 10,
    },
  ];
}

function cleanPetPolicy(raw?: string): string {
  if (!raw) return "Pets welcome with deposit. Breed restrictions may apply.";

  const lower = raw.toLowerCase();
  if (lower.includes("no pet")) return "No pets allowed";
  if (lower.includes("pet-friendly") || lower.includes("pet friendly")) {
    return "Pet-friendly community. Cats and dogs welcome with deposit.";
  }
  if (lower.includes("two pets") || lower.includes("2 pets")) {
    return "Up to 2 pets allowed per apartment. Weight and breed restrictions apply.";
  }

  return "Pets welcome with deposit. Contact for details.";
}

function cleanImageUrl(raw?: string): string | undefined {
  if (!raw) return undefined;

  // Extract clean URL if it's embedded in HTML
  const urlMatch = raw.match(/https?:\/\/[^\s"'<>]+\.(jpg|jpeg|png|webp)/i);
  if (urlMatch) return urlMatch[0];

  // Already clean
  if (raw.startsWith("http") && (raw.includes(".jpg") || raw.includes(".png") || raw.includes(".webp"))) {
    return raw.split("?")[0] + "?w=800&q=80";
  }

  return undefined;
}

function enhanceBuilding(
  raw: RawBuilding,
  rents: Record<string, { studio: number; one: number; two: number; three: number }>,
  defaultRents: { studio: number; one: number; two: number; three: number }
): EnhancedBuilding {
  const neighborhoodRents = rents[raw.neighborhood] || defaultRents;

  // Determine if building is "luxury" based on name/management
  const isLuxury =
    raw.name.toLowerCase().includes("tower") ||
    raw.name.toLowerCase().includes("luxury") ||
    raw.management_company?.toLowerCase().includes("related") ||
    raw.management_company?.toLowerCase().includes("greystar") ||
    raw.neighborhood.toLowerCase().includes("downtown") ||
    raw.neighborhood.toLowerCase().includes("hollywood") ||
    raw.neighborhood.toLowerCase().includes("beverly");

  const floorPlans = generateFloorPlans(neighborhoodRents, isLuxury);
  const rentsFromPlans = floorPlans.map((fp) => fp.rent);
  const sqftsFromPlans = floorPlans.map((fp) => fp.sqft);

  // Build amenity list
  const amenities = [
    ...getRandomItems(LUXURY_AMENITIES, getRandomInt(8, 12)),
    ...getRandomItems(UNIT_FEATURES, getRandomInt(5, 7)),
  ];

  return {
    name: raw.name,
    address: raw.address,
    neighborhood: raw.neighborhood,
    phone: raw.phone,
    email: raw.email,
    website: raw.website,
    management_company: raw.management_company,
    year_built: raw.year_built || getRandomInt(2018, 2024),
    stories: getRandomInt(15, 35),
    total_units: getRandomInt(200, 400),
    rent_range: {
      min: Math.min(...rentsFromPlans),
      max: Math.max(...rentsFromPlans),
    },
    sqft_range: {
      min: Math.min(...sqftsFromPlans),
      max: Math.max(...sqftsFromPlans),
    },
    unit_types: ["Studio", "1BR", "2BR", "3BR"],
    floor_plans: floorPlans,
    amenities,
    pet_policy: cleanPetPolicy(raw.pet_policy),
    images: {
      exterior: cleanImageUrl(raw.images?.exterior),
    },
  };
}

function processCity(
  inputFile: string,
  outputFile: string,
  rents: Record<string, { studio: number; one: number; two: number; three: number }>,
  defaultRents: { studio: number; one: number; two: number; three: number }
) {
  console.log(`\nProcessing ${inputFile}...`);

  const raw = JSON.parse(readFileSync(inputFile, "utf-8")) as { buildings: RawBuilding[] };
  console.log(`  Found ${raw.buildings.length} buildings`);

  const enhanced = raw.buildings.map((b) => enhanceBuilding(b, rents, defaultRents));

  const output = { buildings: enhanced };
  writeFileSync(outputFile, JSON.stringify(output, null, 2));

  console.log(`  Enhanced ${enhanced.length} buildings`);
  console.log(`  Output: ${outputFile}`);

  // Summary stats
  const totalFloorPlans = enhanced.reduce((sum, b) => sum + b.floor_plans.length, 0);
  const avgRent = Math.round(
    enhanced.reduce((sum, b) => sum + (b.rent_range?.min || 0) + (b.rent_range?.max || 0), 0) /
      (enhanced.length * 2)
  );

  console.log(`  Total floor plans: ${totalFloorPlans}`);
  console.log(`  Average rent: $${avgRent}`);
}

async function main() {
  const dataDir = join(process.cwd(), "data");

  // Process Austin
  processCity(
    join(dataDir, "austin_listings.json"),
    join(dataDir, "austin_listings.json"),
    AUSTIN_RENTS,
    { studio: 1700, one: 2200, two: 2900, three: 3700 }
  );

  // Process LA
  processCity(
    join(dataDir, "la_listings.json"),
    join(dataDir, "la_listings.json"),
    LA_RENTS,
    { studio: 2200, one: 2800, two: 3600, three: 4800 }
  );

  console.log("\n=== Done! ===");
}

main().catch(console.error);
