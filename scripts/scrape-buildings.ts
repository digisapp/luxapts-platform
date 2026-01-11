// Run with: npx tsx scripts/scrape-buildings.ts [city]
// Example: npx tsx scripts/scrape-buildings.ts austin
// Example: npx tsx scripts/scrape-buildings.ts los-angeles

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { parse } from "csv-parse/sync";

interface CSVBuilding {
  name: string;
  address: string;
  city: string;
  state: string;
  neighborhood: string;
  phone: string;
  email: string;
  website: string;
  management_company: string;
}

interface ScrapedBuilding {
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
  floor_plans?: Array<{
    name?: string;
    type?: string;
    beds?: number;
    baths?: number;
    sqft?: number;
    rent?: number;
    available_date?: string;
  }>;
  amenities?: string[];
  pet_policy?: string;
  move_in_specials?: string;
  notable?: string;
  images?: {
    exterior?: string;
    gallery?: string;
  };
}

// Simple HTML fetcher with retry
async function fetchPage(url: string, retries = 3): Promise<string | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        console.log(`  HTTP ${response.status} for ${url}`);
        return null;
      }

      return await response.text();
    } catch (error) {
      if (i === retries - 1) {
        console.log(`  Failed to fetch ${url}: ${error}`);
        return null;
      }
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  return null;
}

// Extract numbers from text
function extractNumbers(text: string): number[] {
  const matches = text.match(/[\d,]+/g);
  return matches ? matches.map(m => parseInt(m.replace(/,/g, ""))) : [];
}

// Parse rent from text like "$2,500" or "$2,500 - $4,000"
function parseRent(text: string): { min: number; max: number } | null {
  const amounts = text.match(/\$[\d,]+/g);
  if (!amounts) return null;

  const nums = amounts.map(a => parseInt(a.replace(/[$,]/g, "")));
  if (nums.length === 0) return null;

  return {
    min: Math.min(...nums),
    max: Math.max(...nums),
  };
}

// Parse bedroom count from text
function parseBeds(text: string): number | null {
  const lower = text.toLowerCase();
  if (lower.includes("studio")) return 0;

  const match = lower.match(/(\d+)\s*(?:bed|br|bedroom)/i);
  if (match) return parseInt(match[1]);

  const match2 = lower.match(/^(\d+)$/);
  if (match2) return parseInt(match2[1]);

  return null;
}

// Parse bathroom count from text
function parseBaths(text: string): number | null {
  const match = text.toLowerCase().match(/(\d+(?:\.\d+)?)\s*(?:bath|ba|bathroom)/i);
  if (match) return parseFloat(match[1]);
  return null;
}

// Parse sqft from text
function parseSqft(text: string): number | null {
  const match = text.match(/([\d,]+)\s*(?:sq\.?\s*ft|sqft|sf)/i);
  if (match) return parseInt(match[1].replace(/,/g, ""));
  return null;
}

// Extract floor plans from HTML
function extractFloorPlans(html: string): ScrapedBuilding["floor_plans"] {
  const plans: ScrapedBuilding["floor_plans"] = [];

  // Common patterns for floor plan sections
  const patterns = [
    // Pattern 1: Cards with data attributes
    /data-beds="(\d+)"[^>]*data-baths="([\d.]+)"[^>]*data-sqft="(\d+)"[^>]*data-rent="(\d+)"/gi,
    // Pattern 2: JSON-LD structured data
    /"numberOfBedrooms":\s*"?(\d+)"?,\s*"numberOfBathroomsTotal":\s*"?([\d.]+)"?/gi,
  ];

  // Try to find floor plan cards/sections
  const floorPlanSections = html.match(/<div[^>]*class="[^"]*(?:floor-?plan|unit-?type|pricing)[^"]*"[^>]*>[\s\S]*?<\/div>/gi) || [];

  for (const section of floorPlanSections) {
    const plan: NonNullable<ScrapedBuilding["floor_plans"]>[0] = {};

    // Extract name
    const nameMatch = section.match(/<h[2-4][^>]*>([^<]+)<\/h[2-4]>/i);
    if (nameMatch) plan.name = nameMatch[1].trim();

    // Extract beds
    const bedsMatch = section.match(/(\d+)\s*(?:bed|br|bedroom)/i) || section.match(/studio/i);
    if (bedsMatch) {
      plan.beds = bedsMatch[0].toLowerCase().includes("studio") ? 0 : parseInt(bedsMatch[1]);
    }

    // Extract baths
    const bathsMatch = section.match(/([\d.]+)\s*(?:bath|ba)/i);
    if (bathsMatch) plan.baths = parseFloat(bathsMatch[1]);

    // Extract sqft
    const sqftMatch = section.match(/([\d,]+)\s*(?:sq\.?\s*ft|sqft|sf)/i);
    if (sqftMatch) plan.sqft = parseInt(sqftMatch[1].replace(/,/g, ""));

    // Extract rent
    const rentMatch = section.match(/\$[\d,]+/);
    if (rentMatch) plan.rent = parseInt(rentMatch[0].replace(/[$,]/g, ""));

    if (plan.beds !== undefined || plan.rent) {
      plans.push(plan);
    }
  }

  // Also look for table-based floor plans
  const tableRows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  for (const row of tableRows) {
    const cells = row.match(/<td[^>]*>([^<]*)<\/td>/gi) || [];
    if (cells.length >= 3) {
      const plan: NonNullable<ScrapedBuilding["floor_plans"]>[0] = {};

      for (const cell of cells) {
        const text = cell.replace(/<[^>]+>/g, "").trim();

        if (text.match(/studio/i)) plan.beds = 0;
        else if (text.match(/\d+\s*(?:bed|br)/i)) plan.beds = parseBeds(text) ?? undefined;
        else if (text.match(/\d+(?:\.\d+)?\s*(?:bath|ba)/i)) plan.baths = parseBaths(text) ?? undefined;
        else if (text.match(/[\d,]+\s*(?:sq|sf)/i)) plan.sqft = parseSqft(text) ?? undefined;
        else if (text.match(/\$[\d,]+/)) plan.rent = parseInt(text.replace(/[$,]/g, "")) || undefined;
      }

      if (plan.beds !== undefined || plan.rent) {
        plans.push(plan);
      }
    }
  }

  return plans.length > 0 ? plans : undefined;
}

