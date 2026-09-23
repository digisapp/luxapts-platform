import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/db-helpers";
import {
  fetchAvailableUnitPrices,
  chunk,
  IN_CHUNK_SIZE,
} from "@/lib/search/fetch-enrichments";
import { ListingPlaceholder } from "@/components/ui/ListingPlaceholder";
import { isJunkImageUrl } from "@/lib/images/quality";
import { buildingPath, buildingUrl, isUuid } from "@/lib/seo/urls";
import { buildSummary } from "@/lib/seo/building-summary";

// Revalidate every hour instead of force-dynamic — reduces DB load ~90%
export const revalidate = 3600;

// Empty array = no build-time pages, but this opts the route into on-demand
// static generation + ISR. Without generateStaticParams, a dynamic-param
// route builds fully dynamic under Next 16 (no-store, CDN MISS every hit).
export async function generateStaticParams() {
  return [];
}

// Deduplicate the building fetch between generateMetadata and the page.
//
// The route param is the SEO slug ("maple-terrace"), but every link shared
// before migration 026 — emails, the 65 stored leads, anything Google already
// crawled — carries the UUID, so both still resolve here and the page 301s the
// UUID form to the slug.
const getBuilding = cache(async (idOrSlug: string) => {
  const supabase = createAdminClient();
  const select = `
      *,
      cities:city_id (id, name, slug, state),
      neighborhoods:neighborhood_id (id, name, slug)
    `;

  const column = isUuid(idOrSlug) ? "id" : "slug";
  const { data, error } = await supabase
    .from("buildings")
    .select(select)
    .eq(column, idOrSlug)
    // Deactivated buildings (fabricated seeds, merged duplicates) still carry
    // "available" units; they must 404, not render as live listings.
    .eq("status", "active")
    .maybeSingle();

  return { data, error };
});

// Whether anything is listed right now; decides indexability (see generateMetadata)
const getAvailableUnitCount = cache(async (id: string) => {
  const supabase = createAdminClient();
  const { count } = await supabase
    .from("units")
    .select("id", { count: "exact", head: true })
    .eq("building_id", id)
    .eq("is_available", true);
  return count ?? 0;
});

// Primary building image for social shares (deduplicated across renders)
const getPrimaryBuildingImage = cache(async (id: string) => {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("building_images")
    .select("url")
    .eq("building_id", id)
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.url ?? null;
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const { data: building } = await getBuilding(id);

  if (!building) {
    return { title: "Building Not Found - Staycio", robots: { index: false, follow: false } };
  }

  const [ogImage, availableUnits] = await Promise.all([
    getPrimaryBuildingImage(building.id),
    getAvailableUnitCount(building.id),
  ]);
  const city = Array.isArray(building.cities) ? building.cities[0] : building.cities;
  const neighborhood = Array.isArray(building.neighborhoods)
    ? building.neighborhoods[0]
    : building.neighborhoods;

  const place = city?.name
    ? `${neighborhood?.name ? `${neighborhood.name}, ` : ""}${city.name}${city.state ? `, ${city.state}` : ""}`
    : "";

  // Title leads with the query people actually type ("<name> apartments") and
  // keeps the location inside the ~60 chars Google renders.
  const title = `${building.name} Apartments${place ? ` — ${place}` : ""} | Staycio`;

  // Description carries the two facts that decide the click: what it costs and
  // whether anything is open. Falls back to the static line when neither is
  // known rather than emitting an empty snippet.
  const description = `${building.name} in ${place || "the city"}: see live rents, available floor plans, amenities, pet and parking policies${
    building.year_built ? `. Built ${building.year_built}` : ""
  }. Verified pricing on Staycio.`;

  const canonical = buildingPath(building);

  return {
    title,
    description,
    // Same rule as city and neighborhood pages: a building with nothing listed
    // is a thin "No units currently available" page. Keep it reachable but out
    // of the index (and the sitemap) until it has inventory again.
    robots: availableUnits > 0 ? undefined : { index: false, follow: true },
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "website",
      ...(ogImage ? { images: [ogImage] } : {}),
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  };
}
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPrice, formatDate } from "@/lib/utils";
import {
  MapPin,
  Phone,
  Mail,
  Globe,
  Building2,
  Bed,
  Bath,
  Square,
  Calendar,
  PawPrint,
  Car,
  Layout,
  ImageIcon,
  BadgeCheck,
  Footprints,
} from "lucide-react";
import { ImageGallery } from "./ImageGallery";
import { BuildingPageClient } from "./BuildingPageClient";
import { BuildingContactButtons } from "./BuildingContactButtons";
import { FavoriteButton } from "@/components/listings/FavoriteButton";
import { StickyMobileCTA } from "@/components/ui/StickyMobileCTA";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import {
  ApartmentComplexJsonLd,
  BreadcrumbJsonLd,
  FaqJsonLd,
  UnitOffersJsonLd,
} from "@/components/seo/JsonLd";

