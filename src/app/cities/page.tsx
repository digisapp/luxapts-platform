import type { Metadata } from "next";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/db-helpers";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, MapPin, ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Apartments for Rent by City | Staycio",
  description:
    "Browse apartments for rent in New York, Brooklyn, Miami, Los Angeles, Dallas, Austin, Nashville and Atlanta. Live availability, verified rents and floor plans on Staycio.",
  // Self-referencing canonical: without one, every ?utm_/?ref= variant of this
  // page is a separate crawlable duplicate.
  alternates: { canonical: "/cities" },
  openGraph: {
    title: "Apartments for Rent by City | Staycio",
    description: "Browse apartments for rent across eight US cities with live availability.",
    url: "/cities",
    type: "website",
  },
};

// Revalidate hourly — counts don't need to be live, and this page was the
// slowest TTFB on the site under force-dynamic
export const revalidate = 3600;

export default async function CitiesPage() {
  const supabase = createAdminClient();

  // Flat queries instead of 3-per-city (N+1) — counts are aggregated in JS
  const [citiesRes, buildings, units, neighborhoodsRes] = await Promise.all([
    supabase.from("cities").select("id, name, slug, state").order("name"),
    // Active buildings also exceed the 1000-row cap — unpaged, every city's
    // building/unit counts were undercounted.
    fetchAllRows<{ id: string; city_id: string }>((from, to) =>
      supabase
        .from("buildings")
        .select("id, city_id")
        .eq("status", "active")
        .order("id")
        .range(from, to)
    ),
    // Available units can exceed Supabase's 1000-row response cap
    fetchAllRows<{ id: string; building_id: string }>((from, to) =>
      supabase
        .from("units")
        .select("id, building_id")
        .eq("is_available", true)
        .order("id")
        .range(from, to)
    ),
    supabase.from("neighborhoods").select("id, name, slug, city_id").order("name"),
  ]);

  const cities = citiesRes.data;
  const neighborhoods = neighborhoodsRes.data;

  // Aggregate building + available-unit counts per city
  const cityStats: Record<string, { buildingCount: number; unitCount: number }> = {};
  const cityByBuilding: Record<string, string> = {};

  for (const b of buildings) {
    cityByBuilding[b.id] = b.city_id;
    if (!cityStats[b.city_id]) {
      cityStats[b.city_id] = { buildingCount: 0, unitCount: 0 };
    }
    cityStats[b.city_id].buildingCount++;
  }

  for (const u of units) {
    const cityId = cityByBuilding[u.building_id];
    if (cityId && cityStats[cityId]) {
      cityStats[cityId].unitCount++;
    }
  }

  const neighborhoodsByCity: Record<string, Array<{ id: string; name: string; slug: string }>> = {};
  for (const n of neighborhoods || []) {
    if (!neighborhoodsByCity[n.city_id]) {
      neighborhoodsByCity[n.city_id] = [];
    }
    neighborhoodsByCity[n.city_id].push(n);
  }

  // Filter to cities with buildings
  const activeCities = (cities || []).filter(
    (city) => cityStats[city.id]?.buildingCount > 0
  );

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 pt-16">
        {/* Hero */}
        <div className="bg-gradient-to-b from-zinc-900 to-black pt-10 pb-10 md:pt-16 md:pb-12">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
            <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-white mb-4">
              Explore Cities
            </h1>
            <p className="text-lg text-zinc-400 max-w-2xl">
              Discover luxury apartments across major US cities. Browse neighborhoods, compare prices, and find your perfect home.
            </p>
          </div>
        </div>

        {/* Cities Grid */}
        <div className="mx-auto w-full max-w-7xl px-4 pb-16 pt-4 sm:px-6 md:pt-6">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {activeCities.map((city) => {
              const stats = cityStats[city.id];
              const cityNeighborhoods = neighborhoodsByCity[city.id] || [];

              return (
                <Card
                  key={city.id}
                  className="group overflow-hidden rounded-2xl border-white/[0.08] hover:border-white/[0.18] transition-colors"
                >
                  <CardContent className="p-0">
                    {/* City Header */}
                    <Link href={`/cities/${city.slug}`}>
                      <div className="p-6 bg-gradient-to-br from-zinc-900 to-zinc-800 group-hover:from-primary/10 group-hover:to-zinc-900 transition-colors">
                        <div className="flex items-start justify-between">
                          <div>
                            <h2 className="text-xl font-semibold text-white">
                              {city.name}
                            </h2>
                            <p className="text-sm text-zinc-400 flex items-center gap-1 mt-1">
                              <MapPin className="h-3 w-3" aria-hidden="true" />
                              {city.state}
                            </p>
                          </div>
                          <ArrowRight className="h-5 w-5 text-zinc-500 group-hover:text-white group-hover:translate-x-1 transition-all" aria-hidden="true" />
                        </div>

                        <div className="flex items-center gap-4 mt-4">
                          <div className="flex items-center gap-1 text-sm text-zinc-400">
                            <Building2 className="h-4 w-4" />
                            <span>{stats.buildingCount} buildings</span>
                          </div>
                          <span className="rounded-full bg-black/40 px-2.5 py-1 text-xs font-medium text-emerald-300 ring-1 ring-emerald-400/30">
                            {stats.unitCount} units available
                          </span>
                        </div>
                      </div>
                    </Link>

                    {/* Neighborhoods */}
                    {cityNeighborhoods.length > 0 && (
                      <div className="p-4 border-t">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">
                          Popular Neighborhoods
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {cityNeighborhoods.slice(0, 5).map((n) => (
                            <Link
                              key={n.id}
                              href={`/neighborhoods/${n.slug}?city=${city.slug}`}
                              className="inline-flex min-h-9 items-center rounded-full border border-white/[0.08] px-3 text-xs font-medium text-white/80 transition-colors hover:border-white/25 hover:bg-white/[0.05] hover:text-white"
                            >
                              {n.name}
                            </Link>
                          ))}
                          {cityNeighborhoods.length > 5 && (
                            <Link
                              href={`/cities/${city.slug}`}
                              aria-label={`All ${cityNeighborhoods.length} ${city.name} neighborhoods`}
                              className="inline-flex min-h-9 items-center rounded-full px-3 text-xs text-white/50 transition-colors hover:text-white"
                            >
                              +{cityNeighborhoods.length - 5} more
                            </Link>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {activeCities.length === 0 && (
            <div className="text-center py-12">
              <Building2 className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground">No cities available yet.</p>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
