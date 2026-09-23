import { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/db-helpers";
import { BED_FACETS, facetPath } from "@/lib/seo/facets";
import { buildingPath } from "@/lib/seo/urls";

export const revalidate = 3600; // Rebuild sitemap every hour

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://staycio.com";
  const supabase = createAdminClient();

  // Fetch all data in parallel
  const [citiesRes, buildings, neighborhoodsRes, availableUnits] = await Promise.all([
    supabase.from("cities").select("id, slug, created_at").order("slug"),
    // Active buildings exceed Supabase's 1000-row response cap — an unpaged
    // select silently dropped every building past the first 1000 from the
    // sitemap, so those pages were never submitted for indexing.
    fetchAllRows<{
      id: string;
      slug: string | null;
      created_at: string | null;
      updated_at: string | null;
      city_id: string | null;
      neighborhood_id: string | null;
    }>((from, to) =>
      supabase
        .from("buildings")
        .select("id, slug, created_at, updated_at, city_id, neighborhood_id")
        .eq("status", "active")
        .order("id")
        .range(from, to)
    ),
    supabase
      .from("neighborhoods")
      .select("id, slug, created_at, city_id")
      .order("slug"),
    // Bedroom facet pages only get submitted where there is real inventory
    // behind them; an empty facet is a thin page and nothing else.
    fetchAllRows<{ building_id: string; beds: number | null }>((from, to) =>
      supabase
        .from("units")
        .select("building_id, beds")
        .eq("is_available", true)
        .order("building_id")
        .range(from, to)
    ),
  ]);

  const cities = citiesRes.data || [];
  const neighborhoods = neighborhoodsRes.data || [];

  const now = new Date().toISOString();
  // Freshest lastmod wins for the hub pages — they change whenever any listing
  // under them does. `created_at` made every page look untouched since import.
  const freshest =
    buildings.reduce<string | null>(
      (max, b) => (b.updated_at && (!max || b.updated_at > max) ? b.updated_at : max),
      null
    ) || now;

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, lastModified: freshest, changeFrequency: "daily", priority: 1 },
    { url: `${base}/search`, lastModified: freshest, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/cities`, lastModified: freshest, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/neighborhoods`, lastModified: freshest, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: "monthly", priority: 0.2 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: "monthly", priority: 0.2 },
  ];

  // Only cities that actually have listings. Submitting an empty city page
  // for indexing earns a thin-content result and nothing else; the city comes
  // back automatically as soon as it has a building.
  const citiesWithInventory = new Set(buildings.map((b) => b.city_id).filter(Boolean));
  const activeCities = cities.filter((c) => citiesWithInventory.has(c.id));

  const cityRoutes: MetadataRoute.Sitemap = activeCities.map((c) => ({
    url: `${base}/cities/${c.slug}`,
    lastModified: freshest,
    changeFrequency: "daily",
    priority: 0.8,
  }));

  // Only buildings with something listed; the rest are noindex (see the
  // building page's generateMetadata) until inventory returns.
  const buildingsWithUnits = new Set(availableUnits.map((u) => u.building_id));
  const buildingRoutes: MetadataRoute.Sitemap = buildings.filter((b) => buildingsWithUnits.has(b.id)).map((b) => ({
    // Slug URL only. Emitting the UUID here submitted a URL that now 301s,
    // which wastes crawl budget and splits signals across two paths.
    url: `${base}${buildingPath(b)}`,
    lastModified: b.updated_at || b.created_at || now,
    changeFrequency: "daily",
    priority: 0.7,
  }));

  /* --------------------------------------------------------------------- */
  /* Neighborhoods                                                          */
  /* --------------------------------------------------------------------- */

  // 33 of the 90 unique neighborhood slugs had zero active buildings and were
  // still submitted — 33 thin pages asking to be indexed, on a site of 247
  // listings. Only submit a neighborhood that has something on it.
  const buildingsPerNeighborhood = new Map<string, number>();
  for (const b of buildings) {
    if (!b.neighborhood_id) continue;
    buildingsPerNeighborhood.set(
      b.neighborhood_id,
      (buildingsPerNeighborhood.get(b.neighborhood_id) || 0) + 1
    );
  }

  const citySlugById = new Map(cities.map((c) => [c.id, c.slug]));

  // A slug shared by several cities ("midtown" is in NYC, Miami and Atlanta)
  // used to collapse to ONE sitemap entry, so only one city's neighborhood
  // page was ever submitted. Qualify those with ?city= instead of dropping
  // them — each is a different place and a different query.
  const slugCounts = new Map<string, number>();
  for (const n of neighborhoods) {
    slugCounts.set(n.slug, (slugCounts.get(n.slug) || 0) + 1);
  }

  const neighborhoodRoutes: MetadataRoute.Sitemap = neighborhoods
    .filter((n) => (buildingsPerNeighborhood.get(n.id) || 0) > 0)
    .map((n) => {
      const ambiguous = (slugCounts.get(n.slug) || 0) > 1;
      const citySlug = n.city_id ? citySlugById.get(n.city_id) : undefined;
      return {
        url:
          ambiguous && citySlug
            ? `${base}/neighborhoods/${n.slug}?city=${citySlug}`
            : `${base}/neighborhoods/${n.slug}`,
        lastModified: freshest,
        changeFrequency: "weekly" as const,
        priority: 0.6,
      };
    });

  /* --------------------------------------------------------------------- */
  /* Bedroom facet pages                                                    */
  /* --------------------------------------------------------------------- */

  const cityIdByBuilding = new Map(buildings.map((b) => [b.id, b.city_id]));
  const facetBuildings = new Map<string, Set<string>>(); // `${citySlug}:${facet}`

  for (const u of availableUnits) {
    const cityId = cityIdByBuilding.get(u.building_id);
    if (!cityId) continue;
    const citySlug = citySlugById.get(cityId);
    if (!citySlug) continue;
    const facet = BED_FACETS.find((f) => f.matches(u.beds));
    if (!facet) continue;
    const key = `${citySlug}:${facet.slug}`;
    const set = facetBuildings.get(key) || new Set<string>();
    set.add(u.building_id);
    facetBuildings.set(key, set);
  }

  const MIN_FACET_BUILDINGS = 3;
  const facetRoutes: MetadataRoute.Sitemap = [...facetBuildings.entries()]
    .filter(([, set]) => set.size >= MIN_FACET_BUILDINGS)
    .map(([key]) => {
      const [citySlug, facetSlug] = key.split(":");
      return {
        url: `${base}${facetPath(citySlug, facetSlug)}`,
        lastModified: freshest,
        changeFrequency: "daily" as const,
        priority: 0.75,
      };
    })
    .sort((a, b) => a.url.localeCompare(b.url));

  return [
    ...staticRoutes,
    ...cityRoutes,
    ...facetRoutes,
    ...buildingRoutes,
    ...neighborhoodRoutes,
  ];
}
