import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/db-helpers";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { BuildingCard } from "@/components/listings/BuildingCard";
import {
  BreadcrumbJsonLd,
  BuildingItemListJsonLd,
  FaqJsonLd,
} from "@/components/seo/JsonLd";
import { BED_FACETS, MIN_FACET_BUILDINGS, facetPath, findFacet } from "@/lib/seo/facets";
import { buildingPath } from "@/lib/seo/urls";
import { formatPrice } from "@/lib/utils";
import { ArrowRight, Building2 } from "lucide-react";
import { HERO_CANDIDATES, heroImageUrl, type RankableImage } from "@/lib/images/hero";

/**
 * /cities/<city>/<bedroom facet> — the server-rendered answer to the queries
 * the catalogue can actually satisfy ("2 bedroom apartments in Miami").
 *
 * /search owns these intents in the product but is a client component, so a
 * crawler gets an empty JS shell there. This route renders the same inventory
 * as HTML: real buildings, real rents, real internal links.
 */

export const revalidate = 3600;

export async function generateStaticParams() {
  return [];
}

interface FacetPageProps {
  params: Promise<{ slug: string; facet: string }>;
}

interface FacetBuilding {
  id: string;
  slug: string | null;
  name: string;
  address_1: string | null;
  zip: string | null;
  description: string | null;
  neighborhood_id: string | null;
  building_images: RankableImage[] | null;
}

/**
 * Buildings in `citySlug` that have at least one available unit matching the
 * facet, with per-building match counts and the cheapest matching rent.
 */
async function getFacetData(citySlug: string, facetSlug: string) {
  const facet = findFacet(facetSlug);
  if (!facet) return null;

  const supabase = createAdminClient();

  const { data: city } = await supabase
    .from("cities")
    .select("id, name, slug, state")
    .eq("slug", citySlug)
    .maybeSingle();

  if (!city) return null;

  const buildings = await fetchAllRows<FacetBuilding>((from, to) =>
    supabase
      .from("buildings")
      .select("id, slug, name, address_1, zip, description, neighborhood_id, building_images!left (url, is_primary, sort_order)")
      .eq("city_id", city.id)
      .eq("status", "active")
      // Embedded per building: the old flat building_images query for every
      // building in the city hit the 1000-row response cap in big cities and
      // silently dropped some buildings' photos.
      .order("is_primary", { referencedTable: "building_images", ascending: false, nullsFirst: false })
      .order("sort_order", { referencedTable: "building_images" })
      .limit(HERO_CANDIDATES, { referencedTable: "building_images" })
      .order("id")
      .range(from, to)
  );

  if (buildings.length === 0) {
    return { facet, city, buildings: [], matches: new Map(), images: new Map(), neighborhoods: new Map() };
  }

  const buildingIds = buildings.map((b) => b.id);

  const [units, neighborhoodRes] = await Promise.all([
    fetchAllRows<{ building_id: string; beds: number | null; id: string }>((from, to) =>
      supabase
        .from("units")
        .select("id, building_id, beds")
        .in("building_id", buildingIds)
        .eq("is_available", true)
        .order("id")
        .range(from, to)
    ),
    supabase.from("neighborhoods").select("id, name, slug").eq("city_id", city.id),
  ]);

  const matchingUnitIds: string[] = [];
  const matches = new Map<string, { count: number; unitIds: string[] }>();
  for (const u of units) {
    if (!facet.matches(u.beds)) continue;
    matchingUnitIds.push(u.id);
    const entry = matches.get(u.building_id) || { count: 0, unitIds: [] };
    entry.count += 1;
    entry.unitIds.push(u.id);
    matches.set(u.building_id, entry);
  }

  // Cheapest matching rent per building, from the live price view.
  const prices = new Map<string, number>();
  if (matchingUnitIds.length > 0) {
    const { fetchAvailableUnitPrices } = await import("@/lib/search/fetch-enrichments");
    const rows = await fetchAvailableUnitPrices(supabase, buildingIds);
    const matchSet = new Set(matchingUnitIds);
    for (const r of rows) {
      if (!matchSet.has(r.id) || r.latest_rent == null) continue;
      const cur = prices.get(r.building_id);
      if (cur === undefined || r.latest_rent < cur) prices.set(r.building_id, r.latest_rent);
    }
  }

  const images = new Map<string, string>();
  for (const b of buildings) {
    const hero = heroImageUrl(b.building_images);
    if (hero) images.set(b.id, hero);
  }

  const neighborhoods = new Map(
    (neighborhoodRes.data || []).map((n) => [n.id, n as { id: string; name: string; slug: string }])
  );

  return { facet, city, buildings, matches, prices, images, neighborhoods };
}

