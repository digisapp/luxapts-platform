import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

// High-quality apartment/real estate images from Unsplash
// Using direct Unsplash URLs with photo IDs for reliability
const BUILDING_IMAGES = {
  exterior: [
    "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&q=80", // Modern apartment building
    "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&q=80", // Glass high-rise
    "https://images.unsplash.com/photo-1515263487990-61b07816b324?w=800&q=80", // Luxury building exterior
    "https://images.unsplash.com/photo-1460317442991-0ec209397118?w=800&q=80", // Apartment complex
    "https://images.unsplash.com/photo-1577495508048-b635879837f1?w=800&q=80", // High-rise condos
    "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&q=80", // Modern residential
    "https://images.unsplash.com/photo-1567496898669-ee935f5f647a?w=800&q=80", // Waterfront building
    "https://images.unsplash.com/photo-1613545325278-f24b0cae1224?w=800&q=80", // Luxury tower
  ],
  lobby: [
    "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800&q=80", // Modern lobby
    "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80", // Elegant lobby
  ],
  amenity: [
    "https://images.unsplash.com/photo-1540497077202-7c8a3999166f?w=800&q=80", // Gym
    "https://images.unsplash.com/photo-1575429198097-0414ec08e8cd?w=800&q=80", // Pool
    "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=800&q=80", // Rooftop
  ],
};

const UNIT_IMAGES = {
  living: [
    "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&q=80", // Living room 1
    "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&q=80", // Living room 2
    "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=800&q=80", // Living room 3
    "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&q=80", // Living room 4
    "https://images.unsplash.com/photo-1600607687644-c7171b42498f?w=800&q=80", // Living room 5
  ],
  bedroom: [
    "https://images.unsplash.com/photo-1540518614846-7eded433c457?w=800&q=80", // Bedroom 1
    "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=800&q=80", // Bedroom 2
    "https://images.unsplash.com/photo-1616594039964-ae9021a400a0?w=800&q=80", // Bedroom 3
    "https://images.unsplash.com/photo-1560185007-cde436f6a4d0?w=800&q=80", // Bedroom 4
  ],
  kitchen: [
    "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&q=80", // Kitchen 1
    "https://images.unsplash.com/photo-1600489000022-c2086d79f9d4?w=800&q=80", // Kitchen 2
    "https://images.unsplash.com/photo-1600566752355-35792bedcfea?w=800&q=80", // Kitchen 3
    "https://images.unsplash.com/photo-1556909212-d5b604d0c90d?w=800&q=80", // Kitchen 4
  ],
  bathroom: [
    "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=800&q=80", // Bathroom 1
    "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?w=800&q=80", // Bathroom 2
    "https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=800&q=80", // Bathroom 3
  ],
  view: [
    "https://images.unsplash.com/photo-1512699355324-f07e3106dae5?w=800&q=80", // City view 1
    "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=800&q=80", // City view 2
    "https://images.unsplash.com/photo-1514565131-fce0801e5785?w=800&q=80", // Ocean view
  ],
};