// Extract amenities from HTML
function extractAmenities(html: string): string[] {
  const amenities: Set<string> = new Set();

  // Common amenity keywords
  const amenityKeywords = [
    "pool", "gym", "fitness", "rooftop", "concierge", "doorman", "parking",
    "garage", "laundry", "washer", "dryer", "dishwasher", "air conditioning",
    "balcony", "terrace", "patio", "garden", "courtyard", "lounge", "clubhouse",
    "business center", "pet", "dog", "cat", "spa", "sauna", "yoga", "theater",
    "screening room", "game room", "billiards", "bbq", "grill", "fire pit",
    "package", "storage", "bike", "ev charging", "valet", "security", "wifi",
    "high-speed internet", "cable", "hardwood", "stainless", "granite", "quartz",
    "smart home", "keyless", "view", "floor-to-ceiling", "walk-in closet",
  ];

  // Look for amenity lists
  const listItems = html.match(/<li[^>]*>([^<]+)<\/li>/gi) || [];
  for (const item of listItems) {
    const text = item.replace(/<[^>]+>/g, "").trim().toLowerCase();
    for (const keyword of amenityKeywords) {
      if (text.includes(keyword) && text.length < 100) {
        amenities.add(item.replace(/<[^>]+>/g, "").trim());
        break;
      }
    }
  }

  // Look for amenity sections with icons or feature lists
  const featureMatches = html.match(/(?:amenity|feature|include)[^>]*>([^<]+)/gi) || [];
  for (const match of featureMatches) {
    const text = match.replace(/<[^>]+>/g, "").replace(/^[^>]+>/, "").trim();
    if (text.length > 2 && text.length < 100) {
      amenities.add(text);
    }
  }

  return Array.from(amenities).slice(0, 30);
}

// Extract pet policy from HTML
function extractPetPolicy(html: string): string | undefined {
  const patterns = [
    /pet[^.]*policy[^.]*\./gi,
    /(?:cats?|dogs?)[^.]*(?:allowed|welcome|accepted)[^.]*\./gi,
    /no\s*pets?\s*allowed/gi,
    /pet\s*(?:friendly|deposit|fee|rent)[^.]*\./gi,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      return match[0].replace(/<[^>]+>/g, "").trim();
    }
  }

  if (html.toLowerCase().includes("pet friendly") || html.toLowerCase().includes("pet-friendly")) {
    return "Pet-friendly community";
  }

  return undefined;
}