export async function generateMetadata({ params }: FacetPageProps): Promise<Metadata> {
  const { slug, facet: facetSlug } = await params;
  const data = await getFacetData(slug, facetSlug);

  if (!data) return { title: "Not Found - Staycio", robots: { index: false, follow: false } };

  const { facet, city, matches, prices } = data;
  const matchingBuildings = [...matches.keys()].length;
  const minPrice = prices && prices.size ? Math.min(...prices.values()) : null;

  const title = `${facet.label} for Rent in ${city.name}, ${city.state} | Staycio`;
  const description = matchingBuildings
    ? `${matchingBuildings} building${matchingBuildings === 1 ? "" : "s"} in ${city.name} with ${facet.label.toLowerCase()} available now${
        minPrice ? `, starting at ${formatPrice(minPrice)}/month` : ""
      }. Verified rents, floor plans and availability on Staycio.`
    : `${facet.label} in ${city.name}. Browse verified rents, floor plans and live availability on Staycio.`;

  return {
    title,
    description,
    // A facet with almost nothing behind it is a thin page — keep it reachable
    // for a visitor who filters into it, keep it out of the index.
    robots:
      matchingBuildings >= MIN_FACET_BUILDINGS ? undefined : { index: false, follow: true },
    alternates: { canonical: facetPath(city.slug, facet.slug) },
    openGraph: { title, description, url: facetPath(city.slug, facet.slug), type: "website" },
  };
}

