"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useCompare } from "@/hooks/useCompare";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  X,
  Loader2,
  Check,
  Minus,
  ArrowLeft,
  PawPrint,
  Car,
} from "lucide-react";
import { formatPrice } from "@/lib/utils";

interface CompareData {
  captured_at_max: string | null;
  building_a: BuildingData;
  building_b: BuildingData;
  deltas: {
    amenities_only_in_a: string[];
    amenities_only_in_b: string[];
  };
}

interface BuildingData {
  id: string;
  name: string;
  address_1: string;
  zip: string;
  amenities: string[];
  policies: {
    pets: string | null;
    parking: string | null;
  };
  price_stats: {
    by_beds: Record<string, { min: number; median: number; max: number }>;
  };
}

export default function ComparePage() {
  const { buildings, removeBuilding, clearAll, canCompare } = useCompare();
  const [compareData, setCompareData] = useState<CompareData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (buildings.length >= 2) {
      fetchComparison();
    } else {
      setCompareData(null);
    }
  }, [buildings]);

  const fetchComparison = async () => {
    if (buildings.length < 2) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          building_a_id: buildings[0].id,
          building_b_id: buildings[1].id,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to compare buildings");
      }

      const data = await response.json();
      setCompareData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const allAmenities = compareData
    ? [
        ...new Set([
          ...compareData.building_a.amenities,
          ...compareData.building_b.amenities,
        ]),
      ].sort()
    : [];

  const allBedTypes = compareData
    ? [
        ...new Set([
          ...Object.keys(compareData.building_a.price_stats.by_beds),
          ...Object.keys(compareData.building_b.price_stats.by_beds),
        ]),
      ].sort((a, b) => Number(a) - Number(b))
    : [];

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 bg-muted/30">
        <div className="container mx-auto px-4 pt-20 pb-8 md:pt-24">
          <Link
            href="/search"
            className="mb-4 md:mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to search
          </Link>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 md:mb-8">
            <h1 className="text-2xl md:text-3xl font-bold">Compare Buildings</h1>
            {buildings.length > 0 && (
              <Button variant="ghost" onClick={clearAll}>
                Clear All
              </Button>
            )}
          </div>

          {/* Selected Buildings */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8">
            {buildings.map((building) => (
              <Card key={building.id} className="relative">
                <button
                  onClick={() => removeBuilding(building.id)}
                  className="absolute top-2 right-2 p-1 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors z-10"
                >
                  <X className="h-4 w-4" />
                </button>
                <Link href={`/buildings/${building.id}`}>
                  <div className="relative h-32 bg-muted">
                    {building.image ? (
                      <Image
                        src={building.image}
                        alt={building.name}
                        fill
                        className="object-cover rounded-t-lg"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Building2 className="h-12 w-12 text-muted-foreground/30" />
                      </div>
                    )}
                  </div>
                </Link>
                <CardContent className="p-4">
                  <h3 className="font-semibold truncate">{building.name}</h3>
                  {building.neighborhood && (
                    <p className="text-sm text-muted-foreground truncate">
                      {building.neighborhood}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}

            {buildings.length < 3 && (
              <Card className="border-dashed">
                <Link href="/search">
                  <CardContent className="flex flex-col items-center justify-center h-full min-h-[200px] text-muted-foreground hover:text-foreground transition-colors">
                    <Building2 className="h-12 w-12 mb-2 opacity-30" />
                    <p className="text-sm">Add a building to compare</p>
                  </CardContent>
                </Link>
              </Card>
            )}
          </div>

          {/* Comparison Results */}
          {!canCompare ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Building2 className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
                <h2 className="text-xl font-semibold mb-2">
                  Select at least 2 buildings to compare
                </h2>
                <p className="text-muted-foreground mb-4">
                  Browse listings and click the compare button to add buildings.
                </p>
                <Link href="/search">
                  <Button>Browse Listings</Button>
                </Link>
              </CardContent>
            </Card>
          ) : loading ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Loading comparison...</p>
              </CardContent>
            </Card>
          ) : error ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-red-500 mb-4">{error}</p>
                <Button onClick={fetchComparison}>Try Again</Button>
              </CardContent>
            </Card>
          ) : compareData ? (
            <div className="space-y-6">
              {/* Price Comparison */}
              <Card>
                <CardHeader>
                  <CardTitle>Pricing by Bedroom</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-3 px-4 font-medium">
                            Bedrooms
                          </th>
                          <th className="text-left py-3 px-4 font-medium">
                            {compareData.building_a.name}
                          </th>
                          <th className="text-left py-3 px-4 font-medium">
                            {compareData.building_b.name}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {allBedTypes.map((beds) => {
                          const aPrice =
                            compareData.building_a.price_stats.by_beds[beds];
                          const bPrice =
                            compareData.building_b.price_stats.by_beds[beds];
                          const bedsLabel =
                            beds === "0" ? "Studio" : `${beds} BR`;

                          return (
                            <tr key={beds} className="border-b">
                              <td className="py-3 px-4">{bedsLabel}</td>
                              <td className="py-3 px-4">
                                {aPrice ? (
                                  <div>
                                    <span className="font-semibold">
                                      {formatPrice(aPrice.median)}
                                    </span>
                                    <span className="text-sm text-muted-foreground ml-1">
                                      /mo
                                    </span>
                                    <p className="text-xs text-muted-foreground">
                                      {formatPrice(aPrice.min)} -{" "}
                                      {formatPrice(aPrice.max)}
                                    </p>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">
                                    N/A
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4">
                                {bPrice ? (
                                  <div>
                                    <span className="font-semibold">
                                      {formatPrice(bPrice.median)}
                                    </span>
                                    <span className="text-sm text-muted-foreground ml-1">
                                      /mo
                                    </span>
                                    <p className="text-xs text-muted-foreground">
                                      {formatPrice(bPrice.min)} -{" "}
                                      {formatPrice(bPrice.max)}
                                    </p>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">
                                    N/A
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {allBedTypes.length === 0 && (
                          <tr>
                            <td
                              colSpan={3}
                              className="py-6 text-center text-muted-foreground"
                            >
                              No pricing data available
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Policies Comparison */}
              <Card>
                <CardHeader>
                  <CardTitle>Policies</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-6 md:grid-cols-2">
                    {/* Pets */}
                    <div>
                      <h4 className="font-medium flex items-center gap-2 mb-3">
                        <PawPrint className="h-4 w-4" />
                        Pet Policy
                      </h4>
                      <div className="space-y-2">
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="text-sm font-medium">
                            {compareData.building_a.name}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {compareData.building_a.policies.pets ||
                              "Not specified"}
                          </p>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="text-sm font-medium">
                            {compareData.building_b.name}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {compareData.building_b.policies.pets ||
                              "Not specified"}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Parking */}
                    <div>
                      <h4 className="font-medium flex items-center gap-2 mb-3">
                        <Car className="h-4 w-4" />
                        Parking
                      </h4>
                      <div className="space-y-2">
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="text-sm font-medium">
                            {compareData.building_a.name}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {compareData.building_a.policies.parking ||
                              "Not specified"}
                          </p>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="text-sm font-medium">
                            {compareData.building_b.name}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {compareData.building_b.policies.parking ||
                              "Not specified"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Amenities Comparison */}
              <Card>
                <CardHeader>
                  <CardTitle>Amenities</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-3 px-4 font-medium">
                            Amenity
                          </th>
                          <th className="text-center py-3 px-4 font-medium">
                            {compareData.building_a.name}
                          </th>
                          <th className="text-center py-3 px-4 font-medium">
                            {compareData.building_b.name}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {allAmenities.map((amenity) => {
                          const hasA =
                            compareData.building_a.amenities.includes(amenity);
                          const hasB =
                            compareData.building_b.amenities.includes(amenity);

                          return (
                            <tr key={amenity} className="border-b">
                              <td className="py-3 px-4">{amenity}</td>
                              <td className="py-3 px-4 text-center">
                                {hasA ? (
                                  <Check className="h-5 w-5 text-green-500 mx-auto" />
                                ) : (
                                  <Minus className="h-5 w-5 text-muted-foreground mx-auto" />
                                )}
                              </td>
                              <td className="py-3 px-4 text-center">
                                {hasB ? (
                                  <Check className="h-5 w-5 text-green-500 mx-auto" />
                                ) : (
                                  <Minus className="h-5 w-5 text-muted-foreground mx-auto" />
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {allAmenities.length === 0 && (
                          <tr>
                            <td
                              colSpan={3}
                              className="py-6 text-center text-muted-foreground"
                            >
                              No amenity data available
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Unique Amenities */}
              {(compareData.deltas.amenities_only_in_a.length > 0 ||
                compareData.deltas.amenities_only_in_b.length > 0) && (
                <div className="grid gap-4 md:grid-cols-2">
                  {compareData.deltas.amenities_only_in_a.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">
                          Only at {compareData.building_a.name}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-2">
                          {compareData.deltas.amenities_only_in_a.map((a) => (
                            <Badge key={a} variant="secondary">
                              {a}
                            </Badge>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  {compareData.deltas.amenities_only_in_b.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">
                          Only at {compareData.building_b.name}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-2">
                          {compareData.deltas.amenities_only_in_b.map((a) => (
                            <Badge key={a} variant="secondary">
                              {a}
                            </Badge>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </main>

      <Footer />
    </div>
  );
}
