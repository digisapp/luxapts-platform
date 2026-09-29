import type { Metadata } from "next";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/db-helpers";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { MapPin, ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Apartments by Neighborhood | Staycio",
  description:
    "Explore apartments for rent by neighborhood across New York, Brooklyn, Miami, Los Angeles, Austin, Dallas, Atlanta and Nashville — live availability and verified rents.",
  alternates: { canonical: "/neighborhoods" },
  openGraph: {
    title: "Apartments by Neighborhood | Staycio",
    description: "Explore apartments for rent by neighborhood with live availability.",
    url: "/neighborhoods",
    type: "website",
  },
};

export const revalidate = 3600;

type CityInfo = { id: string; name: string; slug: string; state: string };

export default async function NeighborhoodsPage() {
  const supabase = createAdminClient();

  const [{ data: neighborhoods }, buildings] = await Promise.all([
    supabase
      .from("neighborhoods")
      .select(`id, name, slug, cities:city_id (id, name, slug, state)`)
      .order("name"),
    // Paged: past 1000 active buildings the counts on this page were wrong
    // (and whole neighborhoods showed no badge at all).
    fetchAllRows<{ id: string; neighborhood_id: string | null }>((from, to) =>
      supabase
        .from("buildings")
        .select("id, neighborhood_id")
        .eq("status", "active")
        .order("id")
        .range(from, to)
    ),
  ]);

  const buildingCounts: Record<string, number> = {};
  for (const b of buildings) {
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
    // A neighborhood with no buildings links to an empty, noindexed page
    if (!city || !buildingCounts[n.id]) continue;
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
        {/* pt clears the fixed h-16 header */}
        <div className="mx-auto w-full max-w-7xl px-4 pb-16 pt-24 sm:px-6 md:pt-28">
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">
            Explore Neighborhoods
          </h1>
          <p className="mt-3 text-zinc-400 max-w-2xl">
            Find your next home by neighborhood — from Manhattan high-rises to
            Miami waterfront towers.
          </p>

          <div className="mt-12 space-y-12">
            {groups.map(({ city, neighborhoods: hoods }) => (
              <section key={city.id}>
                <div className="flex items-center justify-between gap-4">
                  <h2 className="text-xl font-medium">
                    {city.name}, {city.state}
                  </h2>
                  <Link
                    href={`/cities/${city.slug}`}
                    className="inline-flex min-h-10 shrink-0 items-center gap-1 text-sm text-zinc-400 transition-colors hover:text-white"
                  >
                    City guide <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
                  {hoods.map((hood) => {
                    const count = buildingCounts[hood.id] || 0;
                    return (
                      <Link
                        key={hood.id}
                        href={`/neighborhoods/${hood.slug}?city=${city.slug}`}
                        className="group"
                      >
                        <Card className="h-full rounded-2xl border-white/[0.08] bg-white/[0.02] transition-colors group-hover:border-white/[0.18] group-hover:bg-white/[0.04]">
                          <CardContent className="flex h-full items-center justify-between gap-3 p-4">
                            <div className="flex items-center gap-3 min-w-0">
                              <MapPin
                                className="h-4 w-4 shrink-0 text-zinc-500"
                                aria-hidden="true"
                              />
                              {/* Wrap to two lines rather than truncating
                                  ("Downtown Broo…", "Mockingbird Stat…") */}
                              <span className="line-clamp-2 font-medium leading-snug">{hood.name}</span>
                            </div>
                            {count > 0 && (
                              <span className="shrink-0 whitespace-nowrap rounded-full bg-white/[0.06] px-2.5 py-1 text-xs text-white/70">
                                {count} {count === 1 ? "building" : "buildings"}
                              </span>
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
