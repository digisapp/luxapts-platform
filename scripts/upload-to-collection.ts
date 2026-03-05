#!/usr/bin/env npx ts-node

/**
 * Upload building data to xAI Collections for semantic search (RAG)
 *
 * Usage:
 *   npx tsx scripts/upload-to-collection.ts --create-collection   # First time: create collection
 *   npx tsx scripts/upload-to-collection.ts                        # Upload all buildings
 *   npx tsx scripts/upload-to-collection.ts --force                # Re-upload all (ignore existing)
 */

import { createClient } from "@supabase/supabase-js";

// Load environment variables
require("dotenv").config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const xaiApiKey = process.env.XAI_API_KEY!;
const xaiManagementKey = process.env.XAI_MANAGEMENT_API_KEY!;
const collectionId = process.env.XAI_COLLECTION_ID;

const MANAGEMENT_API = "https://management-api.x.ai/v1";
const API_BASE = "https://api.x.ai/v1";

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase environment variables");
  process.exit(1);
}

if (!xaiApiKey) {
  console.error("Missing XAI_API_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const args = process.argv.slice(2);

// ---- Create Collection ----

async function createCollection() {
  if (!xaiManagementKey) {
    console.error("Missing XAI_MANAGEMENT_API_KEY — needed to create collection");
    process.exit(1);
  }

  console.log("Creating luxapts-buildings collection...");

  const res = await fetch(`${MANAGEMENT_API}/collections`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${xaiManagementKey}`,
    },
    body: JSON.stringify({
      collection_name: "luxapts-buildings",
      field_definitions: [
        { key: "city", type: "string", description: "City slug" },
        { key: "neighborhood", type: "string", description: "Neighborhood name" },
        { key: "building_id", type: "string", description: "Supabase building UUID" },
        { key: "min_rent", type: "number", description: "Minimum monthly rent" },
        { key: "max_rent", type: "number", description: "Maximum monthly rent" },
        { key: "pet_friendly", type: "boolean", description: "Allows pets" },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Failed to create collection: ${res.status} ${text}`);
    process.exit(1);
  }

  const collection = await res.json();
  console.log(`\nCollection created!`);
  console.log(`Response:`, JSON.stringify(collection, null, 2));
  const id = collection.id || collection.collection_id;
  console.log(`\nAdd this to your .env.local:`);
  console.log(`XAI_COLLECTION_ID=${id}`);
}

// ---- Generate Building Document ----

interface BuildingRow {
  id: string;
  name: string;
  address_1: string;
  address_2: string | null;
  zip: string | null;
  description: string | null;
  year_built: number | null;
  stories: number | null;
  pet_policy: string | null;
  parking_policy: string | null;
  deposit_policy: string | null;
  website_url: string | null;
  leasing_phone: string | null;
  leasing_email: string | null;
  cities: { name: string; slug: string; state: string } | null;
  neighborhoods: { name: string; slug: string } | null;
}

interface AmenityRow {
  amenities: { name: string; category: string | null } | null;
  details: string | null;
}

interface FloorplanRow {
  name: string;
  beds: number;
  baths: number;
  sqft_min: number | null;
  sqft_max: number | null;
}

interface FactRow {
  key: string;
  value: unknown;
}

function generateDocument(
  building: BuildingRow,
  amenities: AmenityRow[],
  floorplans: FloorplanRow[],
  facts: FactRow[],
  priceRange: { min: number; max: number } | null
): string {
  const city = building.cities;
  const neighborhood = building.neighborhoods;
  const factsMap: Record<string, string> = {};
  for (const f of facts) {
    factsMap[f.key] = String(f.value);
  }

  const lines: string[] = [];

  // Header
  lines.push(`# ${building.name}`);
  lines.push("");

  // Location
  lines.push(`## Location`);
  lines.push(`Address: ${building.address_1}${building.address_2 ? `, ${building.address_2}` : ""}${building.zip ? ` ${building.zip}` : ""}`);
  if (city) lines.push(`City: ${city.name}, ${city.state}`);
  if (neighborhood) lines.push(`Neighborhood: ${neighborhood.name}`);
  lines.push("");

  // About
  if (building.description) {
    lines.push(`## About`);
    lines.push(building.description);
    lines.push("");
  }

  // Building Details
  lines.push(`## Building Details`);
  if (building.year_built) lines.push(`Year Built: ${building.year_built}`);
  if (building.stories) lines.push(`Stories: ${building.stories}`);
  if (factsMap.total_units) lines.push(`Total Units: ${factsMap.total_units}`);
  lines.push("");

  // Pricing
  if (priceRange) {
    lines.push(`## Pricing`);
    lines.push(`Rent Range: $${priceRange.min.toLocaleString()} - $${priceRange.max.toLocaleString()}/month`);
    if (factsMap.move_in_specials) {
      lines.push(`Move-in Specials: ${factsMap.move_in_specials}`);
    }
    lines.push("");
  }

  // Floor Plans
  if (floorplans.length > 0) {
    lines.push(`## Floor Plans`);
    for (const fp of floorplans) {
      const sqft = fp.sqft_min
        ? fp.sqft_max && fp.sqft_max !== fp.sqft_min
          ? `${fp.sqft_min}-${fp.sqft_max} sqft`
          : `${fp.sqft_min} sqft`
        : "";
      lines.push(`- ${fp.name}: ${fp.beds === 0 ? "Studio" : `${fp.beds} bed`} / ${fp.baths} bath${sqft ? ` / ${sqft}` : ""}`);
    }
    lines.push("");
  }

  // Amenities
  if (amenities.length > 0) {
    lines.push(`## Amenities`);
    const byCategory: Record<string, string[]> = {};
    for (const a of amenities) {
      const am = a.amenities as { name: string; category: string | null } | null;
      if (!am) continue;
      const cat = am.category || "Other";
      if (!byCategory[cat]) byCategory[cat] = [];
      const detail = a.details ? ` (${a.details})` : "";
      byCategory[cat].push(`${am.name}${detail}`);
    }
    for (const [category, items] of Object.entries(byCategory)) {
      lines.push(`### ${category}`);
      for (const item of items) {
        lines.push(`- ${item}`);
      }
    }
    lines.push("");
  }

  // Policies
  if (building.pet_policy || building.parking_policy || building.deposit_policy) {
    lines.push(`## Policies`);
    if (building.pet_policy) lines.push(`Pets: ${building.pet_policy}`);
    if (building.parking_policy) lines.push(`Parking: ${building.parking_policy}`);
    if (building.deposit_policy) lines.push(`Deposit: ${building.deposit_policy}`);
    lines.push("");
  }

  // Contact
  if (building.leasing_phone || building.leasing_email || building.website_url) {
    lines.push(`## Contact`);
    if (building.leasing_phone) lines.push(`Phone: ${building.leasing_phone}`);
    if (building.leasing_email) lines.push(`Email: ${building.leasing_email}`);
    if (building.website_url) lines.push(`Website: ${building.website_url}`);
  }

  return lines.join("\n");
}

// ---- Upload Buildings ----

async function uploadBuildings() {
  if (!collectionId) {
    console.error("Missing XAI_COLLECTION_ID — run with --create-collection first");
    process.exit(1);
  }
  if (!xaiManagementKey) {
    console.error("Missing XAI_MANAGEMENT_API_KEY");
    process.exit(1);
  }

  const forceReupload = args.includes("--force");

  // Fetch all active buildings
  const { data: buildings, error } = await supabase
    .from("buildings")
    .select(`
      id, name, address_1, address_2, zip, description,
      year_built, stories, pet_policy, parking_policy, deposit_policy,
      website_url, leasing_phone, leasing_email,
      cities:city_id (name, slug, state),
      neighborhoods:neighborhood_id (name, slug)
    `)
    .eq("status", "active")
    .order("name");

  if (error || !buildings) {
    console.error("Failed to fetch buildings:", error);
    process.exit(1);
  }

  console.log(`Found ${buildings.length} active buildings`);

  // Check which buildings are already uploaded (unless --force)
  let uploadedSet = new Set<string>();
  if (!forceReupload) {
    const { data: existingFacts } = await supabase
      .from("building_facts")
      .select("building_id")
      .eq("key", "xai_document_id");

    if (existingFacts) {
      uploadedSet = new Set(existingFacts.map((f) => f.building_id));
    }
    console.log(`Already uploaded: ${uploadedSet.size}, to upload: ${buildings.length - uploadedSet.size}`);
  }

  let uploaded = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < buildings.length; i++) {
    const building = buildings[i] as unknown as BuildingRow;

    if (!forceReupload && uploadedSet.has(building.id)) {
      skipped++;
      continue;
    }

    try {
      // Fetch amenities
      const { data: amenities } = await supabase
        .from("building_amenities")
        .select("details, amenities(name, category)")
        .eq("building_id", building.id);

      // Fetch floorplans
      const { data: floorplans } = await supabase
        .from("floorplans")
        .select("name, beds, baths, sqft_min, sqft_max")
        .eq("building_id", building.id);

      // Fetch facts
      const { data: facts } = await supabase
        .from("building_facts")
        .select("key, value")
        .eq("building_id", building.id);

      // Fetch price range from units
      const { data: units } = await supabase
        .from("units")
        .select("id")
        .eq("building_id", building.id)
        .eq("is_available", true);

      let priceRange: { min: number; max: number } | null = null;
      if (units?.length) {
        const unitIds = units.map((u) => u.id);
        const { data: prices } = await supabase
          .from("unit_price_snapshots")
          .select("rent")
          .in("unit_id", unitIds)
          .order("captured_at", { ascending: false });

        if (prices?.length) {
          const rents = prices.map((p) => p.rent);
          priceRange = { min: Math.min(...rents), max: Math.max(...rents) };
        }
      }

      // Generate document
      const doc = generateDocument(
        building,
        (amenities || []) as AmenityRow[],
        (floorplans || []) as FloorplanRow[],
        (facts || []) as FactRow[],
        priceRange
      );

      const city = building.cities as { name: string; slug: string; state: string } | null;
      const neighborhood = building.neighborhoods as { name: string; slug: string } | null;
      const slug = building.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/g, "");

      // Upload file
      const blob = new Blob([doc], { type: "text/plain" });
      const formData = new FormData();
      formData.append("file", blob, `${slug}.txt`);
      formData.append("purpose", "assistants");

      const fileRes = await fetch(`${API_BASE}/files`, {
        method: "POST",
        headers: { Authorization: `Bearer ${xaiApiKey}` },
        body: formData,
      });

      if (!fileRes.ok) {
        const text = await fileRes.text();
        console.error(`[${i + 1}/${buildings.length}] Failed to upload file for ${building.name}: ${text}`);
        errors++;
        continue;
      }

      const file = await fileRes.json();

      // Add to collection with metadata
      const isPetFriendly = building.pet_policy
        ? !building.pet_policy.toLowerCase().includes("no pet") &&
          !building.pet_policy.toLowerCase().includes("not allowed")
        : false;

      const addRes = await fetch(
        `${MANAGEMENT_API}/collections/${collectionId}/documents/${file.id}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${xaiManagementKey}`,
          },
          body: JSON.stringify({
            fields: {
              city: city?.slug || "",
              neighborhood: neighborhood?.name || "",
              building_id: building.id,
              min_rent: String(priceRange?.min || 0),
              max_rent: String(priceRange?.max || 0),
              pet_friendly: String(isPetFriendly),
            },
          }),
        }
      );

      if (!addRes.ok) {
        const text = await addRes.text();
        console.error(`[${i + 1}/${buildings.length}] Failed to add to collection for ${building.name}: ${text}`);
        errors++;
        continue;
      }

      // Track upload in building_facts for idempotency
      await supabase
        .from("building_facts")
        .upsert(
          {
            id: crypto.randomUUID(),
            building_id: building.id,
            key: "xai_document_id",
            value: JSON.stringify(file.id),
            source: "xai_collection",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "building_id,key" }
        );

      uploaded++;
      console.log(`[${i + 1}/${buildings.length}] Uploaded: ${building.name} (${city?.slug || "unknown"})`);

      // Small delay to avoid rate limiting
      await new Promise((r) => setTimeout(r, 200));
    } catch (err) {
      console.error(`[${i + 1}/${buildings.length}] Error for ${building.name}:`, err);
      errors++;
    }
  }

  console.log(`\nDone! Uploaded: ${uploaded}, Skipped: ${skipped}, Errors: ${errors}`);
}

// ---- Main ----

async function main() {
  if (args.includes("--create-collection")) {
    await createCollection();
  } else {
    await uploadBuildings();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
