import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { fetchAvailableUnitPrices } from "@/lib/search/fetch-enrichments";
import { fetchAllRows } from "@/lib/db-helpers";
import { CITY_COPY } from "@/lib/seo/city-copy";
import { BuildingCard } from "@/components/listings/BuildingCard";
import {
  BreadcrumbJsonLd,
  BuildingItemListJsonLd,
} from "@/components/seo/JsonLd";
import { BED_FACETS, MIN_FACET_BUILDINGS, facetPath } from "@/lib/seo/facets";
import { buildingPath } from "@/lib/seo/urls";
import { formatPrice } from "@/lib/utils";
import { Building2, MapPin, Search, ArrowRight, TrendingUp } from "lucide-react";
import { HERO_CANDIDATES, heroImageUrl } from "@/lib/images/hero";

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

type NeighborhoodRef = { id: string; name: string; slug: string };

interface CityBuilding {
  id: string;
  name: string;
  address_1: string | null;
  zip: string | null;
  description: string | null;
  year_built: number | null;
  neighborhoods: NeighborhoodRef | NeighborhoodRef[] | null;
  building_images: Array<{ url: string; is_primary: boolean | null; sort_order: number | null }> | null;
}

interface CityPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: CityPageProps): Promise<Metadata> {
  const { slug } = await params;
  const supabase = createAdminClient();
  const { data: city } = await supabase
    .from("cities")
    .select("id, name, slug, state")
    .eq("slug", slug)
    .single();

  if (!city) return { title: "City Not Found - Staycio" };

  // A city with no listings is a thin page. Keep the URL reachable for anyone
  // holding a link, but keep it out of the index until it has inventory.
  const { count: listingCount } = await supabase
    .from("buildings")
    .select("id", { count: "exact", head: true })
    .eq("city_id", city.id)
    .eq("status", "active");

  // Title leads with the head term ("apartments for rent in <city>") rather
  // than the brand adjective; the count makes the snippet concrete.
  const title = `Apartments for Rent in ${city.name}, ${city.state}${
    listingCount ? ` — ${listingCount} Buildings` : ""
  } | Staycio`;
  const description = listingCount
    ? `Browse ${listingCount} apartment buildings for rent in ${city.name}, ${city.state}. Live availability, verified rents, floor plans, amenities and pet policies — updated daily on Staycio.`
    : `Apartments for rent in ${city.name}, ${city.state}. Live availability and verified rents on Staycio.`;

