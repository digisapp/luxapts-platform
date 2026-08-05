import type { Metadata } from "next";
import HomeClient, {
  type FeaturedBuilding,
  type HomeStats,
  type TopNeighborhood,
} from "./HomeClient";
import { createAdminClient } from "@/lib/supabase/server";
import { getBuildingFallbackImage } from "@/lib/images/fallback";
import { fetchAllRows, getFirstRelation } from "@/lib/db-helpers";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Staycio — Your space, found.",
  description: "Stop searching — just tell Stacy what you want. Describe your ideal apartment and Stacy searches live listings in New York, Miami, Los Angeles, Chicago, Dallas, Austin, Nashville, Atlanta, and Brooklyn, comparing pricing and availability to recommend the ones worth touring.",
  openGraph: {
    title: "Staycio — Your space, found.",
    description: "Stop searching. Just tell Stacy what you want.",
    url: "https://staycio.com",
    siteName: "Staycio",
    type: "website",
    images: [
      {
        url: "https://staycio.com/og-image.png",
        width: 1200,
        height: 630,
        alt: "Staycio — Your space, found.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Staycio — Your space, found.",
    description: "Stop searching. Just tell Stacy what you want.",
    images: ["https://staycio.com/og-image.png"],
  },
  alternates: {
    canonical: "https://staycio.com",
  },
};

const FEATURED_COUNT = 6;
const MAX_PER_CITY = 2;
const TOP_NEIGHBORHOODS = 12;
// Cities with sales coverage get first claim on featured slots — a conversion
// there has someone to catch it
const SALES_CITY_SLUGS = new Set(["new-york", "miami", "brooklyn"]);
const SALES_CITY_SLOTS = 4;

interface BuildingImageRow {
  url: string;
  is_primary: boolean;
  sort_order: number;
}

interface HomeBuildingRow {
  id: string;
  name: string;
  cities: { name: string; slug: string } | { name: string; slug: string }[] | null;
  neighborhoods: { name: string; slug: string } | { name: string; slug: string }[] | null;
  building_images: BuildingImageRow[] | null;
}

async function getHomeData(): Promise<{
  stats: HomeStats;
  featured: FeaturedBuilding[];
  neighborhoods: TopNeighborhood[];
} | null> {
  try {
    const supabase = createAdminClient();

    // All queries paged past Supabase's 1000-row response cap
    const [buildings, units, citiesRes] = await Promise.all([
      fetchAllRows<HomeBuildingRow>((from, to) =>
        supabase
          .from("buildings")
          .select(`
            id, name,
            cities:city_id (name, slug),
            neighborhoods:neighborhood_id (name, slug),
            building_images!left (url, is_primary, sort_order)
          `)
          .eq("status", "active")
          .order("id")
          .range(from, to)
      ),
      fetchAllRows<{ id: string; building_id: string }>((from, to) =>
        supabase
          .from("units")
          .select("id, building_id")
          .eq("is_available", true)
          .order("id")
          .range(from, to)
      ),
      supabase.from("cities").select("id", { count: "exact", head: true }),
    ]);

    const cityCount = citiesRes.count ?? 0;

    const unitCount: Record<string, number> = {};
    for (const u of units) {
      unitCount[u.building_id] = (unitCount[u.building_id] || 0) + 1;
    }

    // Feature the buildings with the most availability, capped per city so the
    // grid shows breadth rather than one hot market
    const sorted = [...buildings].sort((a, b) => {
      const diff = (unitCount[b.id] || 0) - (unitCount[a.id] || 0);
      return diff !== 0 ? diff : a.name.localeCompare(b.name);
    });

    const perCity: Record<string, number> = {};
    const picked: typeof sorted = [];
    const take = (b: HomeBuildingRow, citySlug: string) => {
      perCity[citySlug] = (perCity[citySlug] || 0) + 1;
      picked.push(b);
    };
    // Pass 1: sales-coverage cities claim the first slots
    for (const b of sorted) {
      if (picked.length >= SALES_CITY_SLOTS) break;
      const citySlug = getFirstRelation(b.cities)?.slug ?? "unknown";
      if (!SALES_CITY_SLUGS.has(citySlug)) continue;
      if ((perCity[citySlug] || 0) >= MAX_PER_CITY) continue;
      take(b, citySlug);
    }
    // Pass 2: fill the rest from the whole fleet for breadth
    for (const b of sorted) {
      if (picked.length >= FEATURED_COUNT) break;
      if (picked.includes(b)) continue;
      const citySlug = getFirstRelation(b.cities)?.slug ?? "unknown";
      if ((perCity[citySlug] || 0) >= MAX_PER_CITY) continue;
      take(b, citySlug);
    }

    // Latest rent per unit, then min per featured building
    const pickedIds = new Set(picked.map((b) => b.id));
    const pickedUnitIds = units.filter((u) => pickedIds.has(u.building_id)).map((u) => u.id);
    const minPrice: Record<string, number> = {};

    if (pickedUnitIds.length > 0) {
      const prices = await fetchAllRows<{ unit_id: string; rent: number; captured_at: string }>(
        (from, to) =>
          supabase
            .from("unit_price_snapshots")
            .select("unit_id, rent, captured_at")
            .in("unit_id", pickedUnitIds)
            .order("captured_at", { ascending: false })
            .order("id")
            .range(from, to)
      );

      const unitToBuilding = new Map(units.map((u) => [u.id, u.building_id]));
      const seenUnits = new Set<string>();
      for (const p of prices ?? []) {
        if (seenUnits.has(p.unit_id)) continue;
        seenUnits.add(p.unit_id);
        const buildingId = unitToBuilding.get(p.unit_id);
        if (!buildingId) continue;
        const cur = minPrice[buildingId];
        if (cur === undefined || p.rent < cur) minPrice[buildingId] = p.rent;
      }
    }

    const featured: FeaturedBuilding[] = picked.map((b) => {
      const images = [...((b.building_images ?? []) as BuildingImageRow[])].sort((a, c) => {
        if (a.is_primary !== c.is_primary) return a.is_primary ? -1 : 1;
        return a.sort_order - c.sort_order;
      });
      const city = getFirstRelation(b.cities);
      const neighborhood = getFirstRelation(b.neighborhoods);

      const fallbackImage = getBuildingFallbackImage(b.id, b.name).url;
      return {
        id: b.id,
        name: b.name,
        cityName: city?.name ?? null,
        neighborhood: neighborhood?.name ?? null,
        image: images[0]?.url || fallbackImage,
        fallbackImage,
        availableUnits: unitCount[b.id] || 0,
        minPrice: minPrice[b.id] ?? null,
      };
    });

    // Most-stocked neighborhoods across all cities, by available-unit count
    const neighborhoodAgg = new Map<
      string,
      { name: string; slug: string; cityName: string | null; citySlug: string | null; units: number }
    >();
    for (const b of buildings) {
      const n = getFirstRelation(b.neighborhoods);
      if (!n?.slug) continue;
      const city = getFirstRelation(b.cities);
      const entry = neighborhoodAgg.get(n.slug) ?? {
        name: n.name,
        slug: n.slug,
        cityName: city?.name ?? null,
        citySlug: city?.slug ?? null,
        units: 0,
      };
      entry.units += unitCount[b.id] || 0;
      neighborhoodAgg.set(n.slug, entry);
    }
    const neighborhoods: TopNeighborhood[] = [...neighborhoodAgg.values()]
      .filter((n) => n.units > 0)
      .sort((a, b) => b.units - a.units)
      .slice(0, TOP_NEIGHBORHOODS)
      .map(({ name, slug, cityName }) => ({ name, slug, cityName }));

    return {
      stats: {
        cities: cityCount,
        buildings: buildings.length,
        availableUnits: units.length,
      },
      featured,
      neighborhoods,
    };
  } catch {
    // Homepage must never hard-fail on a data hiccup — render without the
    // featured section instead
    return null;
  }
}

export default async function HomePage() {
  const data = await getHomeData();
  const featured = data?.featured ?? [];

  const itemListJsonLd =
    featured.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "Featured residences on Staycio",
          itemListElement: featured.map((b, i) => ({
            "@type": "ListItem",
            position: i + 1,
            item: {
              "@type": "ApartmentComplex",
              name: b.name,
              url: `https://staycio.com/buildings/${b.id}`,
              image: b.image,
              ...(b.cityName && {
                address: { "@type": "PostalAddress", addressLocality: b.cityName },
              }),
            },
          })),
        }
      : null;

  return (
    <>
      {itemListJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
        />
      )}
      <HomeClient
        stats={data?.stats ?? null}
        featured={featured}
        neighborhoods={data?.neighborhoods ?? []}
      />
    </>
  );
}
