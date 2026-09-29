import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { fetchAvailableUnitPrices } from "@/lib/search/fetch-enrichments";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { SafeImage } from "@/components/ui/SafeImage";
import {
  MapPin,
  Building2,
  Home,
  DollarSign,
  ArrowRight,
  Bed,
  TrendingUp,
} from "lucide-react";
import { formatPrice } from "@/lib/utils";
import {
  BreadcrumbJsonLd,
  BuildingItemListJsonLd,
} from "@/components/seo/JsonLd";
import { buildingPath } from "@/lib/seo/urls";
import { MICROSITE_GUIDES } from "@/lib/microsites";
import { HERO_CANDIDATES, heroImageUrl } from "@/lib/images/hero";

// Shared by /neighborhoods/[slug] and the internal /neighborhoods/[slug]/in/[city]
// route that `?city=` is rewritten to (next.config.ts). Reading searchParams
// made every neighborhood page render per request — revalidate never applied —
// so the city now arrives as a path param and both routes are ISR-cached.

export async function neighborhoodMetadata(
  slug: string,
  citySlugParam?: string
): Promise<Metadata> {
  const supabase = createAdminClient();

  const { data: matches } = await supabase
    .from("neighborhoods")
    .select(`id, name, description, cities:city_id (name, slug, state)`)
    .eq("slug", slug)
    .order("name");

  if (!matches || matches.length === 0) {
    return { title: "Neighborhood Not Found - Staycio" };
  }

  type CityMeta = { name: string; slug: string; state: string };
  const cityOf = (n: (typeof matches)[number]): CityMeta | null => {
    const c = n.cities as CityMeta | CityMeta[] | null;
    return Array.isArray(c) ? c[0] ?? null : c;
  };

  const neighborhood =
    (citySlugParam && matches.find((n) => cityOf(n)?.slug === citySlugParam)) || matches[0];
  const city = cityOf(neighborhood);

  const { count: listingCount } = await supabase
    .from("buildings")
    .select("id", { count: "exact", head: true })
    .eq("neighborhood_id", neighborhood.id)
    .eq("status", "active");

  const title = city
    ? `Apartments for Rent in ${neighborhood.name}, ${city.name}${
        listingCount ? ` — ${listingCount} Buildings` : ""
      } | Staycio`
    : `${neighborhood.name} Apartments for Rent | Staycio`;
  const description =
    neighborhood.description ||
    (listingCount
      ? `${listingCount} apartment building${listingCount === 1 ? "" : "s"} for rent in ${
          neighborhood.name
        }${city ? `, ${city.name}` : ""}. Live availability, verified rents, floor plans and amenities on Staycio.`
      : `Apartments for rent in ${neighborhood.name}${city ? `, ${city.name}` : ""} — verified pricing, amenities, and availability on Staycio.`);

  // "midtown" is a neighborhood in NYC, Miami AND Atlanta. All three pages
  // claimed the same bare canonical, so two of them were dropped as duplicates
  // of a page showing someone else's buildings. Qualify the canonical with
  // ?city= whenever the slug is shared.
  const ambiguous = matches.length > 1;
  const canonical =
    ambiguous && city ? `/neighborhoods/${slug}?city=${city.slug}` : `/neighborhoods/${slug}`;

  return {
    title,
    description,
    // Matches the city page: a neighborhood with no listings stays reachable
    // but out of the index until it has inventory.
    robots: listingCount ? undefined : { index: false, follow: true },
    alternates: { canonical },
    openGraph: { title, description, url: canonical, type: "website" },
    twitter: { card: "summary", title, description },
  };
}

