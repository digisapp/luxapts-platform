import { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/server";

export const revalidate = 3600; // Rebuild sitemap every hour

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://staycio.com";
  const supabase = createAdminClient();

  // Fetch all data in parallel
  const [citiesRes, buildingsRes, neighborhoodsRes] = await Promise.all([
    supabase.from("cities").select("slug, created_at").order("slug"),
    supabase
      .from("buildings")
      .select("id, created_at")
      .eq("status", "active"),
    supabase
      .from("neighborhoods")
      .select("slug, created_at")
      .order("slug"),
  ]);

  const cities = citiesRes.data || [];
  const buildings = buildingsRes.data || [];
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

  const cityRoutes: MetadataRoute.Sitemap = cities.map((c) => ({
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
