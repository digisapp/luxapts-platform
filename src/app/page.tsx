import type { Metadata } from "next";
import HomeClient, {
  type FeaturedBuilding,
  type HomeCity,
  type HomeStats,
  type TopNeighborhood,
} from "./HomeClient";
import { createAdminClient } from "@/lib/supabase/server";
import { buildingFamilyKey } from "@/lib/images/quality";
import { fetchAllRows, getFirstRelation } from "@/lib/db-helpers";
import { fetchAvailableUnitPrices } from "@/lib/search/fetch-enrichments";

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
  cities: HomeCity[];
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
      // Rows, not just a count: the lead form's city picker has to submit a
      // slug `/api/leads` will resolve, so it uses the real table rather than
      // the curated marketing list.
      supabase.from("cities").select("name, slug", { count: "exact" }).order("name"),
    ]);

    const cityCount = citiesRes.count ?? 0;
    const cities: HomeCity[] = (citiesRes.data ?? []).map((c) => ({
      name: c.name,
      slug: c.slug,
    }));

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

    const primaryImageUrl = (b: HomeBuildingRow): string | null => {
      const images = [...((b.building_images ?? []) as BuildingImageRow[])].sort((a, c) => {
        if (a.is_primary !== c.is_primary) return a.is_primary ? -1 : 1;
        return a.sort_order - c.sort_order;
      });
      return images[0]?.url ?? null;
    };
    const perCity: Record<string, number> = {};
    const seenImages = new Set<string>();
    const seenFamilies = new Set<string>();
    const picked: typeof sorted = [];
    const take = (b: HomeBuildingRow, citySlug: string, image: string) => {
      perCity[citySlug] = (perCity[citySlug] || 0) + 1;
      seenImages.add(image);
      seenFamilies.add(buildingFamilyKey(b.name));
      picked.push(b);
    };
    // A featured card must have a real photo — the stock fallback pool is
    // fine deep in search results but not in the hero grid.
    const eligible = (b: HomeBuildingRow, citySlug: string): string | null => {
      if (picked.includes(b)) return null;
      if ((perCity[citySlug] || 0) >= MAX_PER_CITY) return null;
      const image = primaryImageUrl(b);
      if (!image || seenImages.has(image)) return null;
      if (seenFamilies.has(buildingFamilyKey(b.name))) return null;
      return image;
    };
    // Pass 1: sales-coverage cities claim the first slots
    for (const b of sorted) {
      if (picked.length >= SALES_CITY_SLOTS) break;
      const citySlug = getFirstRelation(b.cities)?.slug ?? "unknown";
      if (!SALES_CITY_SLUGS.has(citySlug)) continue;
      const image = eligible(b, citySlug);
      if (image) take(b, citySlug, image);
    }
    // Pass 2: fill the rest from the whole fleet for breadth
    for (const b of sorted) {
      if (picked.length >= FEATURED_COUNT) break;
      const citySlug = getFirstRelation(b.cities)?.slug ?? "unknown";
      const image = eligible(b, citySlug);
      if (image) take(b, citySlug, image);
    }

    // Latest rent per unit, then min per featured building
    const minPrice: Record<string, number> = {};

    if (picked.length > 0) {
      // Chunked by building id — never a giant `.in(unitIds)` URL
      const priced = await fetchAvailableUnitPrices(supabase, picked.map((b) => b.id));
      for (const u of priced) {
        if (u.latest_rent == null) continue;
        const cur = minPrice[u.building_id];
        if (cur === undefined || u.latest_rent < cur) minPrice[u.building_id] = u.latest_rent;
      }
    }

    const featured: FeaturedBuilding[] = picked.map((b) => {
      const images = [...((b.building_images ?? []) as BuildingImageRow[])].sort((a, c) => {
        if (a.is_primary !== c.is_primary) return a.is_primary ? -1 : 1;
        return a.sort_order - c.sort_order;
      });
      const city = getFirstRelation(b.cities);
      const neighborhood = getFirstRelation(b.neighborhoods);

      return {
        id: b.id,
        name: b.name,
        cityName: city?.name ?? null,
        neighborhood: neighborhood?.name ?? null,
        // `eligible()` already guaranteed a real photo for every featured card.
        image: images[0]!.url,
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
      // Slugs collide across cities ("midtown" exists in NYC, Miami and
      // Atlanta), so aggregate per city or the chip sums three markets.
      const key = `${city?.slug ?? ""}/${n.slug}`;
      const entry = neighborhoodAgg.get(key) ?? {
        name: n.name,
        slug: n.slug,
        cityName: city?.name ?? null,
        citySlug: city?.slug ?? null,
        units: 0,
      };
      entry.units += unitCount[b.id] || 0;
      neighborhoodAgg.set(key, entry);
    }
    const neighborhoods: TopNeighborhood[] = [...neighborhoodAgg.values()]
      .filter((n) => n.units > 0)
      .sort((a, b) => b.units - a.units)
      .slice(0, TOP_NEIGHBORHOODS)
      .map(({ name, slug, cityName, citySlug }) => ({ name, slug, cityName, citySlug }));

    return {
      stats: {
        cities: cityCount,
        buildings: buildings.length,
        availableUnits: units.length,
      },
      featured,
      neighborhoods,
      cities,
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
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd).replace(/</g, "\\u003c") }}
        />
      )}
      <HomeClient
        stats={data?.stats ?? null}
        featured={featured}
        neighborhoods={data?.neighborhoods ?? []}
        cities={data?.cities ?? []}
      />
    </>
  );
}
