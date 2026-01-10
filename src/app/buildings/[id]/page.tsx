import { notFound } from "next/navigation";
import Link from "next/link";
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
} from "lucide-react";

interface BuildingPageProps {
  params: Promise<{ id: string }>;
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

  // Fetch available units with latest prices
  const { data: units } = await supabase
    .from("units")
    .select("*")
    .eq("building_id", id)
    .eq("is_available", true)
    .order("beds", { ascending: true });

  // Get latest prices for units
  const unitPrices: Record<string, { rent: number; captured_at: string }> = {};
  if (units?.length) {
    const unitIds = units.map((u) => u.id);
    const { data: prices } = await supabase
      .from("unit_price_snapshots")
      .select("unit_id, rent, captured_at")
      .in("unit_id", unitIds)
      .order("captured_at", { ascending: false });

    for (const p of prices || []) {
      if (!unitPrices[p.unit_id]) {
        unitPrices[p.unit_id] = { rent: p.rent, captured_at: p.captured_at };
      }
    }
  }

  // Calculate price range
  const prices = Object.values(unitPrices).map((p) => p.rent);
  const priceRange = prices.length
    ? { min: Math.min(...prices), max: Math.max(...prices) }
    : null;

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1">
        {/* Hero/Header */}
        <div className="bg-gradient-to-b from-muted/50 to-background">
          <div className="container mx-auto px-4 py-8">
            <Link
              href="/search"
              className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to search
            </Link>

            <div className="grid gap-8 lg:grid-cols-3">
              {/* Image */}
              <div className="lg:col-span-2">
                <div className="relative h-64 md:h-96 rounded-xl bg-gradient-to-br from-muted to-muted/50 overflow-hidden">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Building2 className="h-24 w-24 text-muted-foreground/30" />
                  </div>
                </div>
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

                <div className="flex flex-col gap-3">
                  <Button size="lg" className="w-full">
                    Request a Tour
                  </Button>
                  <Button size="lg" variant="outline" className="w-full">
                    Contact Leasing
                  </Button>
                </div>

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
                        return (
                          <div
                            key={unit.id}
                            className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4"
                          >
                            <div className="flex flex-wrap gap-3">
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
                            <div className="flex items-center gap-4">
                              {price ? (
                                <span className="text-lg font-bold">
                                  {formatPrice(price.rent)}
                                  <span className="text-sm font-normal text-muted-foreground">/mo</span>
                                </span>
                              ) : (
                                <span className="text-muted-foreground">Contact for pricing</span>
                              )}
                              <Button size="sm">View</Button>
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
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
