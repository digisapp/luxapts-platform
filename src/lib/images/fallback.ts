/**
 * Deterministic fallback images for buildings and units that don't have
 * images in the database yet. Uses Unsplash photos and a simple hash
 * so the same building/unit always gets the same fallback photo.
 */

const BUILDING_FALLBACKS = [
  "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&q=80",
  "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&q=80",
  "https://images.unsplash.com/photo-1515263487990-61b07816b324?w=800&q=80",
  "https://images.unsplash.com/photo-1460317442991-0ec209397118?w=800&q=80",
  "https://images.unsplash.com/photo-1448630360428-65456885c650?w=800&q=80",
  "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&q=80",
  "https://images.unsplash.com/photo-1567496898669-ee935f5f647a?w=800&q=80",
  "https://images.unsplash.com/photo-1613545325278-f24b0cae1224?w=800&q=80",
  "https://images.unsplash.com/photo-1574362848149-11496d93a7c7?w=800&q=80",
  "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=800&q=80",
  "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80",
  "https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=800&q=80",
];

const UNIT_FALLBACKS = [
  "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&q=80",
  "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&q=80",
  "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=800&q=80",
  "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&q=80",
  "https://images.unsplash.com/photo-1600607687644-c7171b42498f?w=800&q=80",
  "https://images.unsplash.com/photo-1560185007-cde436f6a4d0?w=800&q=80",
  "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=800&q=80",
  "https://images.unsplash.com/photo-1616594039964-ae9021a400a0?w=800&q=80",
  "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&q=80",
  "https://images.unsplash.com/photo-1600489000022-c2086d79f9d4?w=800&q=80",
  "https://images.unsplash.com/photo-1600566752355-35792bedcfea?w=800&q=80",
  "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=800&q=80",
];

/** Simple hash of a UUID/string to get a stable index */
function stableIndex(id: string, arrayLength: number): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % arrayLength;
}

/** Get a deterministic fallback image for a building */
export function getBuildingFallbackImage(buildingId: string, buildingName: string) {
  const idx = stableIndex(buildingId, BUILDING_FALLBACKS.length);
  return {
    id: `fallback-building-${buildingId}`,
    url: BUILDING_FALLBACKS[idx],
    alt_text: `${buildingName} exterior`,
    category: "exterior" as const,
  };
}

/** Get deterministic fallback images for a unit (returns 1-2 images) */
export function getUnitFallbackImages(unitId: string, buildingName: string, unitNumber: string | null) {
  const idx1 = stableIndex(unitId, UNIT_FALLBACKS.length);
  const idx2 = stableIndex(unitId + "-2", UNIT_FALLBACKS.length);
  const label = unitNumber ? `${buildingName} - Unit ${unitNumber}` : buildingName;

  const images = [
    {
      id: `fallback-unit-${unitId}`,
      url: UNIT_FALLBACKS[idx1],
      alt_text: `${label} interior`,
      category: "living" as const,
    },
  ];

  // Add a second image if it's different from the first
  if (idx2 !== idx1) {
    images.push({
      id: `fallback-unit-${unitId}-2`,
      url: UNIT_FALLBACKS[idx2],
      alt_text: `${label} living space`,
      category: "living" as const,
    });
  }

  return images;
}

/** Get fallback images for gallery display (building page) */
export function getBuildingGalleryFallbacks(buildingId: string, buildingName: string) {
  const idx1 = stableIndex(buildingId, BUILDING_FALLBACKS.length);
  const idx2 = stableIndex(buildingId + "-lobby", BUILDING_FALLBACKS.length);
  const idx3 = stableIndex(buildingId + "-amenity", UNIT_FALLBACKS.length);

  const images: { url: string; alt: string; category: string }[] = [
    {
      url: BUILDING_FALLBACKS[idx1],
      alt: `${buildingName} exterior`,
      category: "exterior",
    },
  ];

  if (idx2 !== idx1) {
    images.push({
      url: BUILDING_FALLBACKS[idx2],
      alt: `${buildingName} building`,
      category: "exterior",
    });
  }

  images.push({
    url: UNIT_FALLBACKS[idx3],
    alt: `${buildingName} interior`,
    category: "living",
  });

  return images;
}
