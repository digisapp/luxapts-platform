import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { getBuildingFallbackImage } from "@/lib/images/fallback";
import { fetchAvailableUnitPrices } from "@/lib/search/fetch-enrichments";
import { CITY_COPY } from "@/lib/seo/city-copy";
import { formatPrice } from "@/lib/utils";
import { Building2, MapPin, Search, ArrowRight, Star, TrendingUp } from "lucide-react";

export const revalidate = 3600;

export async function generateStaticParams() {
  const supabase = createAdminClient();
  const { data } = await supabase.from("cities").select("slug");
  return (data || []).map((c) => ({ slug: c.slug }));
}

// Per-city hero images (curated Unsplash, landscape/skyline)
const CITY_HERO_IMAGES: Record<string, string> = {
  miami:
    "https://images.unsplash.com/photo-1533106497176-45ae19e68ba2?w=1400&q=85",
  "new-york":
    "https://images.unsplash.com/photo-1485871981521-5b1fd3805eee?w=1400&q=85",
  "los-angeles":
    "https://images.unsplash.com/photo-1580655653885-65763b2597d1?w=1400&q=85",
  austin:
    "https://images.unsplash.com/photo-1531218150217-54595bc2b934?w=1400&q=85",
  dallas:
    "https://images.unsplash.com/photo-1545291730-faff8ca1d4b0?w=1400&q=85",
  nashville:
    "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1400&q=85",
  atlanta:
    "https://images.unsplash.com/photo-1575917649705-5b59aaa12e6b?w=1400&q=85",
  brooklyn:
    "https://images.unsplash.com/photo-1555109307-f7d9da25c244?w=1400&q=85",
  chicago:
    "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=1400&q=85",
  "san-francisco":
    "https://images.unsplash.com/photo-1501594907352-04cda38ebc29?w=1400&q=85",
};

// City-specific taglines
const CITY_TAGLINES: Record<string, string> = {
  miami: "Sun, sand, and skyline living",
  "new-york": "The city that never sleeps — live at its heart",
  "los-angeles": "Where luxury meets the Pacific",
  austin: "Keep it weird, keep it luxurious",
  dallas: "Big city energy, Southern sophistication",
  nashville: "Music City's most coveted addresses",
  atlanta: "The ATL's finest residences",
  brooklyn: "Brooklyn cool, Manhattan close",
  chicago: "The Windy City's premier apartments",
  "san-francisco": "Bay Area living, elevated",
};

interface CityPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: CityPageProps): Promise<Metadata> {
  const { slug } = await params;
  const supabase = createAdminClient();
  const { data: city } = await supabase
    .from("cities")
    .select("name, slug, state")
    .eq("slug", slug)
    .single();

  if (!city) return { title: "City Not Found - Staycio" };

  return {
    title: `Luxury Apartments in ${city.name}, ${city.state} | Staycio`,
    description: `Browse the finest luxury apartments in ${city.name}. Curated listings with verified pricing, photos, and amenities.`,
    alternates: { canonical: `/cities/${slug}` },
    openGraph: {
      title: `Luxury Apartments in ${city.name} | Staycio`,
      description: `Find your perfect luxury apartment in ${city.name}.`,
      images: CITY_HERO_IMAGES[slug] ? [CITY_HERO_IMAGES[slug]] : [],
    },
  };
}