  return {
    robots: listingCount ? undefined : { index: false, follow: true },
    title,
    description,
    alternates: { canonical: `/cities/${slug}` },
    openGraph: {
      title,
      description,
      url: `/cities/${slug}`,
      type: "website",
      images: CITY_HERO_IMAGES[slug] ? [CITY_HERO_IMAGES[slug]] : [],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
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
  const [buildings, neighborhoodsRes] = await Promise.all([
    // Paged: the biggest cities have more than 1000 active buildings and the
    // unpaged select silently truncated the listing grid (and the stats).
    fetchAllRows<CityBuilding>((from, to) =>
      supabase
        .from("buildings")
        .select(`
          id, slug, name, address_1, zip, description, year_built,
          neighborhoods:neighborhood_id (id, name, slug),
          building_images!left (url, is_primary, sort_order)
        `)
        .eq("city_id", city.id)
        .eq("status", "active")
        .order("is_primary", { referencedTable: "building_images", ascending: false, nullsFirst: false })
        .order("sort_order", { referencedTable: "building_images" })
        .limit(HERO_CANDIDATES, { referencedTable: "building_images" })
        .order("name")
        .order("id")
        .range(from, to) as unknown as PromiseLike<{ data: CityBuilding[] | null; error: unknown }>
    ),
    supabase
      .from("neighborhoods")
      .select("id, name, slug")
      .eq("city_id", city.id)
      .order("name"),
  ]);

  const neighborhoods = neighborhoodsRes.data || [];

  // Get building IDs for unit + price queries
  const buildingIds = buildings.map((b) => b.id);

  // Fetch available unit counts and min prices per building
  const unitCountMap: Record<string, number> = {};
  const minPriceMap: Record<string, number> = {};

  // Buildings per bedroom facet, so the city page only links the facet pages
  // that have real inventory (an empty facet link is a crawl path to a thin
  // page, and a dead end for the visitor).
  const facetBuildingCounts: Record<string, number> = {};

  if (buildingIds.length > 0) {
    // One chunked + paged query on the price view: unit counts and minimum
    // rents per building without the giant `.in(unitIds)` URL that broke
    // past a few hundred units.
    const [units, availableUnits] = await Promise.all([
      fetchAvailableUnitPrices(supabase, buildingIds),
      fetchAllRows<{ building_id: string; beds: number | null }>((from, to) =>
        supabase
          .from("units")
          .select("building_id, beds")
          .in("building_id", buildingIds)
          .eq("is_available", true)
          .order("building_id")
          .range(from, to)
      ),
    ]);

    for (const u of units) {
      unitCountMap[u.building_id] = (unitCountMap[u.building_id] || 0) + 1;
      if (u.latest_rent != null) {
        const cur = minPriceMap[u.building_id];
        if (cur === undefined || u.latest_rent < cur) minPriceMap[u.building_id] = u.latest_rent;
      }
    }

    const perFacet = new Map<string, Set<string>>();
    for (const u of availableUnits) {
      const facet = BED_FACETS.find((f) => f.matches(u.beds));
      if (!facet) continue;
      const set = perFacet.get(facet.slug) || new Set<string>();
      set.add(u.building_id);
      perFacet.set(facet.slug, set);
    }
    for (const [facetSlug, set] of perFacet) facetBuildingCounts[facetSlug] = set.size;
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
      <BreadcrumbJsonLd
        items={[
          { name: "Cities", path: "/cities" },
          { name: `${city.name} Apartments` },
        ]}
      />
      {/* Marks the grid as a ranked list of distinct properties rather than
          one page of text — without it the city pages carried no schema at
          all beyond the site-wide WebSite node. Capped at 50: past that the
          node is large, and Google only reads the head of the list anyway. */}
      <BuildingItemListJsonLd
        name={`Apartments for rent in ${city.name}, ${city.state}`}
        buildings={sortedBuildings.slice(0, 20).map((b) => {
          const hero = heroImageUrl(b.building_images) ?? undefined;
          return {
            name: b.name,
            path: buildingPath(b),
            image: hero,
            cityName: city.name,
            address: b.address_1,
            minPrice: minPriceMap[b.id] ?? null,
          };
        })}
      />
      <Header />

      <main className="flex-1">
        {/* Hero — content flows (no fixed height), so a long city name or a
            wrapped stats row can never slide up under the fixed header. */}
        <div className="relative flex min-h-[440px] flex-col justify-end overflow-hidden md:min-h-[540px]">
          {heroImage ? (
            <Image
              src={heroImage}
              alt={`${city.name} skyline`}
              fill
              className="object-cover"
              preload
              fetchPriority="high"
              sizes="100vw"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-zinc-900 to-black" />
          )}
          {/* Scrim: a bottom-up fade for the text block plus a left-side wash,
              so white type stays legible over bright photos (Miami's neon). */}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/30" aria-hidden="true" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/25 to-transparent" aria-hidden="true" />

          <div className="relative mx-auto w-full max-w-7xl px-4 pb-10 pt-24 sm:px-6 md:pb-14">
            <Breadcrumb
              items={[
                { label: "Cities", href: "/cities" },
                { label: city.name },
              ]}
              className="mb-3 text-white/80 [&_a]:text-white/80 [&_a:hover]:text-white [&_svg]:text-white/60 [&>span>span]:text-white"
            />
            <h1 className="mb-2 text-4xl font-semibold tracking-tight text-white [text-shadow:0_2px_16px_rgba(0,0,0,0.45)] md:text-6xl">
              Apartments for Rent in {city.name}
            </h1>
            <p className="mb-6 text-lg text-white/85 md:text-xl">{tagline}</p>

            {/* Stats: three equal tiles on phones, inline pills from sm up */}
            <div className="mb-8 grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:gap-3">
              <div className="rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white backdrop-blur-md sm:px-4">
                <span className="block text-xl font-semibold sm:inline sm:text-2xl">{totalBuildings}</span>
                <span className="block text-xs text-white/70 sm:ml-1.5 sm:inline sm:text-sm">Buildings</span>
              </div>
              <div className="rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white backdrop-blur-md sm:px-4">
                <span className="block text-xl font-semibold sm:inline sm:text-2xl">{totalUnits}</span>
                <span className="block text-xs text-white/70 sm:ml-1.5 sm:inline sm:text-sm">Available units</span>
              </div>
              {cityMinPrice && (
                <div className="rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white backdrop-blur-md sm:px-4">
                  <span className="block text-xl font-semibold sm:inline sm:text-2xl">
                    {formatPrice(cityMinPrice)}
                  </span>
                  <span className="block text-xs text-white/70 sm:ml-1.5 sm:inline sm:text-sm">Starting rent</span>
                </div>
              )}
            </div>

            <Button asChild size="lg" className="w-full gap-2 px-8 text-base sm:w-auto">
              <Link href={`/search?city=${city.slug}`}>
                <Search className="h-5 w-5" aria-hidden="true" />
                Search in {city.name}
              </Link>
            </Button>
          </div>
        </div>

        <div className="mx-auto w-full max-w-7xl space-y-14 px-4 py-12 sm:px-6 md:py-16">
          {/* City intro copy. Suppressed when the city has nothing to show —
              prose about a market we have no listings for is worse than none. */}
          {CITY_COPY[slug] && totalBuildings > 0 && (
            <section className="max-w-3xl">
              <h2 className="text-2xl font-semibold text-white mb-4">
                Luxury Apartments in {city.name}
              </h2>
              <div className="space-y-4">
                {CITY_COPY[slug].map((paragraph, i) => (
                  <p key={i} className="text-white/60 leading-relaxed">
                    {paragraph.replace(/\{count\}/g, String(totalBuildings))}
                  </p>
                ))}
              </div>
            </section>
          )}

          {/* Neighborhoods */}
          {neighborhoods.length > 0 && (
            <section>
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <MapPin className="h-5 w-5 text-white/60" aria-hidden="true" />
                Neighborhoods
              </h2>
              <div className="flex flex-wrap gap-2">
                {neighborhoods.map((n) => (
                  // Points at the neighborhood PAGE, not /search. The chips
                  // used to link into the client-rendered search view, which
                  // left every neighborhood page orphaned — in the sitemap but
                  // with no crawlable link anywhere on the site.
                  <Link
                    key={n.id}
                    href={`/neighborhoods/${n.slug}?city=${city.slug}`}
                    className="inline-flex min-h-10 items-center rounded-full border border-white/[0.08] bg-white/[0.02] px-4 text-sm text-white/75 transition-colors hover:border-white/25 hover:bg-white/[0.05] hover:text-white"
                  >
                    {n.name} apartments
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Browse by layout — the internal links into the bedroom facet
              pages, which are what actually rank for "<n> bedroom apartments
              in <city>". Only rendered where inventory backs the facet. */}
          {BED_FACETS.some((f) => (facetBuildingCounts[f.slug] || 0) >= MIN_FACET_BUILDINGS) && (
            <section>
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <Building2 className="h-5 w-5 text-white/60" aria-hidden="true" />
                Browse {city.name} apartments by layout
              </h2>
              <div className="flex flex-wrap gap-2">
                {BED_FACETS.filter(
                  (f) => (facetBuildingCounts[f.slug] || 0) >= MIN_FACET_BUILDINGS
                ).map((f) => (
                  <Link
                    key={f.slug}
                    href={facetPath(city.slug, f.slug)}
                    className="inline-flex min-h-10 items-center rounded-full border border-white/[0.08] bg-white/[0.02] px-4 text-sm text-white/75 transition-colors hover:border-white/25 hover:bg-white/[0.05] hover:text-white"
                  >
                    {f.label} in {city.name}
                    <span className="ml-2 text-white/40">{facetBuildingCounts[f.slug]}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Buildings Grid */}
          <section>
            <div className="mb-6 flex items-end justify-between gap-4 md:mb-8">
              <h2 className="text-2xl font-semibold text-white md:text-3xl">
                {city.name} apartment buildings
              </h2>
              <Link
                href={`/search?city=${city.slug}`}
                className="inline-flex min-h-10 shrink-0 items-center gap-1.5 text-sm text-white/60 transition-colors hover:text-white"
              >
                View all <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>

            {sortedBuildings.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/[0.1] p-12 text-center">
                <Building2 className="mx-auto h-12 w-12 text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground">No active listings in {city.name} yet.</p>
                <Button asChild variant="outline" size="sm" className="mt-4">
                  <Link href="/cities">Browse all cities</Link>
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {sortedBuildings.map((building, index) => {
                  const heroImg = heroImageUrl(building.building_images);

                  const neighborhood = Array.isArray(building.neighborhoods)
                    ? building.neighborhoods[0]
                    : building.neighborhoods;

                  return (
                    <BuildingCard
                      key={building.id}
                      building={building}
                      heroImage={heroImg}
                      neighborhoodName={(neighborhood as { name: string } | null)?.name}
                      availableUnits={unitCountMap[building.id] || 0}
                      minPrice={minPriceMap[building.id] ?? null}
                      eager={index < 3}
                    />
                  );
                })}
              </div>
            )}
          </section>

          {/* Market snapshot: the stats sit in their own even grid (4 across
              from sm, 2x2 on phones) and the CTA gets its own row/column, so
              nothing wraps 3+1 beside the button. */}
          {totalBuildings > 0 && (
            <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 md:p-8">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
                <div className="min-w-0 flex-1">
                  <h2 className="flex items-center gap-2 text-xl font-semibold text-white">
                    <TrendingUp className="h-5 w-5 text-cyan-400" aria-hidden="true" />
                    {city.name} market snapshot
                  </h2>
                  <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
                    <div>
                      <dt className="text-sm text-white/50">Active buildings</dt>
                      <dd className="mt-1 text-2xl font-semibold text-white">{totalBuildings}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-white/50">Open units</dt>
                      <dd className="mt-1 text-2xl font-semibold text-white">{totalUnits}</dd>
                    </div>
                    {cityMinPrice && (
                      <div>
                        <dt className="text-sm text-white/50">Starting rent</dt>
                        <dd className="mt-1 text-2xl font-semibold text-white">{formatPrice(cityMinPrice)}</dd>
                      </div>
                    )}
                    {neighborhoods.length > 0 && (
                      <div>
                        <dt className="text-sm text-white/50">Neighborhoods</dt>
                        <dd className="mt-1 text-2xl font-semibold text-white">{neighborhoods.length}</dd>
                      </div>
                    )}
                  </dl>
                </div>
                <Button asChild size="lg" className="w-full shrink-0 gap-2 sm:w-auto">
                  <Link href={`/search?city=${city.slug}`}>
                    <Search className="h-4 w-4" aria-hidden="true" />
                    Find your apartment
                  </Link>
                </Button>
              </div>
            </section>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