export async function NeighborhoodView({
  slug,
  citySlugParam,
}: {
  slug: string;
  citySlugParam?: string;
}) {
  const supabase = createAdminClient();

  // Neighborhood slugs are NOT globally unique ("midtown" exists in NYC,
  // Miami, and Atlanta) — .single() errored on shared slugs and 404'd the
  // page. Fetch all matches and disambiguate via ?city=, else first match.
  const { data: matches, error } = await supabase
    .from("neighborhoods")
    .select(`
      id,
      name,
      slug,
      description,
      cities:city_id (id, name, slug, state)
    `)
    .eq("slug", slug)
    .order("name");

  if (error || !matches || matches.length === 0) {
    notFound();
  }

  type CityInfo = { id: string; name: string; slug: string; state: string };
  const cityOf = (n: (typeof matches)[number]): CityInfo | null => {
    const c = n.cities as CityInfo | CityInfo[] | null;
    return Array.isArray(c) ? c[0] ?? null : c;
  };

  const neighborhood =
    (citySlugParam && matches.find((n) => cityOf(n)?.slug === citySlugParam)) || matches[0];
  const city = cityOf(neighborhood);

  // ?city=<somewhere this neighborhood isn't> used to serve another city's
  // neighborhood at a 200 — a soft duplicate of the real page. Send it to the
  // page it actually resolved to instead of serving it under a foreign URL.
  if (citySlugParam && city && citySlugParam !== city.slug) {
    permanentRedirect(
      matches.length > 1 ? `/neighborhoods/${slug}?city=${city.slug}` : `/neighborhoods/${slug}`
    );
  }

  // Get buildings in this neighborhood
  const { data: buildings } = await supabase
    .from("buildings")
    .select(`
      id,
      slug,
      name,
      address_1,
      zip,
      description,
      year_built,
      stories,
      building_images!left (url, is_primary, sort_order)
    `)
    .eq("neighborhood_id", neighborhood.id)
    .eq("status", "active")
    .order("is_primary", { referencedTable: "building_images", ascending: false, nullsFirst: false })
    .order("sort_order", { referencedTable: "building_images" })
    .limit(HERO_CANDIDATES, { referencedTable: "building_images" })
    .order("name");

  const buildingIds = buildings?.map((b) => b.id) || [];

  // Available units with their latest rent — chunked by building and paged,
  // instead of a second query with every unit id in the URL (400s past a
  // few hundred units, so busy neighborhoods showed no prices)
  const units = await fetchAvailableUnitPrices<{
    id: string;
    building_id: string;
    latest_rent: number | null;
    beds: number | null;
    baths: number | null;
    sqft: number | null;
  }>(supabase, buildingIds, ["beds", "baths", "sqft"]);

  // Get price stats
  let priceStats = { min: 0, max: 0, avg: 0 };
  const priceByBuilding: Record<string, { min: number; count: number }> = {};

  if (units.length > 0) {
    const latestPrices: Record<string, number> = {};
    for (const u of units) {
      if (u.latest_rent != null) latestPrices[u.id] = u.latest_rent;
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

  // Available units per building (priced or not) and each building's photo
  const availableByBuilding: Record<string, number> = {};
  for (const u of units) {
    availableByBuilding[u.building_id] = (availableByBuilding[u.building_id] || 0) + 1;
  }

  // Buildings you can actually rent first: priced ones by most availability,
  // then cheapest; "Contact for pricing" buildings last (they led the list
  // before, purely because it was alphabetical).
  const sortedBuildings = [...(buildings || [])].sort((a, b) => {
    const pa = priceByBuilding[a.id];
    const pb = priceByBuilding[b.id];
    if (!!pa !== !!pb) return pa ? -1 : 1;
    const ua = availableByBuilding[a.id] || 0;
    const ub = availableByBuilding[b.id] || 0;
    if (ub !== ua) return ub - ua;
    if (pa && pb && pa.min !== pb.min) return pa.min - pb.min;
    return a.name.localeCompare(b.name);
  });

  // Get bed distribution
  const bedCounts: Record<number, number> = {};
  for (const unit of units || []) {
    const beds = unit.beds ?? 0;
    bedCounts[beds] = (bedCounts[beds] || 0) + 1;
  }

  // Staycio's own single-building guide sites for this neighborhood. Miami
  // only: "downtown" is also a slug in LA, Dallas and Nashville.
  const guides =
    city?.slug === "miami"
      ? MICROSITE_GUIDES.filter((g) => g.neighborhood === neighborhood.slug)
      : [];

  // Generate description if not exists
  const description = neighborhood.description || `${neighborhood.name} is one of ${city?.name || "the city"}'s most desirable neighborhoods for luxury apartment living. With ${buildings?.length || 0} luxury buildings, ${neighborhood.name} offers a variety of modern apartments with premium amenities.`;

  return (
    <div className="flex min-h-screen flex-col">
      <BreadcrumbJsonLd
        items={[
          { name: "Neighborhoods", path: "/neighborhoods" },
          ...(city ? [{ name: `${city.name} Apartments`, path: `/cities/${city.slug}` }] : []),
          { name: `${neighborhood.name} Apartments` },
        ]}
      />
      <BuildingItemListJsonLd
        name={`Apartments for rent in ${neighborhood.name}${city ? `, ${city.name}` : ""}`}
        buildings={sortedBuildings.slice(0, 20).map((b) => ({
          name: b.name,
          path: buildingPath(b),
          image: heroImageUrl(b.building_images) ?? undefined,
          cityName: city?.name,
          address: b.address_1,
          minPrice: priceByBuilding[b.id]?.min ?? null,
        }))}
      />
      <Header />

      <main className="flex-1 pt-16">
        {/* Hero — same container as the body below, so the stats row and the
            building list share one left edge (and the header's). */}
        <div className="bg-gradient-to-b from-zinc-900 to-black pt-6 pb-10 md:pt-10 md:pb-12">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
            <Breadcrumb
              items={[
                { label: "Neighborhoods", href: "/neighborhoods" },
                ...(city ? [{ label: city.name, href: `/cities/${city.slug}` }] : []),
                { label: neighborhood.name },
              ]}
              className="mb-4"
            />

            <div className="flex items-start justify-between gap-8">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <Badge variant="secondary" className="text-sm">
                    <MapPin className="h-3 w-3 mr-1" />
                    {city?.name}, {city?.state}
                  </Badge>
                </div>
                <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-white mb-4">
                  Apartments for Rent in {neighborhood.name}
                </h1>
                <p className="text-base md:text-lg text-zinc-400 max-w-3xl">
                  {description}
                </p>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mt-8 md:mt-10">
              <Card className="rounded-2xl bg-white/[0.02] border-white/[0.08]">
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

              <Card className="rounded-2xl bg-white/[0.02] border-white/[0.08]">
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

              <Card className="rounded-2xl bg-white/[0.02] border-white/[0.08]">
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

              <Card className="rounded-2xl bg-white/[0.02] border-white/[0.08]">
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

        <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 md:py-12">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            {/* Buildings List */}
            <div className="lg:col-span-2">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-2xl font-semibold text-white">
                  Apartment buildings in {neighborhood.name}
                  {city ? `, ${city.name}` : ""}
                </h2>
                <Button asChild variant="outline" size="sm" className="h-10 shrink-0 self-start px-4 text-sm sm:self-auto">
                  <Link href={`/search?city=${city?.slug}&neighborhood=${neighborhood.slug}`}>
                    View all listings
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
              </div>

              {sortedBuildings.length > 0 ? (
                <div className="space-y-3">
                  {sortedBuildings.map((building, index) => {
                    const buildingPrice = priceByBuilding[building.id];
                    const available = availableByBuilding[building.id] || 0;
                    const photo = heroImageUrl(building.building_images);
                    return (
                      <Link
                        key={building.id}
                        href={buildingPath(building)}
                        className="group flex gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3 transition-colors hover:border-white/[0.18] hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                      >
                        <div className="relative h-24 w-28 shrink-0 overflow-hidden rounded-xl bg-white/[0.03] sm:h-28 sm:w-40">
                          {photo ? (
                            <SafeImage
                              src={photo}
                              alt={`${building.name} in ${neighborhood.name}`}
                              fill
                              className="object-cover transition-transform duration-500 group-hover:scale-105"
                              sizes="(max-width: 640px) 112px, 160px"
                              loading={index < 3 ? "eager" : undefined}
                            />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
                              <Building2 className="h-8 w-8 text-white/20" strokeWidth={1.25} />
                            </div>
                          )}
                        </div>

                        <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                          <div className="min-w-0">
                            <h3 className="text-base font-medium leading-tight text-white sm:text-lg">
                              {building.name}
                            </h3>
                            {building.address_1 && (
                              <p className="mt-1 flex items-center gap-1 text-sm text-white/60">
                                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                <span className="truncate">{building.address_1}</span>
                              </p>
                            )}
                            {(building.year_built || building.stories) && (
                              <p className="mt-1 hidden text-sm text-white/45 sm:block">
                                {[
                                  building.year_built ? `Built ${building.year_built}` : null,
                                  building.stories ? `${building.stories} stories` : null,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                            )}
                          </div>
                          <div className="shrink-0 sm:text-right">
                            {buildingPrice ? (
                              <>
                                <p className="text-sm text-white/70 sm:text-base">
                                  From{" "}
                                  <span className="font-semibold text-white">
                                    {formatPrice(buildingPrice.min)}
                                  </span>
                                  /mo
                                </p>
                                {available > 0 && (
                                  <p className="text-sm text-emerald-300">
                                    {available} {available === 1 ? "unit" : "units"} available
                                  </p>
                                )}
                              </>
                            ) : (
                              <p className="text-sm text-white/50 sm:text-base">Contact for pricing</p>
                            )}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <Card className="rounded-2xl">
                  <CardContent className="py-12 text-center">
                    <Building2 className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                    <p className="text-muted-foreground">
                      No buildings currently available in this neighborhood.
                    </p>
                    <Button asChild className="mt-4">
                      <Link href="/search">Browse all apartments</Link>
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Unit Types */}
              {Object.keys(bedCounts).length > 0 && (
                <Card className="rounded-2xl">
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
                <Card className="rounded-2xl">
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

              {/* Building guides — the microsites for buildings in this neighborhood */}
              {guides.length > 0 && (
                <Card className="rounded-2xl">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Building guides
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    <p className="text-xs text-muted-foreground mb-3">
                      Our own pages on new and notable {neighborhood.name} rentals — waitlists
                      for buildings not yet open, live availability for those that are.
                    </p>
                    {guides.map((g) => (
                      <a
                        key={g.domain}
                        href={`https://${g.domain}/?utm_source=staycio&utm_medium=neighborhood`}
                        className="flex min-h-11 items-center justify-between gap-3 py-2 border-b last:border-0 hover:text-white transition-colors"
                      >
                        <span className="text-sm font-medium">{g.name}</span>
                        <span className="text-xs text-muted-foreground">{g.blurb}</span>
                      </a>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Search CTA */}
              <Card className="rounded-2xl bg-white/[0.04] border-white/[0.1]">
                <CardContent className="p-6 text-center">
                  <h3 className="font-semibold mb-2">
                    Find Your Perfect Apartment
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Search all available units in {neighborhood.name}
                  </p>
                  <Button asChild className="w-full">
                    <Link href={`/search?city=${city?.slug}&neighborhood=${neighborhood.slug}`}>
                      Search {neighborhood.name}
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </Button>
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
