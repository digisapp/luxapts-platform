import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, MapPin, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CitiesPage() {
  const supabase = createAdminClient();

  // Get all cities with building counts
  const { data: cities } = await supabase
    .from("cities")
    .select("id, name, slug, state")
    .order("name");

  // Get building counts per city
  const cityStats: Record<string, { buildingCount: number; unitCount: number }> = {};

  for (const city of cities || []) {
    const { count: buildingCount } = await supabase
      .from("buildings")
      .select("*", { count: "exact", head: true })
      .eq("city_id", city.id)
      .eq("status", "active");

    const { data: buildings } = await supabase
      .from("buildings")
      .select("id")
      .eq("city_id", city.id)
      .eq("status", "active");

    const buildingIds = buildings?.map((b) => b.id) || [];

    let unitCount = 0;
    if (buildingIds.length > 0) {
      const { count } = await supabase
        .from("units")
        .select("*", { count: "exact", head: true })
        .in("building_id", buildingIds)
        .eq("is_available", true);
      unitCount = count || 0;
    }

    cityStats[city.id] = {
      buildingCount: buildingCount || 0,
      unitCount,
    };
  }

  // Get neighborhoods per city
  const { data: neighborhoods } = await supabase
    .from("neighborhoods")
    .select("id, name, slug, city_id")
    .order("name");

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
        <div className="bg-gradient-to-b from-zinc-900 to-black py-16 px-6">
          <div className="max-w-6xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
              Explore Cities
            </h1>
            <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
              Discover luxury apartments across major US cities. Browse neighborhoods, compare prices, and find your perfect home.
            </p>
          </div>
        </div>

        {/* Cities Grid */}
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {activeCities.map((city) => {
              const stats = cityStats[city.id];
              const cityNeighborhoods = neighborhoodsByCity[city.id] || [];

              return (
                <Card
                  key={city.id}
                  className="group hover:border-primary/50 transition-colors overflow-hidden"
                >
                  <CardContent className="p-0">
                    {/* City Header */}
                    <Link href={`/search?city=${city.slug}`}>
                      <div className="p-6 bg-gradient-to-br from-zinc-900 to-zinc-800 group-hover:from-primary/10 group-hover:to-zinc-900 transition-colors">
                        <div className="flex items-start justify-between">
                          <div>
                            <h2 className="text-xl font-bold text-white group-hover:text-primary transition-colors">
                              {city.name}
                            </h2>
                            <p className="text-sm text-zinc-400 flex items-center gap-1 mt-1">
                              <MapPin className="h-3 w-3" />
                              {city.state}
                            </p>
                          </div>
                          <ArrowRight className="h-5 w-5 text-zinc-500 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                        </div>

                        <div className="flex items-center gap-4 mt-4">
                          <div className="flex items-center gap-1 text-sm text-zinc-400">
                            <Building2 className="h-4 w-4" />
                            <span>{stats.buildingCount} buildings</span>
                          </div>
                          <Badge variant="secondary">
                            {stats.unitCount} units available
                          </Badge>
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
                              href={`/neighborhoods/${n.slug}`}
                            >
                              <Badge
                                variant="outline"
                                className="hover:bg-primary/10 hover:border-primary/50 transition-colors cursor-pointer"
                              >
                                {n.name}
                              </Badge>
                            </Link>
                          ))}
                          {cityNeighborhoods.length > 5 && (
                            <Badge variant="outline" className="text-muted-foreground">
                              +{cityNeighborhoods.length - 5} more
                            </Badge>
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
