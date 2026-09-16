import { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/db-helpers";

export const revalidate = 3600; // Rebuild sitemap every hour

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://staycio.com";
  const supabase = createAdminClient();

  // Fetch all data in parallel
  const [citiesRes, buildings, neighborhoodsRes] = await Promise.all([
    supabase.from("cities").select("id, slug, created_at").order("slug"),
    // Active buildings exceed Supabase's 1000-row response cap — an unpaged
    // select silently dropped every building past the first 1000 from the
    // sitemap, so those pages were never submitted for indexing.
    fetchAllRows<{ id: string; created_at: string | null; city_id: string | null }>((from, to) =>
      supabase
        .from("buildings")
        .select("id, created_at, city_id")
        .eq("status", "active")
        .order("id")
        .range(from, to)
    ),
    supabase
      .from("neighborhoods")
      .select("slug, created_at")
      .order("slug"),
  ]);

  const cities = citiesRes.data || [];
  const neighborhoods = neighborhoodsRes.data || [];

  const now = new Date().toISOString();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${base}/search`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${base}/cities`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/neighborhoods`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: "monthly", priority: 0.2 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: "monthly", priority: 0.2 },
  ];

  // Only cities that actually have listings. Submitting an empty city page
  // for indexing earns a thin-content result and nothing else; the city comes
  // back automatically as soon as it has a building.
  const citiesWithInventory = new Set(buildings.map((b) => b.city_id).filter(Boolean));

  const cityRoutes: MetadataRoute.Sitemap = cities
    .filter((c) => citiesWithInventory.has(c.id))
    .map((c) => ({
      url: `${base}/cities/${c.slug}`,
      lastModified: c.created_at || now,
      changeFrequency: "daily",
      priority: 0.8,
    }));

  const buildingRoutes: MetadataRoute.Sitemap = buildings.map((b) => ({
    url: `${base}/buildings/${b.id}`,
    lastModified: b.created_at || now,
    changeFrequency: "daily",
    priority: 0.7,
  }));

  // Neighborhood slugs collide across cities ("midtown" exists in several) —
  // dedupe by slug so the sitemap never emits the same URL twice.
  const uniqueNeighborhoods = [
    ...new Map(neighborhoods.map((n) => [n.slug, n])).values(),
  ];

  const neighborhoodRoutes: MetadataRoute.Sitemap = uniqueNeighborhoods.map((n) => ({
    url: `${base}/neighborhoods/${n.slug}`,
    lastModified: n.created_at || now,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [
    ...staticRoutes,
    ...cityRoutes,
    ...buildingRoutes,
    ...neighborhoodRoutes,
  ];
}
