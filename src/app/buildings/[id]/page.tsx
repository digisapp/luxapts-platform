import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { policyText } from "@/lib/policy-text";
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
import { INVENTORY_MAX_AGE_DAYS } from "@/lib/microsite-inventory";

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

// Latest verified rent per available unit, shared by generateMetadata and the
// page. fetchAvailableUnitPrices nulls captures older than the verified window.
interface UnitPriceRow {
  id: string;
  building_id: string;
  latest_rent: number | null;
  price_captured_at: string | null;
}

const getUnitPrices = cache(async (id: string) =>
  fetchAvailableUnitPrices<UnitPriceRow>(createAdminClient(), [id], ["price_captured_at"])
);

// Pre-leasing facts (a new building whose leasing hasn't opened), shared by
// generateMetadata and the page.
const getPreLeasingFacts = cache(async (id: string) => {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("building_facts")
    .select("key, value")
    .eq("building_id", id)
    .in("key", ["leasing_status", "expected_opening", "opening_checked_at", "developer", "total_units"]);
  const facts = Object.fromEntries((data ?? []).map((f) => [f.key, f.value])) as Record<string, unknown>;
  if (facts.leasing_status !== "pre_leasing" || typeof facts.expected_opening !== "string") return null;
  return {
    expectedOpening: facts.expected_opening,
    checkedAt: typeof facts.opening_checked_at === "string" ? facts.opening_checked_at : null,
    developer: typeof facts.developer === "string" ? facts.developer : null,
    unitsTotal: Number(facts.total_units) > 0 ? Number(facts.total_units) : null,
  };
});

