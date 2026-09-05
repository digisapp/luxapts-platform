import type { Metadata } from "next";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Neighborhoods - Staycio",
  description:
    "Explore luxury apartment neighborhoods across New York, Miami, Los Angeles, Austin, Dallas, Atlanta, Nashville, and Brooklyn.",
};

export const revalidate = 3600;

type CityInfo = { id: string; name: string; slug: string; state: string };

export default async function NeighborhoodsPage() {
  const supabase = createAdminClient();

  const [{ data: neighborhoods }, { data: buildings }] = await Promise.all([
    supabase
      .from("neighborhoods")
      .select(`id, name, slug, cities:city_id (id, name, slug, state)`)
      .order("name"),
    supabase
      .from("buildings")
      .select("id, neighborhood_id")
      .eq("status", "active"),
  ]);

  const buildingCounts: Record<string, number> = {};
  for (const b of buildings || []) {
    if (b.neighborhood_id) {
      buildingCounts[b.neighborhood_id] = (buildingCounts[b.neighborhood_id] || 0) + 1;
    }
  }

  // Group neighborhoods by city
  const cityGroups = new Map<
    string,
    { city: CityInfo; neighborhoods: { id: string; name: string; slug: string }[] }
  >();
  for (const n of neighborhoods || []) {
    const c = n.cities as CityInfo | CityInfo[] | null;
    const city = Array.isArray(c) ? c[0] ?? null : c;
    if (!city) continue;
    if (!cityGroups.has(city.id)) {
      cityGroups.set(city.id, { city, neighborhoods: [] });
    }
    cityGroups.get(city.id)!.neighborhoods.push({ id: n.id, name: n.name, slug: n.slug });
  }

  const groups = [...cityGroups.values()].sort((a, b) =>
    a.city.name.localeCompare(b.city.name)
  );

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <Header />
      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-6 py-16">
          <h1 className="text-3xl lg:text-4xl font-semibold tracking-tight">
            Explore Neighborhoods
          </h1>
          <p className="mt-3 text-zinc-400 max-w-2xl">
            Find your next home by neighborhood — from Manhattan high-rises to
            Miami waterfront towers.
          </p>

          <div className="mt-12 space-y-12">
            {groups.map(({ city, neighborhoods: hoods }) => (
              <section key={city.id}>
                <div className="flex items-baseline justify-between">
                  <h2 className="text-xl font-medium">
                    {city.name}, {city.state}
                  </h2>
                  <Link
                    href={`/cities/${city.slug}`}
                    className="text-sm text-zinc-400 hover:text-white transition-colors inline-flex items-center gap-1"
                  >
                    City guide <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {hoods.map((hood) => {
                    const count = buildingCounts[hood.id] || 0;
                    return (
                      <Link
                        key={hood.id}
                        href={`/neighborhoods/${hood.slug}?city=${city.slug}`}
                        className="group"
                      >
                        <Card className="h-full border-zinc-800 bg-zinc-950 transition-colors group-hover:border-zinc-600">
                          <CardContent className="flex items-center justify-between gap-3 p-4">
                            <div className="flex items-center gap-3 min-w-0">
                              <MapPin
                                className="h-4 w-4 shrink-0 text-zinc-500"
                                aria-hidden="true"
                              />
                              <span className="truncate font-medium">{hood.name}</span>
                            </div>
                            {count > 0 && (
                              <Badge variant="secondary" className="shrink-0">
                                {count} {count === 1 ? "building" : "buildings"}
                              </Badge>
                            )}
                          </CardContent>
                        </Card>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          {groups.length === 0 && (
            <p className="mt-12 text-zinc-400">No neighborhoods available yet.</p>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