export default async function FacetPage({ params }: FacetPageProps) {
  const { slug, facet: facetSlug } = await params;
  const data = await getFacetData(slug, facetSlug);

  if (!data) notFound();

  const { facet, city, buildings, matches, prices, images, neighborhoods } = data;

  const listed = buildings
    .filter((b) => (matches.get(b.id)?.count || 0) > 0)
    .sort((a, b) => {
      const ca = matches.get(a.id)?.count || 0;
      const cb = matches.get(b.id)?.count || 0;
      if (cb !== ca) return cb - ca;
      return a.name.localeCompare(b.name);
    });

  const totalUnits = listed.reduce((sum, b) => sum + (matches.get(b.id)?.count || 0), 0);
  const priceValues = [...(prices?.values() || [])];
  const minPrice = priceValues.length ? Math.min(...priceValues) : null;
  const maxPrice = priceValues.length ? Math.max(...priceValues) : null;

  const heading = `${facet.label} for Rent in ${city.name}`;

  const faqs = [
    ...(minPrice
      ? [
          {
            question: `How much is a ${facet.shortLabel.toLowerCase()} apartment in ${city.name}?`,
            answer: `${facet.label} currently listed in ${city.name} start at ${formatPrice(
              minPrice
            )} per month${
              maxPrice && maxPrice !== minPrice
                ? `, with building starting rents reaching ${formatPrice(maxPrice)}`
                : ""
            }. Staycio verifies these rents against each building's live availability.`,
          },
        ]
      : []),
    {
      question: `How many ${facet.label.toLowerCase()} are available in ${city.name}?`,
      answer: `Staycio is tracking ${totalUnits} available ${facet.label.toLowerCase().replace(
        " apartments",
        ""
      )} unit${totalUnits === 1 ? "" : "s"} across ${listed.length} building${
        listed.length === 1 ? "" : "s"
      } in ${city.name} right now.`,
    },
  ];

  const otherFacets = BED_FACETS.filter((f) => f.slug !== facet.slug);

  return (
    <div className="flex min-h-screen flex-col">
      <BreadcrumbJsonLd
        items={[
          { name: "Cities", path: "/cities" },
          { name: `${city.name} Apartments`, path: `/cities/${city.slug}` },
          { name: heading },
        ]}
      />
      <BuildingItemListJsonLd
        name={heading}
        buildings={listed.slice(0, 20).map((b) => ({
          name: b.name,
          path: buildingPath(b),
          image: images.get(b.id),
          cityName: city.name,
          address: b.address_1,
          minPrice: prices?.get(b.id) ?? null,
        }))}
      />
      <FaqJsonLd items={faqs} />

      <Header />

      <main className="flex-1">
        <div className="mx-auto w-full max-w-7xl px-4 pt-20 pb-16 sm:px-6 md:pt-24">
          <Breadcrumb
            items={[
              { label: "Cities", href: "/cities" },
              { label: city.name, href: `/cities/${city.slug}` },
              { label: facet.label },
            ]}
            className="mb-6"
          />

          <h1 className="text-3xl md:text-5xl font-semibold tracking-tight text-white mb-3">{heading}</h1>

          <p className="text-white/60 text-base md:text-lg max-w-3xl mb-6">
            {listed.length > 0 ? (
              <>
                {totalUnits} available {facet.label.toLowerCase().replace(" apartments", "")} unit
                {totalUnits === 1 ? "" : "s"} across {listed.length} building
                {listed.length === 1 ? "" : "s"} in {city.name}, {city.state}
                {minPrice ? `, starting at ${formatPrice(minPrice)} per month` : ""}. Every rent
                below is pulled from the building&apos;s own availability, not a stale listing feed.
              </>
            ) : (
              <>
                No {facet.label.toLowerCase()} are listed as available in {city.name} right now.
                Availability turns over constantly — browse every {city.name} building below, or ask
                Stacy to watch for the layout you want.
              </>
            )}
          </p>

          {/* Sibling facets: the lateral links that let a crawler reach every
              layout in the city from any one of them. */}
          {/* One swipeable row on phones (stacked, these ate a whole screen);
              wraps normally from sm up. */}
          <nav
            aria-label="Other layouts"
            className="-mx-4 mb-10 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden [&>a]:shrink-0 [&>a]:whitespace-nowrap"
          >
            {otherFacets.map((f) => (
              <Link
                key={f.slug}
                href={facetPath(city.slug, f.slug)}
                className="inline-flex min-h-10 items-center rounded-full border border-white/[0.08] bg-white/[0.02] px-4 text-sm text-white/70 transition-colors hover:border-white/25 hover:bg-white/[0.05] hover:text-white"
              >
                {f.label} in {city.name}
              </Link>
            ))}
            <Link
              href={`/cities/${city.slug}`}
              className="inline-flex min-h-10 items-center rounded-full border border-white/[0.08] bg-white/[0.02] px-4 text-sm text-white/70 transition-colors hover:border-white/25 hover:bg-white/[0.05] hover:text-white"
            >
              All {city.name} apartments
            </Link>
          </nav>

          {listed.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/[0.1] p-12 text-center">
              <Building2 className="mx-auto h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground mb-4">
                Nothing matching {facet.label.toLowerCase()} in {city.name} at the moment.
              </p>
              <Link
                href={`/cities/${city.slug}`}
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                Browse all {city.name} buildings <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-semibold text-white mb-6">
                Buildings with {facet.label.toLowerCase()} in {city.name}
              </h2>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {listed.map((b, index) => {
                  const count = matches.get(b.id)?.count || 0;
                  const neighborhood = b.neighborhood_id
                    ? neighborhoods.get(b.neighborhood_id)
                    : null;
                  return (
                    <BuildingCard
                      key={b.id}
                      building={b}
                      heroImage={images.get(b.id)}
                      neighborhoodName={neighborhood?.name}
                      availableUnits={count}
                      minPrice={prices?.get(b.id) ?? null}
                      // "12 2-bedroom units available", "3 studio units available"
                      detailLine={`${count} ${facet.shortLabel
                        .toLowerCase()
                        .replace(/s$/, "")
                        .replace(" bedroom", "-bedroom")} ${
                        count === 1 ? "unit" : "units"
                      } available${b.description ? ` · ${b.description}` : ""}`}
                      eager={index < 3}
                    />
                  );
                })}
              </div>
            </>
          )}

          {faqs.length > 0 && (
            <section className="mt-16 max-w-3xl">
              <h2 className="text-2xl font-semibold text-white mb-6">
                {facet.label} in {city.name}: common questions
              </h2>
              <div className="space-y-6">
                {faqs.map((f) => (
                  <div key={f.question}>
                    <h3 className="font-medium text-white mb-1">{f.question}</h3>
                    <p className="text-white/60 leading-relaxed">{f.answer}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