// Active MLS rental listings in this building (condos; migration 040). A
// missing table or any error reads as "no listings", never a broken page.
const getMlsListings = cache(async (id: string) => {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("mls_listings")
    .select(
      "listing_id, list_price, bedrooms, bathrooms, living_area, unit_number, available_date, furnished, photo_urls, list_office_name, last_seen_at"
    )
    .eq("building_id", id)
    .eq("is_active", true)
    .order("list_price", { ascending: true })
    .limit(60);
  if (error || !data) return [];
  return data;
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

  const [ogImage, availableUnits, unitPrices, preLeasingFacts, mlsListings] = await Promise.all([
    getPrimaryBuildingImage(building.id),
    getAvailableUnitCount(building.id),
    getUnitPrices(building.id),
    getPreLeasingFacts(building.id),
    getMlsListings(building.id),
  ]);
  const mlsRents = mlsListings.map((l) => l.list_price).filter((p): p is number => typeof p === "number" && p > 0);
  // Pre-leasing applies only until units are listed; then it's a normal page.
  const preLeasing = availableUnits === 0 ? preLeasingFacts : null;
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
  // whether anything is open. Search engines and AI assistants quote it, so it
  // states the verified starting rent and its date when there is one, and
  // falls back to the static line otherwise.
  const verified = unitPrices.filter((p) => p.latest_rent && p.price_captured_at);
  const fromRent = verified.length ? Math.min(...verified.map((p) => p.latest_rent as number)) : null;
  const checkedAt = verified.reduce<string | null>(
    (latest, p) => (!latest || (p.price_captured_at as string) > latest ? (p.price_captured_at as string) : latest),
    null
  );
  const tz = timeZoneForState(city?.state);
  // Pre-leasing: no opening year in the snippet (dates slip; see the
  // microsite-title rule), the dated quote lives on the page.
  const description = mlsRents.length && availableUnits === 0
    ? `${building.name} in ${place || "the city"}: ${mlsListings.length} condo${mlsListings.length === 1 ? "" : "s"} for rent from ${formatPrice(
        Math.min(...mlsRents)
      )}/month, listed on the MLS. Building facts, amenities and current rentals on Staycio.`
    : preLeasing
    ? `${building.name} in ${place || "the city"}: new rental building${
        preLeasing.developer ? ` from ${preLeasing.developer}` : ""
      }${preLeasing.unitsTotal ? `, ${preLeasing.unitsTotal.toLocaleString()} apartments` : ""}. Leasing hasn't opened yet: get first access to pricing and floor plans on Staycio.`
    : fromRent && checkedAt && availableUnits > 0
      ? `${building.name} in ${place || "the city"}: ${availableUnits} apartment${
          availableUnits === 1 ? "" : "s"
        } listed from ${formatPrice(fromRent)}/month, prices verified ${formatDate(checkedAt, tz)}. Floor plans, amenities, pet and parking policies${
          building.year_built ? `. Built ${building.year_built}` : ""
        }.`
      : `${building.name} in ${place || "the city"}: see live rents, available floor plans, amenities, pet and parking policies${
          building.year_built ? `. Built ${building.year_built}` : ""
        }. Verified pricing on Staycio.`;

  const canonical = buildingPath(building);

  return {
    title,
    description,
    // Same rule as city and neighborhood pages: a building with nothing listed
    // is a thin "No units currently available" page. Keep it reachable but out
    // of the index (and the sitemap) until it has inventory again.
    // A pre-leasing building is indexable too: it has real, dated facts and a
    // first-access form, and new buildings are searched by name.
    robots: availableUnits > 0 || preLeasing || mlsListings.length > 0 ? undefined : { index: false, follow: true },
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
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPrice, formatDate, telHref } from "@/lib/utils";
import {
  MapPin,
  Phone,
  Mail,
  Globe,
  PawPrint,
  Car,
  Layout,
  BadgeCheck,
  Footprints,
  Check,
  ChevronDown,
  Sparkles,
  Wallet,
} from "lucide-react";
import { ImageGallery } from "./ImageGallery";
import { BuildingPageClient, BuildingPriceHistory } from "./BuildingPageClient";
import { UnitList } from "./UnitList";
import type { UnitRowData } from "./UnitRow";
import { timeZoneForState, todayKey } from "../availability";
import { compareUnitRows, toUnitRowData } from "./unit-rows";
import { BuildingContactButtons } from "./BuildingContactButtons";
import { MlsListings } from "./MlsListings";
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
    supabase.from("building_facts").select("key, value, updated_at").eq("building_id", id),
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
  const factUpdatedAt: Record<string, string> = {};
  for (const fact of factsRes.data || []) {
    buildingFacts[fact.key] = fact.value as string | number;
    factUpdatedAt[fact.key] = fact.updated_at;
  }

  // A special is an offer: show it only when it was captured inside the same
  // window as a verified rent. Every stored special was a January 2026 scrape,
  // some with deadlines long past, still shown as current in October.
  const specialText =
    typeof buildingFacts.move_in_specials === "string" ? buildingFacts.move_in_specials.trim() : "";
  const moveInSpecial =
    specialText &&
    !/^contact\b/i.test(specialText) &&
    factUpdatedAt.move_in_specials &&
    isWithinDays(factUpdatedAt.move_in_specials, INVENTORY_MAX_AGE_DAYS)
      ? specialText
      : null;

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
      getUnitPrices(id),
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

  // Dates on this page are the building's calendar day: the server runs in
  // UTC, which put "Pricing verified" a day ahead every evening after 8pm ET.
  const buildingTimeZone = timeZoneForState(building.cities?.state);

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
  // Scraper filler ("Not specified in the provided HTML") dropped once, here
  const petPolicy = policyText(building.pet_policy);
  const parkingPolicy = policyText(building.parking_policy);
  const depositPolicy = policyText(building.deposit_policy);

  // A new building whose leasing hasn't opened, until units are listed
  const preLeasing = (units?.length ?? 0) === 0 ? await getPreLeasingFacts(id) : null;

  // Condo: rentals come from the MLS, not a leasing office
  const isCondo = building.property_type === "condo";
  const mlsListings = await getMlsListings(id);
  const mlsRents = mlsListings.map((l) => l.list_price).filter((p): p is number => typeof p === "number" && p > 0);
  const mlsMin = mlsRents.length ? Math.min(...mlsRents) : null;
  const mlsMax = mlsRents.length ? Math.max(...mlsRents) : null;
  const mlsUpdated = mlsListings.reduce<string | null>(
    (latest, l) => (l.last_seen_at && (!latest || l.last_seen_at > latest) ? l.last_seen_at : latest),
    null
  );

  const summary = buildSummary({
    name: building.name,
    address: building.address_1,
    cityName: building.cities?.name,
    state: building.cities?.state,
    neighborhoodName: building.neighborhoods?.name,
    yearBuilt: building.year_built,
    stories: building.stories,
    description: building.description,
    petPolicy,
    parkingPolicy,
    amenities: amenityNames ?? [],
    units: (units || []).map((u) => ({
      beds: u.beds,
      baths: u.baths,
      sqft: u.sqft,
      price: unitPrices[u.id]?.rent ?? null,
    })),
    pricesVerifiedAt: latestPriceDate,
    timeZone: buildingTimeZone,
    leasingPhone: building.leasing_phone,
    pageUrl: buildingUrl(building),
    preLeasing,
    condo: isCondo
      ? {
          listings: mlsListings.length,
          minRent: mlsMin,
          maxRent: mlsMax,
          unitsTotal: Number(buildingFacts.total_units) > 0 ? Number(buildingFacts.total_units) : null,
          developer: typeof buildingFacts.developer === "string" ? buildingFacts.developer : null,
        }
      : null,
  });

  // Unit rows, resolved here so the client list only filters and collapses.
  // Cheapest first: that is the question a renter opens this list to answer.
  const today = todayKey(buildingTimeZone);
  const basePath = buildingPath(building);
  const unitRows: UnitRowData[] = (units || [])
    .map((u) =>
      toUnitRowData(u, {
        basePath,
        today,
        price: unitPrices[u.id]?.rent ?? null,
        planName: u.floorplan_id ? floorplans[u.floorplan_id]?.name ?? null : null,
        photos: unitImages[u.id],
      })
    )
    .sort(compareUnitRows);
  const unitCount = unitRows.length;

  const hasPolicies = !!(petPolicy || parkingPolicy || depositPolicy);

  return (
    <>
      <ApartmentComplexJsonLd
        name={building.name}
        // The same fact-built overview the page shows (stored description
        // first when there is one), not a "Luxury apartments at X" filler.
        description={summary.overview.slice(0, 2).join(" ")}
        telephone={building.leasing_phone || undefined}
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
        units={unitRows.slice(0, 20).map((u) => ({
          unitId: u.id,
          unitNumber: u.unitNumber,
          beds: u.beds,
          baths: u.baths,
          sqft: u.sqft,
          price: u.price,
          availableOn: u.availableOn,
        }))}
      />
      <div className="flex min-h-screen flex-col">
        <Header />

      <main className="flex-1">
        {/* Hero/Header */}
        <div className="bg-gradient-to-b from-muted/50 to-background">
          <div className="mx-auto w-full max-w-7xl px-4 pt-20 pb-6 sm:px-6 md:pt-24 md:pb-8">
            <Breadcrumb
              items={[
                { label: "Search", href: "/search" },
                ...(building.cities ? [{ label: building.cities.name, href: `/search?city=${building.cities.slug}` }] : []),
                ...(building.neighborhoods ? [{ label: building.neighborhoods.name, href: `/neighborhoods/${building.neighborhoods.slug}${building.cities ? `?city=${building.cities.slug}` : ""}` }] : []),
                { label: building.name },
              ]}
              className="mb-6"
            />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
              {/* Image Gallery */}
              <div className="min-w-0 lg:col-span-2">
                {allImages.length > 0 ? (
                  <ImageGallery images={allImages} buildingName={building.name} />
                ) : (
                  <div className="relative h-64 md:h-96 rounded-xl overflow-hidden border border-border dark:border-white/[0.06]">
                    <ListingPlaceholder seed={building.id} name={building.name} />
                  </div>
                )}
              </div>

              {/* Quick Info */}
              <div className="min-w-0 space-y-5">
                <div>
                  <div className="mb-2 flex flex-wrap gap-2">
                    {building.neighborhoods && <Badge>{building.neighborhoods.name}</Badge>}
                    {preLeasing && (
                      <Badge className="bg-stacy/10 text-link border-stacy/40 dark:bg-cyan-400/15 dark:border-cyan-400/30">
                        Pre-leasing
                      </Badge>
                    )}
                    {moveInSpecial && (
                      <Badge className="bg-stacy/10 text-link border-stacy/40 dark:bg-cyan-400/15 dark:border-cyan-400/30">
                        Special offer
                      </Badge>
                    )}
                  </div>
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
                  <p className="mt-2 flex items-start gap-2 text-muted-foreground">
                    <MapPin className="mt-1 h-4 w-4 shrink-0" />
                    <span>
                      {building.address_1}
                      {building.address_2 && `, ${building.address_2}`}
                      {building.zip && ` ${building.zip}`}
                      {building.cities && (
                        <span className="block text-sm">
                          {building.cities.name}, {building.cities.state}
                        </span>
                      )}
                    </span>
                  </p>
                  {(pricingVerified || lastTourDebrief) && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {pricingVerified && latestPriceDate && (
                        <Badge variant="outline" className="gap-1 border-positive/30 bg-positive/[0.06] text-positive dark:border-emerald-700/60 dark:bg-transparent">
                          <BadgeCheck className="h-3.5 w-3.5" />
                          Pricing verified {formatDate(latestPriceDate, buildingTimeZone)}
                        </Badge>
                      )}
                      {lastTourDebrief && (
                        <Badge variant="outline" className="gap-1 border-foreground/20 text-foreground/80">
                          <Footprints className="h-3.5 w-3.5" />
                          Toured by Staycio {formatDate(lastTourDebrief.submitted_at, buildingTimeZone)}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>

                {/* Wraps as a unit: in the narrow 1024px column the range used to
                    break after the dash, stranding "$10,500/mo" on its own line */}
                <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {priceRange || mlsMin ? "Starting from" : preLeasing ? "Pre-leasing" : "Pricing"}
                    </p>
                    {!priceRange && mlsMin ? (
                      <p className="whitespace-nowrap text-2xl font-bold tabular-nums">
                        {formatPrice(mlsMin)}
                        <span className="text-lg font-normal text-muted-foreground">/mo</span>
                      </p>
                    ) : priceRange ? (
                      <p className="whitespace-nowrap text-2xl font-bold tabular-nums">
                        {formatPrice(priceRange.min)}
                        {priceRange.min !== priceRange.max && (
                          <span className="text-lg font-normal text-muted-foreground">
                            –{formatPrice(priceRange.max)}
                          </span>
                        )}
                        <span className="text-lg font-normal text-muted-foreground">/mo</span>
                      </p>
                    ) : (
                      <p className="text-lg font-semibold">{preLeasing ? "Pricing not released yet" : "Contact for pricing"}</p>
                    )}
                  </div>
                  {unitCount === 0 && mlsListings.length > 0 && (
                    <a
                      href="#mls-listings"
                      className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm font-medium text-link underline-offset-4 hover:underline dark:hover:text-cyan-200 dark:hover:no-underline"
                    >
                      {mlsListings.length} condo{mlsListings.length === 1 ? "" : "s"} for rent
                      <ChevronDown className="h-4 w-4" />
                    </a>
                  )}
                  {unitCount > 0 && (
                    <a
                      href="#available-units"
                      className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm font-medium text-link underline-offset-4 hover:underline dark:hover:text-cyan-200 dark:hover:no-underline"
                    >
                      {unitCount} unit{unitCount === 1 ? "" : "s"} available
                      <ChevronDown className="h-4 w-4" />
                    </a>
                  )}
                </div>

                <BuildingContactButtons
                  buildingId={building.id}
                  buildingName={building.name}
                  citySlug={building.cities?.slug || ""}
                  leasingEmail={building.leasing_email}
                  preLeasing={!!preLeasing}
                />

                {/* Contact Info — one wrapping row; each link keeps a 44px tap height */}
                {(building.leasing_phone || building.leasing_email || building.website_url) && (
                  <div className="flex flex-wrap items-center gap-x-5 text-sm">
                    {building.leasing_phone && (
                      <a
                        href={`tel:${telHref(building.leasing_phone)}`}
                        className="inline-flex min-h-11 items-center gap-2 text-muted-foreground hover:text-foreground"
                      >
                        <Phone className="h-4 w-4" />
                        {building.leasing_phone}
                      </a>
                    )}
                    {building.leasing_email && (
                      <a
                        href={`mailto:${building.leasing_email}`}
                        className="inline-flex min-h-11 min-w-0 items-center gap-2 text-muted-foreground hover:text-foreground"
                      >
                        <Mail className="h-4 w-4 shrink-0" />
                        <span className="truncate">{building.leasing_email}</span>
                      </a>
                    )}
                    {building.website_url && (
                      <a
                        href={building.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 items-center gap-2 text-muted-foreground hover:text-foreground"
                      >
                        <Globe className="h-4 w-4" />
                        Visit website
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
            <div className="min-w-0 space-y-6 lg:col-span-2">
              {/* Move-in Specials */}
              {moveInSpecial && (
                <Card className="border-stacy/40 bg-stacy/[0.06] dark:border-cyan-400/25 dark:bg-cyan-400/[0.04]">
                  <CardContent className="flex items-start gap-3 p-4 sm:p-5">
                    <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-link" />
                    <div>
                      <h2 className="font-semibold text-foreground">Move-in special</h2>
                      <p className="mt-1 text-sm text-foreground/80">{moveInSpecial}</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* About — always rendered. The stored description opens it when
                  one exists; the rest is assembled from the building's own
                  facts so the page is never a bare unit table. */}
              <Card>
                <CardHeader className="p-4 sm:p-6">
                  <CardTitle as="h2" className="text-lg">
                    About {building.name}
                    {building.cities?.name ? ` in ${building.cities.name}` : ""}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 px-4 pb-4 sm:px-6 sm:pb-6">
                  {summary.overview.map((para, i) => (
                    <p key={i} className="text-muted-foreground leading-relaxed">
                      {para}
                    </p>
                  ))}

                  {summary.unitMix.length > 0 && (
                    <div className="pt-3">
                      <h3 className="font-semibold mb-2 text-sm">
                        Floor plans at {building.name}
                      </h3>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-muted-foreground border-b border-border">
                            <th className="py-2 pr-3 font-medium">Layout</th>
                            <th className="hidden py-2 pr-3 font-medium sm:table-cell">Available</th>
                            <th className="py-2 pr-3 font-medium">Size</th>
                            <th className="py-2 text-right font-medium sm:text-left">Rent</th>
                          </tr>
                        </thead>
                        <tbody>
                          {summary.unitMix.map((row) => (
                            <tr key={row.key} className="border-b border-border/50 last:border-0">
                              <td className="py-2.5 pr-3 font-medium">
                                <span className="whitespace-nowrap">{row.label}</span>
                                <span className="block text-xs font-normal text-muted-foreground sm:hidden">
                                  {row.count} available
                                </span>
                              </td>
                              <td className="hidden py-2.5 pr-3 text-muted-foreground sm:table-cell">{row.count}</td>
                              <td className="py-2.5 pr-3 text-muted-foreground">
                                {/* Ranges may break after the dash, never inside a
                                    number: unbreakable, "$10,450–$10,500" made this
                                    table 344px wide on a 320px phone and the whole
                                    page zoomed out */}
                                {row.minSqft ? (
                                  row.maxSqft && row.maxSqft !== row.minSqft ? (
                                    <>
                                      <span className="whitespace-nowrap">{row.minSqft.toLocaleString()}–</span>
                                      <wbr />
                                      <span className="whitespace-nowrap">{row.maxSqft.toLocaleString()} sq ft</span>
                                    </>
                                  ) : (
                                    <span className="whitespace-nowrap">{row.minSqft.toLocaleString()} sq ft</span>
                                  )
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td className="py-2.5 text-right text-muted-foreground sm:text-left">
                                {row.minPrice ? (
                                  row.maxPrice && row.maxPrice !== row.minPrice ? (
                                    <>
                                      <span className="whitespace-nowrap">{formatPrice(row.minPrice)}–</span>
                                      <wbr />
                                      <span className="whitespace-nowrap">{formatPrice(row.maxPrice)}</span>
                                    </>
                                  ) : (
                                    <span className="whitespace-nowrap">{formatPrice(row.minPrice)}</span>
                                  )
                                ) : (
                                  "—"
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Condo rentals from the MLS (IDX) */}
              {(isCondo || mlsListings.length > 0) && (
                <Card id="mls-listings" className="scroll-mt-24">
                  <CardHeader className="p-4 sm:p-6">
                    <CardTitle as="h2" className="text-lg">
                      Condos for rent at {building.name}
                      <span className="ml-2 font-normal text-muted-foreground">({mlsListings.length})</span>
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">Owner-rented units listed on the MLS, lowest rent first</p>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
                    {mlsListings.length ? (
                      <MlsListings
                        buildingId={building.id}
                        buildingName={building.name}
                        citySlug={building.cities?.slug || ""}
                        updatedLabel={mlsUpdated ? formatDate(mlsUpdated, buildingTimeZone) : null}
                        listings={mlsListings.map((l) => ({
                          listingId: l.listing_id,
                          price: l.list_price,
                          beds: l.bedrooms,
                          baths: l.bathrooms,
                          sqft: l.living_area,
                          unit: l.unit_number,
                          availableDate: l.available_date,
                          furnished: l.furnished,
                          photo: l.photo_urls?.[0] ?? null,
                          office: l.list_office_name,
                        }))}
                      />
                    ) : (
                      <p className="text-muted-foreground">
                        No units at {building.name} are listed for rent on the MLS right now. Tell us what you&apos;re looking for and an agent will watch the building for you.
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Available Units — the page's main content */}
              {!(isCondo && unitCount === 0) && (
              <Card id="available-units" className="scroll-mt-24">
                <CardHeader className="p-4 sm:p-6">
                  <CardTitle as="h2" className="text-lg">
                    Available units at {building.name}
                    <span className="ml-2 font-normal text-muted-foreground">({unitCount})</span>
                  </CardTitle>
                  {unitCount > 1 && (
                    <p className="text-sm text-muted-foreground">Sorted by rent, lowest first</p>
                  )}
                </CardHeader>
                <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
                  {unitCount ? (
                    <UnitList units={unitRows} />
                  ) : (
                    <p className="text-muted-foreground">
                      {preLeasing
                        ? "Floor plans and pricing haven't been released. Get first access and we'll send them when leasing opens."
                        : "No units currently available. Contact leasing for upcoming availability."}
                    </p>
                  )}
                </CardContent>
              </Card>
              )}

              <BuildingPriceHistory priceHistory={priceHistory} />

              {/* Amenities */}
              {amenities?.length ? (
                <Card>
                  <CardHeader className="p-4 sm:p-6">
                    <CardTitle as="h2" className="text-lg">{building.name} Amenities</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
                    {/* Phones: two columns of names; the one-line details only from sm up */}
                    <ul className="grid grid-cols-2 gap-x-4 gap-y-3 sm:gap-x-6 md:grid-cols-3">
                      {amenities.map((a, i) => {
                        const am = a.amenities as { name: string } | { name: string }[] | null;
                        const name = Array.isArray(am) ? am[0]?.name : am?.name;
                        return (
                          <li key={i} className="flex items-start gap-2.5">
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-link" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium">{name}</p>
                              {a.details && (
                                <p className="hidden text-xs text-muted-foreground sm:block">{a.details}</p>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </CardContent>
                </Card>
              ) : null}

              {/* 3D Tour */}
              {building.tour_3d_url && (
                <Card>
                  <CardHeader className="p-4 sm:p-6">
                    <CardTitle as="h2" className="flex items-center gap-2 text-lg">
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

              {/* FAQ — every answer is a stored fact, so it is safe to mark up
                  as FAQPage, and it targets the long-tail questions people
                  actually type ("is <building> pet friendly"). */}
              {summary.faqs.length > 0 && (
                <Card>
                  <CardHeader className="p-4 sm:p-6">
                    <CardTitle as="h2" className="text-lg">
                      Frequently asked questions about {building.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="divide-y divide-border dark:divide-white/[0.06] px-4 pb-2 sm:px-6 sm:pb-3">
                    {summary.faqs.map((faq) => (
                      <div key={faq.question} className="py-4 first:pt-0">
                        <h3 className="font-semibold text-sm mb-1">{faq.question}</h3>
                        <p className="text-muted-foreground text-sm leading-relaxed">
                          {faq.answer}
                        </p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Sidebar — facts first, then discovery, then a summary card that
                sticks for the rest of the (much longer) main column. */}
            <aside className="flex min-w-0 flex-col gap-6">
              <Card>
                <CardHeader className="p-4 sm:p-6">
                  <CardTitle as="h2" className="text-base">Pet, Parking &amp; Deposit Policies</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 px-4 pb-4 sm:px-6 sm:pb-6">
                  {petPolicy && (
                    <div className="flex items-start gap-3">
                      <PawPrint className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div>
                        <p className="font-medium text-sm">Pets</p>
                        <p className="text-sm text-muted-foreground">{petPolicy}</p>
                      </div>
                    </div>
                  )}
                  {parkingPolicy && (
                    <div className="flex items-start gap-3">
                      <Car className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div>
                        <p className="font-medium text-sm">Parking</p>
                        <p className="text-sm text-muted-foreground">{parkingPolicy}</p>
                      </div>
                    </div>
                  )}
                  {depositPolicy && (
                    <div className="flex items-start gap-3">
                      <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div>
                        <p className="font-medium text-sm">Deposit</p>
                        <p className="text-sm text-muted-foreground">{depositPolicy}</p>
                      </div>
                    </div>
                  )}
                  {!hasPolicies && (
                    <p className="text-sm text-muted-foreground">
                      Contact leasing for policy information.
                    </p>
                  )}
                  {(building.year_built || building.stories) && (
                    <dl className="space-y-2 border-t border-border pt-4 dark:border-white/[0.06] text-sm">
                      {building.year_built && (
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">Year built</dt>
                          <dd className="font-medium">{building.year_built}</dd>
                        </div>
                      )}
                      {building.stories && (
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">Stories</dt>
                          <dd className="font-medium">{building.stories}</dd>
                        </div>
                      )}
                    </dl>
                  )}
                </CardContent>
              </Card>

              {/* Client-side: Similar, Recently Viewed */}
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
              />

              {/* Desktop only — phones have StickyMobileCTA */}
              <Card className="hidden lg:sticky lg:top-24 lg:block">
                <CardContent className="space-y-4 p-5">
                  <div>
                    <p className="truncate text-sm text-muted-foreground">{building.name}</p>
                    {priceRange || mlsMin ? (
                      <p className="mt-0.5 text-2xl font-bold tabular-nums">
                        {formatPrice(priceRange?.min ?? (mlsMin as number))}
                        <span className="text-base font-normal text-muted-foreground">/mo and up</span>
                      </p>
                    ) : (
                      <p className="mt-0.5 text-lg font-semibold">{preLeasing ? "Pricing not released yet" : "Contact for pricing"}</p>
                    )}
                    <p className="mt-1 text-sm text-muted-foreground">
                      {unitCount
                        ? `${unitCount} unit${unitCount === 1 ? "" : "s"} available`
                        : preLeasing
                          ? "Leasing hasn't opened yet"
                          : "No units listed right now"}
                      {pricingVerified && latestPriceDate && (
                        <span className="text-positive"> · verified {formatDate(latestPriceDate, buildingTimeZone)}</span>
                      )}
                    </p>
                  </div>
                  <BuildingContactButtons
                    buildingId={building.id}
                    buildingName={building.name}
                    citySlug={building.cities?.slug || ""}
                    leasingEmail={building.leasing_email}
                    showShare={false}
                    preLeasing={!!preLeasing}
                  />
                  {building.leasing_phone && (
                    <a
                      href={`tel:${telHref(building.leasing_phone)}`}
                      className="flex min-h-11 items-center justify-center gap-2 rounded-lg text-sm text-muted-foreground hover:text-foreground"
                    >
                      <Phone className="h-4 w-4" />
                      {building.leasing_phone}
                    </a>
                  )}
                </CardContent>
              </Card>
            </aside>
          </div>
        </div>
      </main>

      <StickyMobileCTA
        buildingId={building.id}
        buildingName={building.name}
        citySlug={building.cities?.slug || ""}
        price={priceRange?.min ?? mlsMin ?? undefined}
        preLeasing={!!preLeasing}
      />

      <Footer />
      </div>
    </>
  );
}