function getRandomItem<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function getRandomItems<T>(array: T[], count: number): T[] {
  const shuffled = [...array].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export async function POST() {
  try {
    const supabase = createAdminClient();
    const results = {
      buildings_processed: 0,
      building_images_created: 0,
      units_processed: 0,
      unit_images_created: 0,
      errors: [] as string[],
    };

    // Get all active buildings
    const { data: buildings, error: buildingsError } = await supabase
      .from("buildings")
      .select("id, name")
      .eq("status", "active");

    if (buildingsError || !buildings) {
      return NextResponse.json({ error: "Failed to fetch buildings" }, { status: 500 });
    }

    // Generate building images
    for (const building of buildings) {
      try {
        // Check if building already has images
        const { data: existingImages } = await supabase
          .from("building_images")
          .select("id")
          .eq("building_id", building.id)
          .limit(1);

        if (existingImages && existingImages.length > 0) {
          continue; // Skip buildings that already have images
        }

        // Add exterior image
        const exteriorImage = getRandomItem(BUILDING_IMAGES.exterior);
        await supabase.from("building_images").insert({
          building_id: building.id,
          url: exteriorImage,
          alt_text: `${building.name} exterior`,
          category: "exterior",
          is_primary: true,
          sort_order: 0,
        });
        results.building_images_created++;

        // Maybe add a lobby image (50% chance)
        if (Math.random() > 0.5) {
          const lobbyImage = getRandomItem(BUILDING_IMAGES.lobby);
          await supabase.from("building_images").insert({
            building_id: building.id,
            url: lobbyImage,
            alt_text: `${building.name} lobby`,
            category: "lobby",
            is_primary: false,
            sort_order: 1,
          });
          results.building_images_created++;
        }

        // Maybe add amenity images (40% chance)
        if (Math.random() > 0.6) {
          const amenityImages = getRandomItems(BUILDING_IMAGES.amenity, 2);
          for (let i = 0; i < amenityImages.length; i++) {
            await supabase.from("building_images").insert({
              building_id: building.id,
              url: amenityImages[i],
              alt_text: `${building.name} amenities`,
              category: "amenity",
              is_primary: false,
              sort_order: 2 + i,
            });
            results.building_images_created++;
          }
        }

        results.buildings_processed++;
      } catch (err) {
        results.errors.push(`Building ${building.name}: ${err}`);
      }
    }

    // Get all available units
    const { data: units, error: unitsError } = await supabase
      .from("units")
      .select("id, unit_number, beds, building_id, buildings:building_id(name)")
      .eq("is_available", true);

    if (unitsError || !units) {
      return NextResponse.json({
        success: true,
        message: "Building images created, but failed to fetch units",
        results,
      });
    }

    // Generate unit images (limit to avoid too many inserts)
    const unitsToProcess = units.slice(0, 200);

    for (const unit of unitsToProcess) {
      try {
        // Check if unit already has images
        const { data: existingImages } = await supabase
          .from("unit_images")
          .select("id")
          .eq("unit_id", unit.id)
          .limit(1);

        if (existingImages && existingImages.length > 0) {
          continue; // Skip units that already have images
        }

        const buildingName = (unit.buildings as { name: string } | null)?.name || "Apartment";

        // Add living room image (primary)
        const livingImage = getRandomItem(UNIT_IMAGES.living);
        await supabase.from("unit_images").insert({
          unit_id: unit.id,
          url: livingImage,
          alt_text: `${buildingName} - Unit ${unit.unit_number} living room`,
          category: "living",
          is_primary: true,
          sort_order: 0,
        });
        results.unit_images_created++;

        // Add bedroom image if not a studio
        if (unit.beds && unit.beds > 0) {
          const bedroomImage = getRandomItem(UNIT_IMAGES.bedroom);
          await supabase.from("unit_images").insert({
            unit_id: unit.id,
            url: bedroomImage,
            alt_text: `${buildingName} - Unit ${unit.unit_number} bedroom`,
            category: "bedroom",
            is_primary: false,
            sort_order: 1,
          });
          results.unit_images_created++;
        }

        // Add kitchen image (70% chance)
        if (Math.random() > 0.3) {
          const kitchenImage = getRandomItem(UNIT_IMAGES.kitchen);
          await supabase.from("unit_images").insert({
            unit_id: unit.id,
            url: kitchenImage,
            alt_text: `${buildingName} - Unit ${unit.unit_number} kitchen`,
            category: "kitchen",
            is_primary: false,
            sort_order: 2,
          });
          results.unit_images_created++;
        }

        // Add bathroom image (50% chance)
        if (Math.random() > 0.5) {
          const bathroomImage = getRandomItem(UNIT_IMAGES.bathroom);
          await supabase.from("unit_images").insert({
            unit_id: unit.id,
            url: bathroomImage,
            alt_text: `${buildingName} - Unit ${unit.unit_number} bathroom`,
            category: "bathroom",
            is_primary: false,
            sort_order: 3,
          });
          results.unit_images_created++;
        }

        // Add view image (30% chance)
        if (Math.random() > 0.7) {
          const viewImage = getRandomItem(UNIT_IMAGES.view);
          await supabase.from("unit_images").insert({
            unit_id: unit.id,
            url: viewImage,
            alt_text: `${buildingName} - Unit ${unit.unit_number} view`,
            category: "view",
            is_primary: false,
            sort_order: 4,
          });
          results.unit_images_created++;
        }

        results.units_processed++;
      } catch (err) {
        results.errors.push(`Unit ${unit.unit_number}: ${err}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Images generated successfully",
      results,
    });
  } catch (error) {
    console.error("Generate images error:", error);
    return NextResponse.json(
      { error: "Generation failed", details: String(error) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: "POST to this endpoint to generate images for buildings and units",
    note: "This will use Unsplash images to populate building_images and unit_images tables",
  });
}
