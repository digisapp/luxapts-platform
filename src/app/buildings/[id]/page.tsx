import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
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
  ArrowLeft,
  Layout,
  ImageIcon,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { ImageGallery } from "./ImageGallery";
import { BuildingPageClient } from "./BuildingPageClient";
import { BuildingContactButtons } from "./BuildingContactButtons";
import { StickyMobileCTA } from "@/components/ui/StickyMobileCTA";
import { Breadcrumb } from "@/components/ui/Breadcrumb";

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

interface BuildingImage {
  id: string;
  building_id: string;
  url: string;
  alt_text: string | null;
  category: string | null;
  is_primary: boolean;
  sort_order: number;
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
  const { id } = await params;
  const supabase = createAdminClient();

  // Fetch building with relations
  const { data: building, error } = await supabase
    .from("buildings")
    .select(`
      *,
      cities:city_id (id, name, slug, state),
      neighborhoods:neighborhood_id (id, name, slug)
    `)
    .eq("id", id)
    .single();

  if (error || !building) {
    notFound();
  }

  // Fetch amenities
  const { data: amenities } = await supabase
    .from("building_amenities")
    .select("details, amenities(id, name, category, icon)")
    .eq("building_id", id);

  // Fetch building facts (including images)
  const { data: facts } = await supabase
    .from("building_facts")
    .select("key, value")
    .eq("building_id", id);

  const buildingFacts: Record<string, string | number> = {};
  for (const fact of facts || []) {
    buildingFacts[fact.key] = fact.value as string | number;
  }

  // Fetch building images
  const { data: buildingImages } = await supabase
    .from("building_images")
    .select("*")
    .eq("building_id", id)
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true });

  // Fetch available units with latest prices
  const { data: units } = await supabase
    .from("units")
    .select("*")
    .eq("building_id", id)
    .eq("is_available", true)
    .order("beds", { ascending: true });

  // Get unit IDs for fetching related data
  const unitIds = units?.map((u) => u.id) || [];

  // Get latest prices for units
  const unitPrices: Record<string, { rent: number; captured_at: string }> = {};
  const allPriceSnapshots: { date: string; price: number }[] = [];

  if (unitIds.length) {
    const { data: prices } = await supabase
      .from("unit_price_snapshots")
      .select("unit_id, rent, captured_at")
      .in("unit_id", unitIds)
      .order("captured_at", { ascending: false });

    for (const p of prices || []) {
      if (!unitPrices[p.unit_id]) {
        unitPrices[p.unit_id] = { rent: p.rent, captured_at: p.captured_at };
      }
      // Collect all snapshots for price history
      allPriceSnapshots.push({ date: p.captured_at, price: p.rent });
    }
  }

  // Aggregate price history by date (average rent per date)
  const priceByDate: Record<string, { total: number; count: number }> = {};
  for (const snap of allPriceSnapshots) {
    const dateKey = snap.date.split("T")[0];
    if (!priceByDate[dateKey]) {
      priceByDate[dateKey] = { total: 0, count: 0 };
    }
    priceByDate[dateKey].total += snap.price;
    priceByDate[dateKey].count++;
  }

  const priceHistory = Object.entries(priceByDate)
    .map(([date, { total, count }]) => ({
      date,
      price: Math.round(total / count),
    }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Fetch unit images
  const unitImages: Record<string, UnitImage[]> = {};
  if (unitIds.length) {
    const { data: images } = await supabase
      .from("unit_images")
      .select("*")
      .in("unit_id", unitIds)
      .order("is_primary", { ascending: false })
      .order("sort_order", { ascending: true });

    for (const img of images || []) {
      if (!unitImages[img.unit_id]) {
        unitImages[img.unit_id] = [];
      }
      unitImages[img.unit_id].push(img);
    }
  }

  // Fetch floorplans for units
  const floorplanIds = [...new Set(units?.map(u => u.floorplan_id).filter(Boolean) || [])];
  const floorplans: Record<string, Floorplan> = {};
  if (floorplanIds.length) {
    const { data: fps } = await supabase
      .from("floorplans")
      .select("*")
      .in("id", floorplanIds);

    for (const fp of fps || []) {
      floorplans[fp.id] = fp;
    }
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

  // Add exterior image from building_facts if not already in building_images
  if (buildingFacts.image_exterior && !allImages.some(img => img.url === buildingFacts.image_exterior)) {
    allImages.unshift({
      url: buildingFacts.image_exterior as string,
      alt: `${building.name} exterior`,
      category: "exterior",
    });
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1">
        {/* Hero/Header */}
        <div className="bg-gradient-to-b from-muted/50 to-background">
          <div className="container mx-auto px-4 py-8">
            <Breadcrumb
              items={[
                { label: "Search", href: "/search" },
                ...(building.cities ? [{ label: building.cities.name, href: `/search?city=${building.cities.slug}` }] : []),
                ...(building.neighborhoods ? [{ label: building.neighborhoods.name, href: `/neighborhoods/${building.neighborhoods.slug}` }] : []),
                { label: building.name },
              ]}
              className="mb-6"
            />

            <div className="grid gap-8 lg:grid-cols-3">
              {/* Image Gallery */}
              <div className="lg:col-span-2">
                {allImages.length > 0 ? (
                  <ImageGallery images={allImages} buildingName={building.name} />
                ) : (
                  <div className="relative h-64 md:h-96 rounded-xl bg-gradient-to-br from-muted to-muted/50 overflow-hidden">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Building2 className="h-24 w-24 text-muted-foreground/30" />
                    </div>
                  </div>
                )}
                {buildingFacts.move_in_specials && (
                  <Badge className="mt-4 bg-green-600">
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
                  <h1 className="text-3xl font-bold">{building.name}</h1>
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
          <div className="grid gap-8 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-8">
              {/* Move-in Specials */}
              {buildingFacts.move_in_specials && (
                <Card className="border-green-500/50 bg-green-500/5">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-green-600">
                      <span className="text-xl">🎉</span> Move-in Special
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-green-700 dark:text-green-400 font-medium">
                      {buildingFacts.move_in_specials}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Description */}
              {building.description && (
                <Card>
                  <CardHeader>
                    <CardTitle>About</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">{building.description}</p>
                  </CardContent>
                </Card>
              )}

              {/* Available Units */}
              <Card>
                <CardHeader>
                  <CardTitle>Available Units ({units?.length || 0})</CardTitle>
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
                                    <Button size="sm" variant="outline" className="gap-1">
                                      <Layout className="h-3 w-3" />
                                      Floor Plan
                                    </Button>
                                  )}
                                  <Button size="sm">View</Button>
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
                    <CardTitle>Amenities</CardTitle>
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
                  <CardTitle>Policies</CardTitle>
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
                  <CardTitle>Building Details</CardTitle>
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
  );
}
