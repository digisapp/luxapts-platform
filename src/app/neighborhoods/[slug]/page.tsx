import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MapPin,
  Building2,
  Home,
  DollarSign,
  ArrowLeft,
  ArrowRight,
  Bed,
  TrendingUp,
} from "lucide-react";
import { formatPrice } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface NeighborhoodPageProps {
  params: Promise<{ slug: string }>;
}

export default async function NeighborhoodPage({ params }: NeighborhoodPageProps) {
  const { slug } = await params;
  const supabase = createAdminClient();

  // Get neighborhood with city info
  const { data: neighborhood, error } = await supabase
    .from("neighborhoods")
    .select(`
      id,
      name,
      slug,
      description,
      cities:city_id (id, name, slug, state)
    `)
    .eq("slug", slug)
    .single();

  if (error || !neighborhood) {
    notFound();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const citiesData = neighborhood.cities as any;
  const city = Array.isArray(citiesData) ? citiesData[0] : citiesData;

  // Get buildings in this neighborhood
  const { data: buildings } = await supabase
    .from("buildings")
    .select(`
      id,
      name,
      address_1,
      year_built,
      stories
    `)
    .eq("neighborhood_id", neighborhood.id)
    .eq("status", "active")
    .order("name");

  const buildingIds = buildings?.map((b) => b.id) || [];

  // Get available units
  const { data: units } = await supabase
    .from("units")
    .select("id, building_id, beds, baths, sqft")
    .in("building_id", buildingIds)
    .eq("is_available", true);

  const unitIds = units?.map((u) => u.id) || [];

  // Get price stats
  let priceStats = { min: 0, max: 0, avg: 0 };
  const priceByBuilding: Record<string, { min: number; count: number }> = {};

  if (unitIds.length > 0) {
    const { data: prices } = await supabase
      .from("unit_price_snapshots")
      .select("unit_id, rent")
      .in("unit_id", unitIds)
      .order("captured_at", { ascending: false });

    const latestPrices: Record<string, number> = {};
    for (const p of prices || []) {
      if (!latestPrices[p.unit_id]) {
        latestPrices[p.unit_id] = p.rent;
      }
    }

    // Map unit to building for building prices
    const unitToBuilding: Record<string, string> = {};
    for (const u of units || []) {
      unitToBuilding[u.id] = u.building_id;
    }

    for (const [unitId, rent] of Object.entries(latestPrices)) {
      const buildingId = unitToBuilding[unitId];
      if (!priceByBuilding[buildingId]) {
        priceByBuilding[buildingId] = { min: rent, count: 0 };
      }
      priceByBuilding[buildingId].min = Math.min(priceByBuilding[buildingId].min, rent);
      priceByBuilding[buildingId].count++;
    }

    const priceValues = Object.values(latestPrices);
    if (priceValues.length > 0) {
      priceStats = {
        min: Math.min(...priceValues),
        max: Math.max(...priceValues),
        avg: Math.round(priceValues.reduce((a, b) => a + b, 0) / priceValues.length),
      };
    }
  }

  // Get bed distribution
  const bedCounts: Record<number, number> = {};
  for (const unit of units || []) {
    const beds = unit.beds ?? 0;
    bedCounts[beds] = (bedCounts[beds] || 0) + 1;
  }

  // Generate description if not exists
  const description = neighborhood.description || `${neighborhood.name} is one of ${city?.name || "the city"}'s most desirable neighborhoods for luxury apartment living. With ${buildings?.length || 0} luxury buildings, ${neighborhood.name} offers a variety of modern apartments with premium amenities.`;

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 pt-16">
        {/* Hero */}
        <div className="bg-gradient-to-b from-zinc-900 to-black py-16 px-6">
          <div className="max-w-6xl mx-auto">
            <Link
              href={city ? `/cities/${city.slug}` : "/search"}
              className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors mb-6"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to {city?.name || "Search"}
            </Link>

            <div className="flex items-start justify-between gap-8">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <Badge variant="secondary" className="text-sm">
                    <MapPin className="h-3 w-3 mr-1" />
                    {city?.name}, {city?.state}
                  </Badge>
                </div>
                <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
                  {neighborhood.name}
                </h1>
                <p className="text-lg text-zinc-400 max-w-2xl">
                  {description}
                </p>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-10">
              <Card className="bg-zinc-900/50 border-zinc-800">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
                    <Building2 className="h-4 w-4" />
                    Buildings
                  </div>
                  <p className="text-2xl font-bold text-white">
                    {buildings?.length || 0}
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-zinc-900/50 border-zinc-800">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
                    <Home className="h-4 w-4" />
                    Available Units
                  </div>
                  <p className="text-2xl font-bold text-white">
                    {units?.length || 0}
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-zinc-900/50 border-zinc-800">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
                    <DollarSign className="h-4 w-4" />
                    Starting From
                  </div>
                  <p className="text-2xl font-bold text-white">
                    {priceStats.min ? formatPrice(priceStats.min) : "N/A"}
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-zinc-900/50 border-zinc-800">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
                    <TrendingUp className="h-4 w-4" />
                    Avg. Rent
                  </div>
                  <p className="text-2xl font-bold text-white">
                    {priceStats.avg ? formatPrice(priceStats.avg) : "N/A"}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="grid gap-8 lg:grid-cols-3">
            {/* Buildings List */}
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold">
                  Buildings in {neighborhood.name}
                </h2>
                <Link href={`/search?city=${city?.slug}&neighborhood=${neighborhood.slug}`}>
                  <Button variant="outline" size="sm">
                    View All Listings
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>

              {buildings && buildings.length > 0 ? (
                <div className="space-y-4">
                  {buildings.map((building) => {
                    const buildingPrice = priceByBuilding[building.id];
                    return (
                      <Link
                        key={building.id}
                        href={`/buildings/${building.id}`}
                        className="block"
                      >
                        <Card className="hover:border-primary/50 transition-colors">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                              <div>
                                <h3 className="font-semibold text-lg hover:text-primary transition-colors">
                                  {building.name}
                                </h3>
                                <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                                  <MapPin className="h-3 w-3" />
                                  {building.address_1}
                                </p>
                                <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                                  {building.year_built && (
                                    <span>Built {building.year_built}</span>
                                  )}
                                  {building.stories && (
                                    <span>{building.stories} stories</span>
                                  )}
                                </div>
                              </div>
                              <div className="text-right">
                                {buildingPrice ? (
                                  <>
                                    <p className="text-lg font-bold">
                                      From {formatPrice(buildingPrice.min)}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                      {buildingPrice.count} {buildingPrice.count === 1 ? "unit" : "units"} available
                                    </p>
                                  </>
                                ) : (
                                  <p className="text-muted-foreground">Contact for pricing</p>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Building2 className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                    <p className="text-muted-foreground">
                      No buildings currently available in this neighborhood.
                    </p>
                    <Link href="/search" className="mt-4 inline-block">
                      <Button>Browse All Apartments</Button>
                    </Link>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Unit Types */}
              {Object.keys(bedCounts).length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Bed className="h-4 w-4" />
                      Available Unit Types
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {Object.entries(bedCounts)
                      .sort(([a], [b]) => Number(a) - Number(b))
                      .map(([beds, count]) => (
                        <div
                          key={beds}
                          className="flex items-center justify-between py-2 border-b last:border-0"
                        >
                          <span className="text-sm">
                            {beds === "0" ? "Studio" : `${beds} Bedroom`}
                          </span>
                          <Badge variant="secondary">{count} available</Badge>
                        </div>
                      ))}
                  </CardContent>
                </Card>
              )}

              {/* Price Range */}
              {priceStats.min > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Price Range
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Lowest</span>
                        <span className="font-medium">{formatPrice(priceStats.min)}/mo</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Average</span>
                        <span className="font-medium">{formatPrice(priceStats.avg)}/mo</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Highest</span>
                        <span className="font-medium">{formatPrice(priceStats.max)}/mo</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Search CTA */}
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-6 text-center">
                  <h3 className="font-semibold mb-2">
                    Find Your Perfect Apartment
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Search all available units in {neighborhood.name}
                  </p>
                  <Link href={`/search?city=${city?.slug}&neighborhood=${neighborhood.slug}`}>
                    <Button className="w-full">
                      Search {neighborhood.name}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