// Extract images from HTML
function extractImages(html: string): { exterior?: string; gallery?: string } | undefined {
  const images: { exterior?: string; gallery?: string } = {};

  // Look for hero/main images
  const heroMatch = html.match(/(?:hero|banner|main|exterior)[^>]*(?:src|background-image)[=:]\s*["']?([^"'\s>]+\.(?:jpg|jpeg|png|webp))/i);
  if (heroMatch) {
    images.exterior = heroMatch[1];
  }

  // Look for gallery links
  const galleryMatch = html.match(/(?:gallery|photos|images)[^"]*["']([^"']+)["']/i);
  if (galleryMatch) {
    images.gallery = galleryMatch[1];
  }

  // Look for og:image
  const ogMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i);
  if (ogMatch && !images.exterior) {
    images.exterior = ogMatch[1];
  }

  return Object.keys(images).length > 0 ? images : undefined;
}

// Scrape a single building
async function scrapeBuilding(building: CSVBuilding): Promise<ScrapedBuilding> {
  console.log(`\nScraping: ${building.name}`);

  const result: ScrapedBuilding = {
    name: building.name,
    address: building.address,
    neighborhood: building.neighborhood,
    phone: building.phone || undefined,
    email: building.email || undefined,
    website: building.website || undefined,
    management_company: building.management_company || undefined,
  };

  if (!building.website) {
    console.log("  No website available");
    return result;
  }

  const html = await fetchPage(building.website);
  if (!html) {
    console.log("  Could not fetch website");
    return result;
  }

  console.log(`  Fetched ${html.length} bytes`);

  // Extract floor plans
  const floorPlans = extractFloorPlans(html);
  if (floorPlans && floorPlans.length > 0) {
    result.floor_plans = floorPlans;
    console.log(`  Found ${floorPlans.length} floor plans`);

    // Calculate rent and sqft ranges
    const rents = floorPlans.filter(fp => fp.rent).map(fp => fp.rent!);
    const sqfts = floorPlans.filter(fp => fp.sqft).map(fp => fp.sqft!);

    if (rents.length > 0) {
      result.rent_range = { min: Math.min(...rents), max: Math.max(...rents) };
    }
    if (sqfts.length > 0) {
      result.sqft_range = { min: Math.min(...sqfts), max: Math.max(...sqfts) };
    }

    // Get unique unit types
    const beds = new Set(floorPlans.filter(fp => fp.beds !== undefined).map(fp => fp.beds));
    result.unit_types = Array.from(beds).sort().map(b => b === 0 ? "Studio" : `${b}BR`);
  }

  // Extract amenities
  const amenities = extractAmenities(html);
  if (amenities.length > 0) {
    result.amenities = amenities;
    console.log(`  Found ${amenities.length} amenities`);
  }

  // Extract pet policy
  const petPolicy = extractPetPolicy(html);
  if (petPolicy) {
    result.pet_policy = petPolicy;
    console.log(`  Found pet policy`);
  }

  // Extract images
  const images = extractImages(html);
  if (images) {
    result.images = images;
    console.log(`  Found images`);
  }

  // Extract year built, stories from page
  const yearMatch = html.match(/(?:built|year|constructed)[^0-9]*(\d{4})/i);
  if (yearMatch) {
    const year = parseInt(yearMatch[1]);
    if (year > 1900 && year <= new Date().getFullYear()) {
      result.year_built = year;
    }
  }

  const storiesMatch = html.match(/(\d+)\s*(?:stories|floors|levels)/i);
  if (storiesMatch) {
    result.stories = parseInt(storiesMatch[1]);
  }

  // Look for move-in specials
  const specialMatch = html.match(/(?:special|offer|discount)[^.]*(?:month|free|off)[^.]*\./gi);
  if (specialMatch) {
    result.move_in_specials = specialMatch[0].replace(/<[^>]+>/g, "").trim();
  }

  return result;
}

async function main() {
  const cityArg = process.argv[2]?.toLowerCase();

  if (!cityArg || !["austin", "los-angeles", "la"].includes(cityArg)) {
    console.log("Usage: npx tsx scripts/scrape-buildings.ts [austin|los-angeles]");
    process.exit(1);
  }

  const targetCity = cityArg === "la" ? "Los Angeles" : cityArg === "austin" ? "Austin" : "Los Angeles";
  const targetState = targetCity === "Austin" ? "TX" : "CA";
  const outputSlug = targetCity === "Austin" ? "austin" : "la";

  console.log(`\n=== Scraping ${targetCity}, ${targetState} Buildings ===\n`);

  // Read CSV
  const csvPath = join(process.cwd(), "data", "onboarding_buildings.csv");
  const csvContent = readFileSync(csvPath, "utf-8");
  const buildings: CSVBuilding[] = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
  });

  // Filter by city
  const cityBuildings = buildings.filter(
    b => b.city === targetCity && b.state === targetState
  );

  console.log(`Found ${cityBuildings.length} buildings in ${targetCity}\n`);

  const scrapedBuildings: ScrapedBuilding[] = [];

  for (const building of cityBuildings) {
    const scraped = await scrapeBuilding(building);
    scrapedBuildings.push(scraped);

    // Rate limit
    await new Promise(r => setTimeout(r, 500));
  }

  // Write output
  const outputPath = join(process.cwd(), "data", `${outputSlug}_listings.json`);
  const output = { buildings: scrapedBuildings };
  writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log(`\n=== Done! ===`);
  console.log(`Scraped ${scrapedBuildings.length} buildings`);
  console.log(`Output written to: ${outputPath}`);

  // Summary
  const withFloorPlans = scrapedBuildings.filter(b => b.floor_plans?.length).length;
  const withAmenities = scrapedBuildings.filter(b => b.amenities?.length).length;
  const withRent = scrapedBuildings.filter(b => b.rent_range).length;

  console.log(`\nSummary:`);
  console.log(`  - With floor plans: ${withFloorPlans}`);
  console.log(`  - With amenities: ${withAmenities}`);
  console.log(`  - With rent data: ${withRent}`);
}

main().catch(console.error);
