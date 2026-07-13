import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { StickyMobileCTA } from "@/components/ui/StickyMobileCTA";
import { BuildingContactButtons } from "../../BuildingContactButtons";
import { formatPrice, formatDate } from "@/lib/utils";
import { getUnitFallbackImages } from "@/lib/images/fallback";
import {
  ArrowLeft,
  Bed,
  Bath,
  Square,
  Building2,
  TrendingUp,
  Layout,
} from "lucide-react";
import { UnitGallery } from "./UnitGallery";
import { UnitPriceHistory } from "./UnitPriceHistory";

export const revalidate = 3600;

export async function generateStaticParams() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("units")
    .select("id, building_id")
    .eq("is_available", true);
  return (data || []).map((u) => ({ id: u.building_id, unitId: u.id }));
}

const getUnit = cache(async (unitId: string) => {
  const supabase = createAdminClient();
  return supabase
    .from("units")
    .select(`
      *,
      buildings:building_id (
        id, name, address_1, address_2, zip, leasing_email, leasing_phone,
        pet_policy, parking_policy, deposit_policy,
        cities:city_id (id, name, slug, state),
        neighborhoods:neighborhood_id (id, name, slug)
      ),
      floorplans:floorplan_id (
        id, name, beds, baths, sqft_min, sqft_max, layout_image_url
      )
    `)
    .eq("id", unitId)
    .single();
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; unitId: string }>;
}): Promise<Metadata> {
  const { unitId } = await params;
  const { data: unit } = await getUnit(unitId);
  if (!unit) return { title: "Unit Not Found - Staycio" };

  const building = Array.isArray(unit.buildings) ? unit.buildings[0] : unit.buildings;
  const bedLabel = unit.beds === 0 ? "Studio" : `${unit.beds}BR`;
  const title = `${bedLabel} Unit${unit.unit_number ? ` #${unit.unit_number}` : ""} at ${building?.name ?? "Staycio"} | Staycio`;

  return {
    title,
    description: `${bedLabel}${unit.baths ? `, ${unit.baths} bath` : ""}${unit.sqft ? `, ${unit.sqft.toLocaleString()} sqft` : ""} at ${building?.name}. ${unit.is_available ? "Available now." : ""}`,
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
  if (error || !unit || (unit.buildings as { id: string } | null)?.id !== buildingId) {
    notFound();
  }

  const building = Array.isArray(unit.buildings) ? unit.buildings[0] : unit.buildings;
  const city = building
    ? Array.isArray(building.cities) ? building.cities[0] : building.cities
    : null;
  const neighborhood = building
    ? Array.isArray(building.neighborhoods) ? building.neighborhoods[0] : building.neighborhoods
    : null;
  const floorplan = Array.isArray(unit.floorplans) ? unit.floorplans[0] : unit.floorplans;

  // Fetch unit images and price history in parallel
  const [imagesRes, pricesRes] = await Promise.all([
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
  ]);

  let images = imagesRes.data || [];
  const priceSnapshots = pricesRes.data || [];

  // Use fallbacks if no images
  if (images.length === 0) {
    const fallbacks = getUnitFallbackImages(unitId, building?.name ?? "", unit.unit_number);
    images = fallbacks.map((f) => ({
      id: f.id,
      url: f.url,
      alt_text: f.alt_text,
      category: f.category,
      is_primary: f.id.endsWith("-0"),
      sort_order: 0,
    }));
  }

  const latestPrice = priceSnapshots[0]?.rent;

  // Build price history for chart (oldest→newest, one point per day)
  const priceByDay: Record<string, number> = {};
  for (const snap of [...priceSnapshots].reverse()) {
    const day = snap.captured_at.split("T")[0];
    priceByDay[day] = snap.rent;
  }
  const priceHistory = Object.entries(priceByDay).map(([date, price]) => ({ date, price }));

  const bedLabel = unit.beds === 0 ? "Studio" : `${unit.beds} Bed${unit.beds !== 1 ? "s" : ""}`;

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1">
        {/* Hero */}
        <div className="bg-gradient-to-b from-muted/50 to-background">
          <div className="container mx-auto px-4 pt-20 pb-6 md:pt-24 md:pb-8">
            <Breadcrumb
              items={[
                { label: "Search", href: "/search" },
                ...(city ? [{ label: city.name, href: `/search?city=${city.slug}` }] : []),
                ...(building ? [{ label: building.name, href: `/buildings/${buildingId}` }] : []),
                { label: unit.unit_number ? `Unit ${unit.unit_number}` : "Unit" },
              ]}
              className="mb-6"
            />

            <div className="grid gap-8 lg:grid-cols-3">
              {/* Gallery */}
              <div className="lg:col-span-2">
                <UnitGallery images={images} unitLabel={unit.unit_number ? `Unit ${unit.unit_number}` : "Unit"} />
              </div>

              {/* Quick Info */}
              <div className="space-y-5">
                <div>
                  {neighborhood && <Badge className="mb-2">{(neighborhood as { name: string }).name}</Badge>}
                  <h1 className="text-2xl md:text-3xl font-bold">
                    {bedLabel}
                    {unit.unit_number && <span className="text-muted-foreground font-normal"> · Unit {unit.unit_number}</span>}
                  </h1>
                  {building && (
                    <Link
                      href={`/buildings/${buildingId}`}
                      className="text-sm text-muted-foreground hover:text-primary mt-1 inline-flex items-center gap-1"
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

                {/* Price */}
                {latestPrice ? (
                  <div>
                    <p className="text-sm text-muted-foreground">Monthly rent</p>
                    <p className="text-3xl font-bold">
                      {formatPrice(latestPrice)}
                      <span className="text-lg font-normal text-muted-foreground">/mo</span>
                    </p>
                  </div>
                ) : (
                  <p className="text-muted-foreground">Contact for pricing</p>
                )}

                {/* Availability */}
                {unit.is_available ? (
                  <div className="rounded-lg bg-green-500/10 border border-green-500/30 px-4 py-3">
                    <p className="text-sm font-medium text-green-700 dark:text-green-400">
                      Available{unit.available_on ? ` from ${formatDate(unit.available_on)}` : " now"}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg bg-muted px-4 py-3">
                    <p className="text-sm text-muted-foreground">Not currently available</p>
                  </div>
                )}

                {building && (
                  <BuildingContactButtons
                    buildingId={buildingId}
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
        <div className="container mx-auto px-4 py-8">
          <div className="grid gap-8 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              {/* Floor Plan */}
              {floorplan?.layout_image_url && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Layout className="h-5 w-5" />
                      Floor Plan
                      {floorplan.name && <span className="text-muted-foreground font-normal text-base">· {floorplan.name}</span>}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
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
              {priceHistory.length > 1 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5" />
                      Price History
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <UnitPriceHistory data={priceHistory} />
                  </CardContent>
                </Card>
              )}

              {/* Back to Building */}
              <Link href={`/buildings/${buildingId}`}>
                <Button variant="outline" className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  View all units at {building?.name}
                </Button>
              </Link>
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              {/* Policies */}
              {(building?.pet_policy || building?.parking_policy || building?.deposit_policy) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Policies</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {building.pet_policy && (
                      <div>
                        <p className="font-medium">Pets</p>
                        <p className="text-muted-foreground">{building.pet_policy}</p>
                      </div>
                    )}
                    {building.parking_policy && (
                      <div>
                        <p className="font-medium">Parking</p>
                        <p className="text-muted-foreground">{building.parking_policy}</p>
                      </div>
                    )}
                    {building.deposit_policy && (
                      <div>
                        <p className="font-medium">Deposit</p>
                        <p className="text-muted-foreground">{building.deposit_policy}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Unit Details */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Unit Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {unit.unit_number && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Unit</span>
                      <span className="font-medium">{unit.unit_number}</span>
                    </div>
                  )}
                  {unit.floor && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Floor</span>
                      <span className="font-medium">{unit.floor}</span>
                    </div>
                  )}
                  {unit.beds !== null && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Bedrooms</span>
                      <span className="font-medium">{unit.beds === 0 ? "Studio" : unit.beds}</span>
                    </div>
                  )}
                  {unit.baths !== null && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Bathrooms</span>
                      <span className="font-medium">{unit.baths}</span>
                    </div>
                  )}
                  {unit.sqft && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Square Feet</span>
                      <span className="font-medium">{unit.sqft.toLocaleString()}</span>
                    </div>
                  )}
                  {unit.available_on && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Available</span>
                      <span className="font-medium">{formatDate(unit.available_on)}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>

      {building && (
        <StickyMobileCTA
          buildingId={buildingId}
          buildingName={building.name}
          citySlug={city?.slug || ""}
          price={latestPrice}
        />
      )}

      <Footer />
    </div>
  );
}
