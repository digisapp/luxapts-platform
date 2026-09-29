import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/server";
import { isVerifiedPrice } from "@/lib/verified-pricing";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { StickyMobileCTA } from "@/components/ui/StickyMobileCTA";
import { BuildingContactButtons } from "../../BuildingContactButtons";
import { formatPrice } from "@/lib/utils";
import { fetchAvailableUnitPrices, type AvailableUnitPrice } from "@/lib/search/fetch-enrichments";
import { isJunkImageUrl } from "@/lib/images/quality";
import { availability, timeZoneForState, todayKey } from "../../../availability";
import { UnitRow, type UnitRowData } from "../../UnitRow";
import { compareSiblingRows, toUnitRowData, type UnitRowSource } from "../../unit-rows";
import { buildingPath } from "@/lib/seo/urls";
import { ListingPlaceholder } from "@/components/ui/ListingPlaceholder";
import {
  ArrowRight,
  Bed,
  Bath,
  Square,
  Building2,
  TrendingUp,
  Layout,
  MapPin,
  Check,
  CalendarDays,
} from "lucide-react";
import { UnitGallery } from "./UnitGallery";
import { UnitPriceHistory } from "./UnitPriceHistory";
import { policyText } from "@/lib/policy-text";

export const revalidate = 3600;

// Rows in "More units at …" and amenity chips in the building summary
const MORE_UNITS = 6;
const AMENITY_CHIPS = 10;

// Empty array = no build-time pages (keeps builds flat), but still opts the
// route into on-demand static generation + ISR
export async function generateStaticParams() {
  return [];
}

const getUnit = cache(async (unitId: string) => {
  const supabase = createAdminClient();
  return supabase
    .from("units")
    .select(`
      *,
      buildings:building_id!inner (
        id, slug, name, address_1, address_2, zip, leasing_email, leasing_phone,
        pet_policy, parking_policy, deposit_policy, year_built, stories,
        cities:city_id (id, name, slug, state),
        neighborhoods:neighborhood_id (id, name, slug)
      ),
      floorplans:floorplan_id (
        id, name, beds, baths, sqft_min, sqft_max, layout_image_url
      )
    `)
    .eq("id", unitId)
    // Deactivated buildings are fabricated seeds and merged duplicates
    .eq("buildings.status", "active")
    .single();
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; unitId: string }>;
}): Promise<Metadata> {
  const { id, unitId } = await params;
  const { data: unit } = await getUnit(unitId);
  if (!unit) return { title: "Unit Not Found - Staycio" };

  const building = Array.isArray(unit.buildings) ? unit.buildings[0] : unit.buildings;
  const bedLabel = unit.beds === 0 ? "Studio" : `${unit.beds}BR`;
  const title = `${bedLabel} Unit${unit.unit_number ? ` #${unit.unit_number}` : ""} at ${building?.name ?? "Staycio"} | Staycio`;

  return {
    title,
    description: `${bedLabel}${unit.baths ? `, ${unit.baths} bath` : ""}${unit.sqft ? `, ${unit.sqft.toLocaleString()} sqft` : ""} at ${building?.name}. ${unit.is_available ? "Available now." : ""}`,
    // Canonical always uses the building's slug, never whichever form the
    // request happened to arrive on.
    alternates: {
      canonical: `${building ? buildingPath(building) : `/buildings/${id}`}/units/${unitId}`,
    },
    // noindex, follow.
    //
    // There are ~8,000 unit pages against 247 buildings. Each is a handful of
    // numbers that also appear on its building page, and each becomes a soft
    // 404 the moment the unit leases — exactly the churn-plus-thin-content mix
    // that drags a small site's crawl budget and index quality down. The link
    // equity still flows through to the building page via `follow`, and the
    // pages stay fully usable for anyone who lands on one.
    robots: { index: false, follow: true },
  };
}