// Freshness check for the pricing-verified badge (page regenerates hourly via ISR)
function isWithinDays(isoDate: string, days: number): boolean {
  return Date.now() - new Date(isoDate).getTime() < days * 24 * 60 * 60 * 1000;
}

// Module-scope so the impure Date.now() call stays out of server-component
// render (react-hooks/purity), same as isWithinDays above.
function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

// Window covered by the price-history chart
const PRICE_HISTORY_DAYS = 30;

interface BuildingPageProps {
  params: Promise<{ id: string }>;
}

interface UnitImage {
  id: string;
  unit_id: string;
  url: string;
  alt_text: string | null;
  category: string | null;
  is_primary: boolean;
  sort_order: number;
}

interface UnitPriceRow {
  id: string;
  building_id: string;
  latest_rent: number | null;
  price_captured_at: string | null;
}

interface PriceSnapshotRow {
  rent: number;
  captured_at: string;
}

interface Floorplan {
  id: string;
  name: string;
  beds: number;
  baths: number;
  sqft_min: number | null;
  sqft_max: number | null;
  layout_image_url: string | null;
}

export default async function BuildingPage({ params }: BuildingPageProps) {
  const { id: idOrSlug } = await params;
  const supabase = createAdminClient();

  // Reuse cached building fetch (shared with generateMetadata — no duplicate query)
  const { data: building, error } = await getBuilding(idOrSlug);

  if (error || !building) {
    notFound();
  }

  // One building, one indexable URL: a UUID request 301s to the slug so link
  // equity from anything already crawled or emailed lands on the canonical.
  if (building.slug && idOrSlug !== building.slug) {
    permanentRedirect(buildingPath(building));
  }

  // Every scoped query below keys off the real row id, never the route param
  // (which may be a slug).
  const id = building.id;

  // Phase 1: building-scoped queries (independent of each other)
  const [amenitiesRes, factsRes, buildingImagesRes, unitsRes] = await Promise.all([
    supabase
      .from("building_amenities")
      .select("details, amenities(id, name, category, icon)")
      .eq("building_id", id),
    supabase.from("building_facts").select("key, value").eq("building_id", id),
    supabase
      .from("building_images")
      .select("url, alt_text, category")
      .eq("building_id", id)
      .order("is_primary", { ascending: false })
      .order("sort_order", { ascending: true }),
    supabase
      .from("units")
      .select("id, unit_number, beds, baths, sqft, available_on, floorplan_id")
      .eq("building_id", id)
      .eq("is_available", true)
      .order("beds", { ascending: true }),
  ]);

  const amenities = amenitiesRes.data;
  const buildingImages = buildingImagesRes.data;
  const units = unitsRes.data;

  const buildingFacts: Record<string, string | number> = {};
  for (const fact of factsRes.data || []) {
    buildingFacts[fact.key] = fact.value as string | number;
  }

  // Get unit IDs for fetching related data
  const unitIds = units?.map((u) => u.id) || [];
  const floorplanIds = [...new Set(units?.map(u => u.floorplan_id).filter(Boolean) || [])];

  const emptyRes = Promise.resolve({ data: null });

  // Snapshots older than this are ignored by the price chart
  const historyCutoff = daysAgoIso(PRICE_HISTORY_DAYS);

  // Phase 2: unit-scoped queries (all depend only on phase-1 results)
  const [unitPriceRows, historyRows, unitImageRows, floorplansRes, debriefRes] =
    await Promise.all([
      // Latest price per available unit, chunked by building and paged. A
      // single `.in("unit_id", unitIds)` put every unit id in the request URL,
      // which PostgREST rejects past ~150 — large buildings rendered every
      // unit as "Contact for pricing".
      fetchAvailableUnitPrices<UnitPriceRow>(supabase, [id], ["price_captured_at"]),
      // Recent history for the price chart, bounded by DATE rather than by
      // row count: the old `.limit(90)` took the 90 newest rows across ALL
      // units, so on a building with more than a handful of units the whole
      // chart covered a day or two and its earliest point was noise.
      unitIds.length
        ? Promise.all(
            chunk(unitIds, IN_CHUNK_SIZE).map((ids) =>
              fetchAllRows<PriceSnapshotRow>((from, to) =>
                supabase
                  .from("unit_price_snapshots")
                  .select("rent, captured_at")
                  .in("unit_id", ids)
                  .gte("captured_at", historyCutoff)
                  .order("captured_at", { ascending: false })
                  .order("id")
                  .range(from, to)
              )
            )
          ).then((pages) => pages.flat())
        : Promise.resolve<PriceSnapshotRow[]>([]),
      // Same chunking for unit photos — unpaged, large buildings showed none.
      unitIds.length
        ? Promise.all(
            chunk(unitIds, IN_CHUNK_SIZE).map((ids) =>
              fetchAllRows<UnitImage>((from, to) =>
                supabase
                  .from("unit_images")
                  .select("id, unit_id, url, alt_text, category, is_primary, sort_order")
                  .in("unit_id", ids)
                  .order("unit_id")
                  .order("is_primary", { ascending: false })
                  .order("sort_order", { ascending: true })
                  .order("id")
                  .range(from, to)
              )
            )
          ).then((pages) => pages.flat())
        : Promise.resolve<UnitImage[]>([]),
      floorplanIds.length
        ? supabase
            .from("floorplans")
            .select("id, name, beds, baths, sqft_min, sqft_max, layout_image_url")
            .in("id", floorplanIds)
        : emptyRes,
      supabase
        .from("showing_debriefs")
        .select("submitted_at, showing_leads:showing_lead_id!inner(building_id)")
        .eq("showing_leads.building_id", id)
        .eq("client_showed_up", true)
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  // Latest price per unit. fetchAvailableUnitPrices already nulls unverified
  // captures, so everything priced on this page (range, summary, JSON-LD,
  // unit rows) quotes verified rents only — the rest say "Contact for pricing".
  const unitPrices: Record<string, { rent: number; captured_at: string }> = {};
  for (const p of unitPriceRows) {
    if (p.latest_rent == null || !p.price_captured_at) continue;
    unitPrices[p.id] = { rent: p.latest_rent, captured_at: p.price_captured_at };
  }

  // Trust badges: freshest price snapshot + most recent completed Staycio tour
  const latestPriceDate = Object.values(unitPrices).reduce<string | null>(
    (latest, p) => (!latest || p.captured_at > latest ? p.captured_at : latest),
    null
  );
  const pricingVerified = latestPriceDate !== null && isWithinDays(latestPriceDate, 30);

  const lastTourDebrief = debriefRes.data;

  // Aggregate price history by date (average rent per date)
  const priceByDate: Record<string, { total: number; count: number }> = {};
  for (const snap of historyRows) {
    const dateKey = snap.captured_at.split("T")[0];
    if (!priceByDate[dateKey]) {
      priceByDate[dateKey] = { total: 0, count: 0 };
    }
    priceByDate[dateKey].total += snap.rent;
    priceByDate[dateKey].count++;
  }

  const priceHistory = Object.entries(priceByDate)
    .map(([date, { total, count }]) => ({
      date,
      price: Math.round(total / count),
    }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Group unit images by unit
  const unitImages: Record<string, UnitImage[]> = {};
  for (const img of unitImageRows) {
    if (!unitImages[img.unit_id]) {
      unitImages[img.unit_id] = [];
    }
    unitImages[img.unit_id].push(img);
  }

  // Floorplans keyed by id
  const floorplans: Record<string, Floorplan> = {};
  for (const fp of floorplansRes.data || []) {
    floorplans[fp.id] = fp;
  }

  // Calculate price range
  const prices = Object.values(unitPrices).map((p) => p.rent);
  const priceRange = prices.length
    ? { min: Math.min(...prices), max: Math.max(...prices) }
    : null;

  // Combine all images for the gallery (building images + exterior from facts)
  const allImages: { url: string; alt: string; category?: string }[] = [];

  // Add building images from the new table
  for (const img of buildingImages || []) {
    allImages.push({
      url: img.url,
      alt: img.alt_text || building.name,
      category: img.category || undefined,
    });
  }

  // Add exterior image from building_facts if not already in building_images.
  // This one goes to the FRONT, so it becomes the hero — hold it to the same
  // bar as a scraped photo, or a stale import puts a favicon at the top of the
  // page (which is exactly what 420 Kent was showing).
  const factImage = buildingFacts.image_exterior as string | undefined;
  if (
    factImage &&
    !isJunkImageUrl(factImage) &&
    !allImages.some((img) => img.url === factImage)
  ) {
    allImages.unshift({
      url: factImage,
      alt: `${building.name} exterior`,
      category: "exterior",
    });
  }

  // Gather amenity names for JSON-LD
  const amenityNames = amenities
    ?.map((a) => {
      const am = a.amenities as { name: string } | { name: string }[] | null;
      return Array.isArray(am) ? am[0]?.name : am?.name;
    })
    .filter((name): name is string => !!name);

  // Server-rendered page copy built from the building's own stored facts.
  // Without it a building with no `description` (213 of 247) rendered ~2.3KB of
  // boilerplate that Google crawls and declines to index.
  const summary = buildSummary({
    name: building.name,
    address: building.address_1,
    cityName: building.cities?.name,
    state: building.cities?.state,
    neighborhoodName: building.neighborhoods?.name,
    yearBuilt: building.year_built,
    stories: building.stories,
    description: building.description,
    petPolicy: building.pet_policy,
    parkingPolicy: building.parking_policy,
    amenities: amenityNames ?? [],
    units: (units || []).map((u) => ({
      beds: u.beds,
      baths: u.baths,
      sqft: u.sqft,
      price: unitPrices[u.id]?.rent ?? null,
    })),
    pricesVerifiedAt: latestPriceDate,
  });

  return (
    <>
      <ApartmentComplexJsonLd
        name={building.name}
        description={building.description || undefined}
        address={building.address_1}
        city={building.cities?.name || ""}
        state={building.cities?.state}
        zip={building.zip}
        url={buildingUrl(building)}
        image={allImages[0]?.url}
        priceRange={priceRange || undefined}
        amenities={amenityNames}
        latitude={building.lat}
        longitude={building.lng}
      />
      <BreadcrumbJsonLd
        items={[
          { name: "Apartments", path: "/cities" },
          ...(building.cities
            ? [{ name: `${building.cities.name} Apartments`, path: `/cities/${building.cities.slug}` }]
            : []),
          ...(building.neighborhoods
            ? [
                {
                  name: `${building.neighborhoods.name} Apartments`,
                  path: `/neighborhoods/${building.neighborhoods.slug}${
                    building.cities ? `?city=${building.cities.slug}` : ""
                  }`,
                },
              ]
            : []),
          { name: building.name },
        ]}
      />
      <FaqJsonLd items={summary.faqs} />
      <UnitOffersJsonLd
        buildingName={building.name}
        buildingUrl={buildingUrl(building)}
        // JSON-LD is sent twice (HTML + RSC payload); 20 offers is plenty for rich results
        units={(units || []).slice(0, 20).map((u) => ({
          unitId: u.id,
          unitNumber: u.unit_number,
          beds: u.beds,
          baths: u.baths,
          sqft: u.sqft,
          price: unitPrices[u.id]?.rent ?? null,
          availableOn: u.available_on,
        }))}
      />
      <div className="flex min-h-screen flex-col">
        <Header />

      <main className="flex-1">
        {/* Hero/Header */}
        <div className="bg-gradient-to-b from-muted/50 to-background">
          <div className="container mx-auto px-4 pt-20 pb-6 md:pt-24 md:pb-8">
            <Breadcrumb
              items={[
                { label: "Search", href: "/search" },
                ...(building.cities ? [{ label: building.cities.name, href: `/search?city=${building.cities.slug}` }] : []),
                ...(building.neighborhoods ? [{ label: building.neighborhoods.name, href: `/neighborhoods/${building.neighborhoods.slug}${building.cities ? `?city=${building.cities.slug}` : ""}` }] : []),
                { label: building.name },
              ]}
              className="mb-6"
            />

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
              {/* Image Gallery */}
              <div className="lg:col-span-2">
                {allImages.length > 0 ? (
                  <ImageGallery images={allImages} buildingName={building.name} />
                ) : (
                  <div className="relative h-64 md:h-96 rounded-xl overflow-hidden border border-white/[0.06]">
                    <ListingPlaceholder seed={building.id} name={building.name} />
                  </div>
                )}
                {buildingFacts.move_in_specials && (
                  <Badge className="mt-4 bg-white text-black hover:bg-white">
                    Special Offer Available
                  </Badge>
                )}
              </div>

              {/* Quick Info */}
              <div className="space-y-6">
                <div>
                  {building.neighborhoods && (
                    <Badge className="mb-2">{building.neighborhoods.name}</Badge>
                  )}
                  <div className="flex items-start justify-between gap-3">
                    <h1 className="text-3xl font-bold">{building.name}</h1>
                    <FavoriteButton
                      item={{
                        id: building.id,
                        type: "building",
                        name: building.name,
                        address: building.address_1,
                        neighborhood: building.neighborhoods?.name,
                        citySlug: building.cities?.slug,
                        image: allImages[0]?.url,
                        // Only a verified rent is worth carrying onto the saved card
                        price: pricingVerified ? priceRange?.min : undefined,
                      }}
                      size="lg"
                      className="shrink-0 mt-0.5"
                    />
                  </div>
                  <p className="mt-2 flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    {building.address_1}
                    {building.address_2 && `, ${building.address_2}`}
                    {building.zip && ` ${building.zip}`}
                  </p>
                  {building.cities && (
                    <p className="text-sm text-muted-foreground">
                      {building.cities.name}, {building.cities.state}
                    </p>
                  )}
                  {(pricingVerified || lastTourDebrief) && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {pricingVerified && latestPriceDate && (
                        <Badge variant="outline" className="gap-1 border-emerald-700/60 text-emerald-400">
                          <BadgeCheck className="h-3.5 w-3.5" />
                          Pricing verified {formatDate(latestPriceDate)}
                        </Badge>
                      )}
                      {lastTourDebrief && (
                        <Badge variant="outline" className="gap-1 border-white/20 text-white/80">
                          <Footprints className="h-3.5 w-3.5" />
                          Toured by Staycio {formatDate(lastTourDebrief.submitted_at)}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>

                {priceRange && (
                  <div>
                    <p className="text-sm text-muted-foreground">Starting from</p>
                    <p className="text-2xl font-bold">
                      {formatPrice(priceRange.min)}
                      {priceRange.min !== priceRange.max && (
                        <span className="text-lg font-normal text-muted-foreground">
                          {" "}
                          - {formatPrice(priceRange.max)}
                        </span>
                      )}
                      <span className="text-lg font-normal text-muted-foreground">/mo</span>
                    </p>
                  </div>
                )}

                <BuildingContactButtons
                  buildingId={building.id}
                  buildingName={building.name}
                  citySlug={building.cities?.slug || ""}
                  leasingEmail={building.leasing_email}
                />

                {/* Contact Info */}
                <div className="space-y-2 text-sm">
                  {building.leasing_phone && (
                    <a
                      href={`tel:${building.leasing_phone}`}
                      className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
                    >
                      <Phone className="h-4 w-4" />
                      {building.leasing_phone}
                    </a>
                  )}
                  {building.leasing_email && (
                    <a
                      href={`mailto:${building.leasing_email}`}
                      className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
                    >
                      <Mail className="h-4 w-4" />
                      {building.leasing_email}
                    </a>
                  )}
                  {building.website_url && (
                    <a
                      href={building.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
                    >
                      <Globe className="h-4 w-4" />
                      Visit Website
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-8">
              {/* Move-in Specials */}
              {buildingFacts.move_in_specials && (
                <Card className="border-white/15 bg-white/[0.03]">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-white">
                      <span className="text-xl">🎉</span> Move-in Special
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-white/80 font-medium">
                      {buildingFacts.move_in_specials}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* About — always rendered. The stored description opens it when
                  one exists; the rest is assembled from the building's own
                  facts so the page is never a bare unit table. */}
              <Card>
                <CardHeader>
                  <CardTitle as="h2">
                    About {building.name}
                    {building.cities?.name ? ` in ${building.cities.name}` : ""}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {summary.overview.map((para, i) => (
                    <p key={i} className="text-muted-foreground leading-relaxed">
                      {para}
                    </p>
                  ))}

                  {summary.unitMix.length > 0 && (
                    <div className="pt-2">
                      <h3 className="font-semibold mb-2 text-sm">
                        Floor plans at {building.name}
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-muted-foreground border-b border-border">
                              <th className="py-2 pr-4 font-medium">Layout</th>
                              <th className="py-2 pr-4 font-medium">Available</th>
                              <th className="py-2 pr-4 font-medium">Size</th>
                              <th className="py-2 font-medium">Rent</th>
                            </tr>
                          </thead>
                          <tbody>
                            {summary.unitMix.map((row) => (
                              <tr key={row.key} className="border-b border-border/50 last:border-0">
                                <td className="py-2 pr-4 font-medium">{row.label}</td>
                                <td className="py-2 pr-4 text-muted-foreground">{row.count}</td>
                                <td className="py-2 pr-4 text-muted-foreground">
                                  {row.minSqft
                                    ? row.maxSqft && row.maxSqft !== row.minSqft
                                      ? `${row.minSqft.toLocaleString()}–${row.maxSqft.toLocaleString()} sq ft`
                                      : `${row.minSqft.toLocaleString()} sq ft`
                                    : "—"}
                                </td>
                                <td className="py-2 text-muted-foreground">
                                  {row.minPrice
                                    ? row.maxPrice && row.maxPrice !== row.minPrice
                                      ? `${formatPrice(row.minPrice)}–${formatPrice(row.maxPrice)}`
                                      : formatPrice(row.minPrice)
                                    : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* FAQ — every answer is a stored fact, so it is safe to mark up
                  as FAQPage, and it targets the long-tail questions people
                  actually type ("is <building> pet friendly"). */}
              {summary.faqs.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle as="h2">
                      Frequently asked questions about {building.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {summary.faqs.map((faq) => (
                      <div key={faq.question}>
                        <h3 className="font-semibold text-sm mb-1">{faq.question}</h3>
                        <p className="text-muted-foreground text-sm leading-relaxed">
                          {faq.answer}
                        </p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* 3D Tour */}
              {building.tour_3d_url && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Layout className="h-5 w-5" />
                      Virtual 3D Tour
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 overflow-hidden rounded-b-xl">
                    <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
                      <iframe
                        src={building.tour_3d_url}
                        allow="xr-spatial-tracking; gyroscope; accelerometer; fullscreen"
                        allowFullScreen
                        className="absolute inset-0 w-full h-full border-0"
                        title={`3D Tour of ${building.name}`}
                      />
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Available Units */}
              <Card>
                <CardHeader>
                  <CardTitle as="h2">
                    Available Units at {building.name} ({units?.length || 0})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {units?.length ? (
                    <div className="space-y-4">
                      {units.map((unit) => {
                        const price = unitPrices[unit.id];
                        const images = unitImages[unit.id] || [];
                        const primaryImage = images[0];
                        const floorplan = unit.floorplan_id ? floorplans[unit.floorplan_id] : null;

                        return (
                          <div
                            key={unit.id}
                            className="flex flex-col md:flex-row gap-4 rounded-lg border p-4"
                          >
                            {/* Unit Image */}
                            <div className="relative w-full md:w-48 h-32 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                              {primaryImage ? (
                                <Image
                                  src={primaryImage.url}
                                  alt={primaryImage.alt_text || `Unit ${unit.unit_number}`}
                                  fill
                                  className="object-cover"
                                  sizes="(max-width: 768px) 100vw, 192px"
                                />
                              ) : (
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <Building2 className="h-8 w-8 text-muted-foreground/30" />
                                </div>
                              )}
                              {images.length > 1 && (
                                <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                                  <ImageIcon className="h-3 w-3" />
                                  {images.length}
                                </div>
                              )}
                            </div>

                            {/* Unit Details */}
                            <div className="flex-1 flex flex-col justify-between">
                              <div>
                                <div className="flex items-center gap-2 mb-2">
                                  {unit.unit_number && (
                                    <span className="font-semibold">Unit {unit.unit_number}</span>
                                  )}
                                  {floorplan && (
                                    <Badge variant="outline" className="gap-1">
                                      <Layout className="h-3 w-3" />
                                      {floorplan.name}
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <Badge variant="secondary" className="gap-1">
                                    <Bed className="h-3 w-3" />
                                    {unit.beds === 0 ? "Studio" : `${unit.beds} bed`}
                                  </Badge>
                                  {unit.baths && (
                                    <Badge variant="secondary" className="gap-1">
                                      <Bath className="h-3 w-3" />
                                      {unit.baths} bath
                                    </Badge>
                                  )}
                                  {unit.sqft && (
                                    <Badge variant="secondary" className="gap-1">
                                      <Square className="h-3 w-3" />
                                      {unit.sqft.toLocaleString()} sqft
                                    </Badge>
                                  )}
                                  {unit.available_on && (
                                    <Badge variant="outline" className="gap-1">
                                      <Calendar className="h-3 w-3" />
                                      {formatDate(unit.available_on)}
                                    </Badge>
                                  )}
                                </div>
                              </div>

                              {/* Price and Actions */}
                              <div className="flex items-center justify-between mt-4">
                                <div>
                                  {price ? (
                                    <span className="text-lg font-bold">
                                      {formatPrice(price.rent)}
                                      <span className="text-sm font-normal text-muted-foreground">/mo</span>
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">Contact for pricing</span>
                                  )}
                                </div>
                                <div className="flex gap-2">
                                  {floorplan?.layout_image_url && (
                                    <Button size="sm" variant="outline" className="gap-1" asChild>
                                      <a
                                        href={floorplan.layout_image_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                      >
                                        <Layout className="h-3 w-3" />
                                        Floor Plan
                                      </a>
                                    </Button>
                                  )}
                                  <Link href={`${buildingPath(building)}/units/${unit.id}`}>
                                    <Button size="sm">View</Button>
                                  </Link>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">
                      No units currently available. Contact leasing for upcoming availability.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Amenities */}
              {amenities?.length ? (
                <Card>
                  <CardHeader>
                    <CardTitle as="h2">{building.name} Amenities</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                      {amenities.map((a, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 rounded-lg border p-3"
                        >
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                            <Building2 className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium text-sm">
                              {(() => {
                                const am = a.amenities as { name: string } | { name: string }[] | null;
                                return Array.isArray(am) ? am[0]?.name : am?.name;
                              })()}
                            </p>
                            {a.details && (
                              <p className="text-xs text-muted-foreground">{a.details}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ) : null}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Policies */}
              <Card>
                <CardHeader>
                  <CardTitle as="h2">Pet, Parking &amp; Deposit Policies</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {building.pet_policy && (
                    <div className="flex items-start gap-3">
                      <PawPrint className="mt-0.5 h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium text-sm">Pets</p>
                        <p className="text-sm text-muted-foreground">{building.pet_policy}</p>
                      </div>
                    </div>
                  )}
                  {building.parking_policy && (
                    <div className="flex items-start gap-3">
                      <Car className="mt-0.5 h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium text-sm">Parking</p>
                        <p className="text-sm text-muted-foreground">{building.parking_policy}</p>
                      </div>
                    </div>
                  )}
                  {building.deposit_policy && (
                    <div className="flex items-start gap-3">
                      <Building2 className="mt-0.5 h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium text-sm">Deposit</p>
                        <p className="text-sm text-muted-foreground">{building.deposit_policy}</p>
                      </div>
                    </div>
                  )}
                  {!building.pet_policy && !building.parking_policy && !building.deposit_policy && (
                    <p className="text-sm text-muted-foreground">
                      Contact leasing for policy information.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Building Details */}
              <Card>
                <CardHeader>
                  <CardTitle as="h2">Building Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {building.year_built && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Year Built</span>
                      <span className="font-medium">{building.year_built}</span>
                    </div>
                  )}
                  {building.stories && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Stories</span>
                      <span className="font-medium">{building.stories}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Client-side components: Price History, Similar, Recently Viewed */}
              <BuildingPageClient
                building={{
                  id: building.id,
                  name: building.name,
                  address: building.address_1,
                  neighborhood: building.neighborhoods?.name,
                  citySlug: building.cities?.slug || "",
                  neighborhoodSlug: building.neighborhoods?.slug,
                  image: allImages[0]?.url,
                  minPrice: priceRange?.min,
                  priceRange: priceRange || undefined,
                }}
                priceHistory={priceHistory}
              />
            </div>
          </div>
        </div>
      </main>

      <StickyMobileCTA
        buildingId={building.id}
        buildingName={building.name}
        citySlug={building.cities?.slug || ""}
        price={priceRange?.min}
      />

      <Footer />
      </div>
    </>
  );
}
