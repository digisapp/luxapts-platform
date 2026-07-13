import { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/server";

export const revalidate = 3600; // Rebuild sitemap every hour

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://staycio.com";
  const supabase = createAdminClient();

  // Fetch all data in parallel
  const [citiesRes, buildingsRes, neighborhoodsRes] = await Promise.all([
    supabase.from("cities").select("slug, updated_at").order("slug"),
    supabase
      .from("buildings")
      .select("id, updated_at")
      .eq("status", "active"),
    supabase
      .from("neighborhoods")
      .select("slug, updated_at")
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
    lastModified: c.updated_at || now,
    changeFrequency: "daily",
    priority: 0.8,
  }));

  const buildingRoutes: MetadataRoute.Sitemap = buildings.map((b) => ({
    url: `${base}/buildings/${b.id}`,
    lastModified: b.updated_at || now,
    changeFrequency: "daily",
    priority: 0.7,
  }));

  const neighborhoodRoutes: MetadataRoute.Sitemap = neighborhoods.map((n) => ({
    url: `${base}/neighborhoods/${n.slug}`,
    lastModified: n.updated_at || now,
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