export default async function UnitPage({
  params,
}: {
  params: Promise<{ id: string; unitId: string }>;
}) {
  const { id: buildingId, unitId } = await params;
  const supabase = createAdminClient();

  const { data: unit, error } = await getUnit(unitId);
  // The parent segment is the building's slug now, but every pre-026 link (and
  // anything Google already has) uses the UUID — accept either, and reject a
  // unit that does not belong to the building in the URL.
  const parent = unit?.buildings as { id: string; slug: string | null } | null;
  if (error || !unit || !parent || (parent.id !== buildingId && parent.slug !== buildingId)) {
    notFound();
  }

  // Canonicalise the parent segment the same way the building page does.
  if (parent.slug && buildingId !== parent.slug) {
    permanentRedirect(`/buildings/${parent.slug}/units/${unitId}`);
  }

  const building = Array.isArray(unit.buildings) ? unit.buildings[0] : unit.buildings;
  const city = building
    ? Array.isArray(building.cities) ? building.cities[0] : building.cities
    : null;
  const neighborhood = building
    ? Array.isArray(building.neighborhoods) ? building.neighborhoods[0] : building.neighborhoods
    : null;
  const floorplan = Array.isArray(unit.floorplans) ? unit.floorplans[0] : unit.floorplans;
  const buildingHref = buildingPath(parent);

  // Unit photos + price history, and — all keyed off the building id already
  // in hand — the building's photos (fallback gallery), its other available
  // units with verified prices, and its amenities. One round trip.
  const [imagesRes, pricesRes, buildingImagesRes, availableUnits, floorplansRes, amenitiesRes] =
    await Promise.all([
      supabase
        .from("unit_images")
        .select("id, url, alt_text, category, is_primary, sort_order")
        .eq("unit_id", unitId)
        .order("is_primary", { ascending: false })
        .order("sort_order", { ascending: true }),
      supabase
        .from("unit_price_snapshots")
        .select("rent, captured_at")
        .eq("unit_id", unitId)
        .order("captured_at", { ascending: false })
        .limit(90),
      supabase
        .from("building_images")
        .select("id, url, alt_text, category, is_primary, sort_order")
        .eq("building_id", parent.id)
        .order("is_primary", { ascending: false })
        .order("sort_order", { ascending: true })
        .limit(12),
      // Every available unit in the building with its verified rent, in one
      // paged read of the price view (it is units.* plus the latest price).
      fetchAvailableUnitPrices<AvailableUnitPrice & UnitRowSource & { floorplan_id: string | null }>(supabase, [parent.id], ["unit_number", "beds", "baths", "sqft", "available_on", "floorplan_id"]),
      supabase.from("floorplans").select("id, name").eq("building_id", parent.id),
      supabase
        .from("building_amenities")
        .select("amenities(name)")
        .eq("building_id", parent.id),
    ]);

  const images = imagesRes.data || [];
  const priceSnapshots = pricesRes.data || [];
  const buildingImages = (buildingImagesRes.data || []).filter((img) => !isJunkImageUrl(img.url));

  // Only a verified capture is quoted as the rent; older ones stay in the
  // price history chart, which is labelled as history.
  const latestPrice = isVerifiedPrice(priceSnapshots[0]?.rent, priceSnapshots[0]?.captured_at)
    ? priceSnapshots[0].rent
    : undefined;

  // Build price history for chart (oldest→newest, one point per day)
  const priceByDay: Record<string, number> = {};
  for (const snap of [...priceSnapshots].reverse()) {
    const day = snap.captured_at.split("T")[0];
    priceByDay[day] = snap.rent;
  }
  const priceHistory = Object.entries(priceByDay).map(([date, price]) => ({ date, price }));

  const bedLabel = unit.beds === 0 ? "Studio" : `${unit.beds} Bed${unit.beds !== 1 ? "s" : ""}`;
  const unitLabel = unit.unit_number ? `Unit ${unit.unit_number}` : "Unit";

  const today = todayKey(timeZoneForState(city?.state));
  const avail = availability(unit.available_on, today);

  // Other available units: same layout first, then cheapest verified rent.
  const planNames = new Map((floorplansRes.data || []).map((fp) => [fp.id, fp.name]));
  const siblings: UnitRowData[] = availableUnits
    .filter((u) => u.id !== unitId)
    .map((u) =>
      toUnitRowData(u, {
        basePath: buildingHref,
        today,
        price: u.latest_rent,
        planName: u.floorplan_id ? planNames.get(u.floorplan_id) ?? null : null,
      })
    )
    .sort(compareSiblingRows(unit.beds));
  const sameLayoutCount =
    unit.beds == null ? 0 : siblings.filter((s) => s.beds === unit.beds).length;
  // Everything the building page's list shows: the siblings, plus this unit
  // when it is itself still available.
  const availableCount = siblings.length + (unit.is_available ? 1 : 0);

  const amenityNames = (amenitiesRes.data || [])
    .map((a) => {
      const am = a.amenities as { name: string } | { name: string }[] | null;
      return Array.isArray(am) ? am[0]?.name : am?.name;
    })
    .filter((n): n is string => !!n);

  const buildingFacts = [
    neighborhood ? (neighborhood as { name: string }).name : null,
    building?.year_built ? `Built ${building.year_built}` : null,
    building?.stories ? `${building.stories} stories` : null,
    availableCount > 0
      ? `${availableCount} unit${availableCount === 1 ? "" : "s"} available`
      : null,
  ].filter(Boolean);

  const petPolicy = policyText(building?.pet_policy);
  const parkingPolicy = policyText(building?.parking_policy);
  const depositPolicy = policyText(building?.deposit_policy);

  const pricePerSqft = latestPrice && unit.sqft ? latestPrice / unit.sqft : null;

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1">
        {/* Hero */}
        <div className="bg-gradient-to-b from-muted/50 to-background">
          <div className="mx-auto w-full max-w-7xl px-4 pt-20 pb-6 sm:px-6 md:pt-24 md:pb-8">
            <Breadcrumb
              items={[
                { label: "Search", href: "/search" },
                ...(city ? [{ label: city.name, href: `/search?city=${city.slug}` }] : []),
                ...(building ? [{ label: building.name, href: buildingHref }] : []),
                { label: unitLabel },
              ]}
              className="mb-6"
            />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
              {/* Gallery — the unit's own photos, else the building's (tagged
                  so nobody mistakes a lobby for the unit), else a placeholder */}
              <div className="min-w-0 lg:col-span-2">
                {images.length > 0 ? (
                  <UnitGallery images={images} unitLabel={unitLabel} />
                ) : buildingImages.length > 0 ? (
                  <UnitGallery
                    images={buildingImages}
                    unitLabel={building?.name ?? unitLabel}
                    sourceLabel="Building photos"
                  />
                ) : (
                  <div className="relative h-56 md:h-80 rounded-xl overflow-hidden border border-white/[0.06]">
                    <ListingPlaceholder
                      seed={unitId}
                      name={unit.unit_number ? `${building?.name ?? ""} · Unit ${unit.unit_number}` : building?.name}
                    />
                  </div>
                )}
              </div>

              {/* Quick Info */}
              <div className="min-w-0 space-y-5">
                <div>
                  {neighborhood && <Badge className="mb-2">{(neighborhood as { name: string }).name}</Badge>}
                  <h1 className="text-2xl md:text-3xl font-bold">
                    {bedLabel}
                    {unit.unit_number && <span className="text-muted-foreground font-normal"> · Unit {unit.unit_number}</span>}
                  </h1>
                  {building && (
                    <Link
                      href={buildingHref}
                      className="text-sm text-muted-foreground hover:text-foreground mt-1 inline-flex min-h-11 items-center gap-1.5"
                    >
                      <Building2 className="h-3.5 w-3.5" />
                      {building.name}
                    </Link>
                  )}
                </div>

                {/* Specs */}
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className="gap-1 text-sm py-1 px-3">
                    <Bed className="h-3.5 w-3.5" />
                    {bedLabel}
                  </Badge>
                  {unit.baths && (
                    <Badge variant="secondary" className="gap-1 text-sm py-1 px-3">
                      <Bath className="h-3.5 w-3.5" />
                      {unit.baths} Bath{unit.baths !== 1 ? "s" : ""}
                    </Badge>
                  )}
                  {unit.sqft && (
                    <Badge variant="secondary" className="gap-1 text-sm py-1 px-3">
                      <Square className="h-3.5 w-3.5" />
                      {unit.sqft.toLocaleString()} sqft
                    </Badge>
                  )}
                  {unit.floor && (
                    <Badge variant="outline" className="gap-1 text-sm py-1 px-3">
                      Floor {unit.floor}
                    </Badge>
                  )}
                </div>

                {/* Price. An unavailable unit shows none: its last rent is at
                    best stale, and for the generated units hidden 2026-09-23
                    it was never real. */}
                {!unit.is_available ? null : latestPrice ? (
                  <div>
                    <p className="text-sm text-muted-foreground">Monthly rent</p>
                    <p className="text-3xl font-bold tabular-nums">
                      {formatPrice(latestPrice)}
                      <span className="text-lg font-normal text-muted-foreground">/mo</span>
                    </p>
                  </div>
                ) : (
                  <p className="text-lg font-semibold">Contact for pricing</p>
                )}

                {/* Availability */}
                {unit.is_available ? (
                  <div className="flex items-center gap-2.5 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.08] px-4 py-3">
                    {avail.now ? (
                      <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:hidden" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                      </span>
                    ) : (
                      <CalendarDays className="h-4 w-4 shrink-0 text-emerald-300" />
                    )}
                    <p className="text-sm font-medium text-emerald-100">{avail.label}</p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
                    <p className="text-sm text-muted-foreground">Not currently available</p>
                  </div>
                )}

                {building && (
                  <BuildingContactButtons
                    buildingId={parent.id}
                    buildingName={building.name}
                    citySlug={city?.slug || ""}
                    leasingEmail={building.leasing_email}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
            <div className="min-w-0 space-y-6 lg:col-span-2">
              {/* Floor Plan */}
              {floorplan?.layout_image_url && (
                <Card>
                  <CardHeader className="p-4 sm:p-6">
                    <CardTitle as="h2" className="flex items-center gap-2 text-lg">
                      <Layout className="h-5 w-5" />
                      Floor Plan
                      {floorplan.name && <span className="text-muted-foreground font-normal text-base">· {floorplan.name}</span>}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
                    <div className="relative w-full max-w-lg mx-auto">
                      <Image
                        src={floorplan.layout_image_url}
                        alt={`${floorplan.name ?? "Floor plan"} layout`}
                        width={600}
                        height={450}
                        className="rounded-lg object-contain w-full"
                      />
                    </div>
                    <div className="flex flex-wrap gap-3 mt-4 justify-center text-sm text-muted-foreground">
                      {floorplan.beds !== null && (
                        <span>{floorplan.beds === 0 ? "Studio" : `${floorplan.beds} bed`}</span>
                      )}
                      {floorplan.baths !== null && <span>· {floorplan.baths} bath</span>}
                      {(floorplan.sqft_min || floorplan.sqft_max) && (
                        <span>
                          ·{" "}
                          {floorplan.sqft_min === floorplan.sqft_max
                            ? `${floorplan.sqft_min?.toLocaleString()} sqft`
                            : `${floorplan.sqft_min?.toLocaleString()}–${floorplan.sqft_max?.toLocaleString()} sqft`}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Price History */}
              {unit.is_available && priceHistory.length > 1 && (
                <Card>
                  <CardHeader className="p-4 sm:p-6">
                    <CardTitle as="h2" className="flex items-center gap-2 text-lg">
                      <TrendingUp className="h-5 w-5" />
                      Price History
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
                    <UnitPriceHistory data={priceHistory} />
                  </CardContent>
                </Card>
              )}

              {/* More units in the same building — the natural next step when
                  this one is not quite right */}
              {building && siblings.length > 0 && (
                <Card>
                  <CardHeader className="p-4 sm:p-6">
                    <CardTitle as="h2" className="text-lg">
                      More units at {building.name}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {sameLayoutCount > 0
                        ? `${sameLayoutCount} other ${unit.beds === 0 ? "studio" : `${unit.beds}-bedroom`}${sameLayoutCount === 1 ? "" : "s"} first, then other layouts`
                        : "Lowest rent first"}
                    </p>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
                    <ul className="flex flex-col gap-2">
                      {siblings.slice(0, MORE_UNITS).map((s) => (
                        <UnitRow key={s.id} unit={s} />
                      ))}
                    </ul>
                    <Link
                      href={`${buildingHref}#available-units`}
                      className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] text-sm font-medium text-white/90 transition-colors hover:border-white/25 hover:bg-white/[0.06]"
                    >
                      {siblings.length > MORE_UNITS
                        ? `See all ${availableCount} units at ${building.name}`
                        : `View ${building.name}`}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </CardContent>
                </Card>
              )}

              {/* Building summary */}
              {building && (
                <Card>
                  <CardHeader className="p-4 sm:p-6">
                    <CardTitle as="h2" className="text-lg">About {building.name}</CardTitle>
                    <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {building.address_1}
                      {city ? `, ${city.name}, ${city.state}` : ""}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4 px-4 pb-4 sm:px-6 sm:pb-6">
                    {buildingFacts.length > 0 && (
                      <p className="text-sm text-white/80">{buildingFacts.join(" · ")}</p>
                    )}
                    {amenityNames.length > 0 && (
                      <ul className="flex flex-wrap gap-2">
                        {amenityNames.slice(0, AMENITY_CHIPS).map((name) => (
                          <li
                            key={name}
                            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-white/80"
                          >
                            <Check className="h-3 w-3 text-cyan-300" />
                            {name}
                          </li>
                        ))}
                        {amenityNames.length > AMENITY_CHIPS && (
                          <li className="inline-flex items-center px-1 py-1 text-xs text-muted-foreground">
                            +{amenityNames.length - AMENITY_CHIPS} more
                          </li>
                        )}
                      </ul>
                    )}
                    <Link
                      href={buildingHref}
                      className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-cyan-300 hover:text-cyan-200"
                    >
                      Photos, amenities &amp; policies
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Sidebar — short enough to stay in view while the left column scrolls */}
            <aside className="min-w-0">
              <div className="space-y-6 lg:sticky lg:top-24">
                {/* Unit Details */}
                <Card>
                  <CardHeader className="p-4 sm:p-6">
                    <CardTitle as="h2" className="text-base">Unit Details</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
                    <dl className="space-y-2.5 text-sm">
                      {unit.unit_number && <DetailRow label="Unit" value={unit.unit_number} />}
                      {floorplan?.name && <DetailRow label="Floor plan" value={floorplan.name} />}
                      {unit.floor && <DetailRow label="Floor" value={unit.floor} />}
                      {unit.beds !== null && (
                        <DetailRow label="Bedrooms" value={unit.beds === 0 ? "Studio" : unit.beds} />
                      )}
                      {unit.baths !== null && <DetailRow label="Bathrooms" value={unit.baths} />}
                      {unit.sqft && <DetailRow label="Square feet" value={unit.sqft.toLocaleString()} />}
                      {unit.is_available && latestPrice && (
                        <DetailRow label="Rent" value={`${formatPrice(latestPrice)}/mo`} />
                      )}
                      {unit.is_available && pricePerSqft && (
                        <DetailRow label="Rent per sq ft" value={`$${pricePerSqft.toFixed(2)}`} />
                      )}
                      {unit.is_available && (
                        <DetailRow label="Move-in" value={avail.now ? "Now" : avail.short} />
                      )}
                    </dl>
                  </CardContent>
                </Card>

                {/* Policies */}
                {(petPolicy || parkingPolicy || depositPolicy) && (
                  <Card>
                    <CardHeader className="p-4 sm:p-6">
                      <CardTitle as="h2" className="text-base">Policies</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 px-4 pb-4 text-sm sm:px-6 sm:pb-6">
                      {petPolicy && (
                        <div>
                          <p className="font-medium">Pets</p>
                          <p className="text-muted-foreground">{petPolicy}</p>
                        </div>
                      )}
                      {parkingPolicy && (
                        <div>
                          <p className="font-medium">Parking</p>
                          <p className="text-muted-foreground">{parkingPolicy}</p>
                        </div>
                      )}
                      {depositPolicy && (
                        <div>
                          <p className="font-medium">Deposit</p>
                          <p className="text-muted-foreground">{depositPolicy}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            </aside>
          </div>
        </div>
      </main>

      {building && (
        <StickyMobileCTA
          buildingId={parent.id}
          buildingName={building.name}
          citySlug={city?.slug || ""}
          price={latestPrice}
        />
      )}

      <Footer />
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