export default async function CityPage({ params }: CityPageProps) {
  const { slug } = await params;
  const supabase = createAdminClient();

  // Fetch city
  const { data: city } = await supabase
    .from("cities")
    .select("id, name, slug, state")
    .eq("slug", slug)
    .single();

  if (!city) notFound();

  // Fetch in parallel: buildings, neighborhoods
  const [buildingsRes, neighborhoodsRes] = await Promise.all([
    supabase
      .from("buildings")
      .select(`
        id, name, address_1, zip, description, year_built,
        neighborhoods:neighborhood_id (id, name, slug),
        building_images!left (url, is_primary, sort_order)
      `)
      .eq("city_id", city.id)
      .eq("status", "active")
      .order("name"),
    supabase
      .from("neighborhoods")
      .select("id, name, slug")
      .eq("city_id", city.id)
      .order("name"),
  ]);

  const buildings = buildingsRes.data || [];
  const neighborhoods = neighborhoodsRes.data || [];

  // Get building IDs for unit + price queries
  const buildingIds = buildings.map((b) => b.id);

  // Fetch available unit counts and min prices per building
  const unitCountMap: Record<string, number> = {};
  const minPriceMap: Record<string, number> = {};

  if (buildingIds.length > 0) {
    // One chunked + paged query on the price view: unit counts and minimum
    // rents per building without the giant `.in(unitIds)` URL that broke
    // past a few hundred units.
    const units = await fetchAvailableUnitPrices(supabase, buildingIds);
    for (const u of units) {
      unitCountMap[u.building_id] = (unitCountMap[u.building_id] || 0) + 1;
      if (u.latest_rent != null) {
        const cur = minPriceMap[u.building_id];
        if (cur === undefined || u.latest_rent < cur) minPriceMap[u.building_id] = u.latest_rent;
      }
    }
  }

  // Stats
  const totalBuildings = buildings.length;
  const totalUnits = Object.values(unitCountMap).reduce((a, b) => a + b, 0);
  const allMinPrices = Object.values(minPriceMap);
  const cityMinPrice = allMinPrices.length ? Math.min(...allMinPrices) : null;

  // Sort buildings: most available units first, then alphabetical
  const sortedBuildings = [...buildings].sort((a, b) => {
    const ua = unitCountMap[a.id] || 0;
    const ub = unitCountMap[b.id] || 0;
    if (ub !== ua) return ub - ua;
    return a.name.localeCompare(b.name);
  });

  const heroImage = CITY_HERO_IMAGES[slug];
  const tagline = CITY_TAGLINES[slug] || `Luxury living in ${city.name}`;

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1">
        {/* Hero */}
        <div className="relative h-[420px] md:h-[520px] overflow-hidden">
          {heroImage ? (
            <Image
              src={heroImage}
              alt={`${city.name} skyline`}
              fill
              className="object-cover"
              priority
              sizes="100vw"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-muted" />
          )}
          {/* Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />

          <div className="absolute inset-0 flex flex-col justify-end pb-10 px-4">
            <div className="container mx-auto">
              <Breadcrumb
                items={[
                  { label: "Cities", href: "/cities" },
                  { label: city.name },
                ]}
                className="mb-4 text-white/70 [&_a]:text-white/70 [&_a:hover]:text-white"
              />
              <h1 className="text-4xl md:text-6xl font-bold text-white mb-2">
                {city.name}
              </h1>
              <p className="text-lg md:text-xl text-white/80 mb-6">{tagline}</p>

              {/* Stats row */}
              <div className="flex flex-wrap gap-4 mb-8">
                <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl px-4 py-2 text-white">
                  <span className="text-2xl font-bold">{totalBuildings}</span>
                  <span className="text-sm text-white/70 ml-1">Buildings</span>
                </div>
                <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl px-4 py-2 text-white">
                  <span className="text-2xl font-bold">{totalUnits}</span>
                  <span className="text-sm text-white/70 ml-1">Available Units</span>
                </div>
                {cityMinPrice && (
                  <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl px-4 py-2 text-white">
                    <span className="text-sm text-white/70">From </span>
                    <span className="text-2xl font-bold">{formatPrice(cityMinPrice)}</span>
                    <span className="text-sm text-white/70">/mo</span>
                  </div>
                )}
              </div>

              <Link href={`/search?city=${city.slug}`}>
                <Button size="lg" className="gap-2 text-base px-8">
                  <Search className="h-5 w-5" />
                  Search in {city.name}
                </Button>
              </Link>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-12 space-y-12">
          {/* City intro copy */}
          {CITY_COPY[slug] && (
            <section className="max-w-3xl">
              <h2 className="text-2xl font-bold mb-4">
                Luxury Apartments in {city.name}
              </h2>
              <div className="space-y-4">
                {CITY_COPY[slug].map((paragraph, i) => (
                  <p key={i} className="text-muted-foreground leading-relaxed">
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          )}

          {/* Neighborhoods */}
          {neighborhoods.length > 0 && (
            <section>
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                Neighborhoods
              </h2>
              <div className="flex flex-wrap gap-2">
                {neighborhoods.map((n) => (
                  <Link key={n.id} href={`/search?city=${city.slug}&neighborhood=${n.slug}`}>
                    <Badge
                      variant="outline"
                      className="px-3 py-1.5 text-sm cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                    >
                      {n.name}
                    </Badge>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Buildings Grid */}
          <section>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Star className="h-6 w-6 text-primary" />
                Featured Buildings
              </h2>
              <Link href={`/search?city=${city.slug}`} className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {sortedBuildings.length === 0 ? (
              <div className="rounded-xl border border-dashed p-12 text-center">
                <Building2 className="mx-auto h-12 w-12 text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground">No active listings in {city.name} yet.</p>
                <Link href="/search" className="mt-4 inline-block">
                  <Button variant="outline" size="sm">Browse all cities</Button>
                </Link>
              </div>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {sortedBuildings.map((building) => {
                  // Get best image
                  const images = (building.building_images || []) as Array<{
                    url: string;
                    is_primary: boolean;
                    sort_order: number;
                  }>;
                  const sortedImgs = [...images].sort((a, b) => {
                    if (a.is_primary && !b.is_primary) return -1;
                    if (!a.is_primary && b.is_primary) return 1;
                    return a.sort_order - b.sort_order;
                  });
                  const heroImg = sortedImgs[0]?.url || getBuildingFallbackImage(building.id, building.name).url;

                  const neighborhood = Array.isArray(building.neighborhoods)
                    ? building.neighborhoods[0]
                    : building.neighborhoods;

                  const availableUnits = unitCountMap[building.id] || 0;
                  const minPrice = minPriceMap[building.id];

                  return (
                    <Link key={building.id} href={`/buildings/${building.id}`}>
                      <Card className="overflow-hidden hover:shadow-lg transition-shadow group h-full">
                        {/* Image */}
                        <div className="relative h-52 overflow-hidden">
                          <Image
                            src={heroImg}
                            alt={building.name}
                            fill
                            className="object-cover group-hover:scale-105 transition-transform duration-500"
                            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                          />
                          {neighborhood && (
                            <Badge className="absolute top-3 left-3 bg-black/60 text-white border-0">
                              {(neighborhood as { name: string }).name}
                            </Badge>
                          )}
                          {availableUnits > 0 && (
                            <Badge className="absolute top-3 right-3 bg-green-600">
                              {availableUnits} available
                            </Badge>
                          )}
                        </div>

                        <CardContent className="p-4">
                          <h3 className="font-semibold text-base leading-tight mb-1">
                            {building.name}
                          </h3>
                          <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1">
                            <MapPin className="h-3 w-3 shrink-0" />
                            {building.address_1}
                            {building.zip && ` ${building.zip}`}
                          </p>
                          {building.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                              {building.description}
                            </p>
                          )}
                          <div className="flex items-center justify-between">
                            {minPrice ? (
                              <div>
                                <span className="text-xs text-muted-foreground">From </span>
                                <span className="font-semibold text-sm">{formatPrice(minPrice)}</span>
                                <span className="text-xs text-muted-foreground">/mo</span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">Contact for pricing</span>
                            )}
                            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          {/* Market Insight teaser */}
          {totalBuildings > 0 && (
            <section className="rounded-2xl border bg-muted/30 p-8">
              <div className="flex flex-col md:flex-row md:items-center gap-6">
                <div className="flex-1">
                  <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    {city.name} Market Snapshot
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4">
                    <div>
                      <p className="text-2xl font-bold">{totalBuildings}</p>
                      <p className="text-xs text-muted-foreground">Active buildings</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{totalUnits}</p>
                      <p className="text-xs text-muted-foreground">Open units</p>
                    </div>
                    {cityMinPrice && (
                      <div>
                        <p className="text-2xl font-bold">{formatPrice(cityMinPrice)}</p>
                        <p className="text-xs text-muted-foreground">Starting rent</p>
                      </div>
                    )}
                    {neighborhoods.length > 0 && (
                      <div>
                        <p className="text-2xl font-bold">{neighborhoods.length}</p>
                        <p className="text-xs text-muted-foreground">Neighborhoods</p>
                      </div>
                    )}
                  </div>
                </div>
                <Link href={`/search?city=${city.slug}`}>
                  <Button size="lg" className="gap-2 whitespace-nowrap">
                    <Search className="h-4 w-4" />
                    Find your apartment
                  </Button>
                </Link>
              </div>
            </section>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
