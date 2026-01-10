"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Search, SlidersHorizontal, Building2, MapPin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { formatPrice } from "@/lib/utils";

interface BuildingResult {
  id: string;
  name: string;
  address: string;
  zip: string | null;
  year_built: number | null;
  stories: number | null;
  pet_policy: string | null;
  description: string | null;
  city: { id: string; name: string; slug: string } | null;
  neighborhood: { id: string; name: string; slug: string } | null;
  rent_min: number | null;
  rent_max: number | null;
  image: string | null;
  move_in_specials: string | null;
  total_units: number | null;
}

interface BrowseResponse {
  total: number;
  results: BuildingResult[];
}

export default function SearchPage() {
  const [city, setCity] = useState("miami");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const [results, setResults] = useState<BuildingResult[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        city_slug: city,
        limit: 50,
      };

      const res = await fetch("/api/browse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data: BrowseResponse = await res.json();
        let filtered = data.results;

        // Client-side budget filtering
        if (budgetMin) {
          const min = parseInt(budgetMin);
          filtered = filtered.filter(b => !b.rent_min || b.rent_min >= min);
        }
        if (budgetMax) {
          const max = parseInt(budgetMax);
          filtered = filtered.filter(b => !b.rent_max || b.rent_max <= max);
        }

        setResults(filtered);
      }
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    handleSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city]);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 bg-muted/30">
        <div className="container mx-auto px-4 py-8">
          {/* Search Bar */}
          <div className="mb-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search buildings, neighborhoods..."
                  className="h-12 pl-10"
                />
              </div>

              <Select value={city} onValueChange={setCity}>
                <SelectTrigger className="h-12 w-full md:w-[180px]">
                  <SelectValue placeholder="Select city" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="miami">Miami</SelectItem>
                  <SelectItem value="new-york">New York City</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                className="h-12"
                onClick={() => setShowFilters(!showFilters)}
              >
                <SlidersHorizontal className="mr-2 h-4 w-4" />
                Filters
              </Button>

              <Button className="h-12" onClick={handleSearch}>
                Search
              </Button>
            </div>

            {/* Filters Panel */}
            {showFilters && (
              <div className="mt-4 rounded-lg border bg-background p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">Filters</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowFilters(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium">Min Budget</label>
                    <Input
                      type="number"
                      placeholder="$0"
                      value={budgetMin}
                      onChange={(e) => setBudgetMin(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium">Max Budget</label>
                    <Input
                      type="number"
                      placeholder="No max"
                      value={budgetMax}
                      onChange={(e) => setBudgetMax(e.target.value)}
                    />
                  </div>
                </div>

                <div className="mt-4 flex gap-2">
                  <Button onClick={handleSearch}>Apply Filters</Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setBudgetMin("");
                      setBudgetMax("");
                    }}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Results Header */}
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">
                {results.length} {results.length === 1 ? "Building" : "Buildings"} Found
              </h1>
              <p className="text-sm text-muted-foreground">
                Luxury apartments in {city === "miami" ? "Miami" : city === "new-york" ? "New York City" : city}
              </p>
            </div>
          </div>

          {/* Results Grid */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {loading ? (
              // Loading skeletons
              Array.from({ length: 6 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-0">
                    <Skeleton className="h-48 w-full rounded-t-xl" />
                    <div className="p-4 space-y-3">
                      <Skeleton className="h-6 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                      <Skeleton className="h-8 w-24" />
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : results.length === 0 ? (
              <div className="col-span-full py-12 text-center">
                <Building2 className="mx-auto h-12 w-12 text-muted-foreground" />
                <h3 className="mt-4 text-lg font-semibold">No buildings found</h3>
                <p className="mt-2 text-muted-foreground">
                  Try adjusting your filters or searching in a different city
                </p>
              </div>
            ) : (
              results.map((building) => (
                <Link
                  key={building.id}
                  href={`/buildings/${building.id}`}
                >
                  <Card className="group h-full cursor-pointer overflow-hidden transition-all hover:shadow-lg hover:-translate-y-1">
                    <CardContent className="p-0">
                      {/* Image */}
                      <div className="relative h-48 bg-gradient-to-br from-muted to-muted/50">
                        {building.image ? (
                          <img
                            src={building.image}
                            alt={building.name}
                            className="absolute inset-0 h-full w-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Building2 className="h-16 w-16 text-muted-foreground/30" />
                          </div>
                        )}
                        {building.neighborhood && (
                          <Badge className="absolute top-3 left-3" variant="secondary">
                            {building.neighborhood.name}
                          </Badge>
                        )}
                        {building.move_in_specials && (
                          <Badge className="absolute top-3 right-3 bg-green-600">
                            Special Offer
                          </Badge>
                        )}
                      </div>

                      <div className="p-4">
                        <h3 className="font-semibold group-hover:text-primary transition-colors">
                          {building.name}
                        </h3>
                        <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {building.address}
                        </p>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {building.year_built && (
                            <Badge variant="outline">
                              Built {building.year_built}
                            </Badge>
                          )}
                          {building.stories && (
                            <Badge variant="outline">
                              {building.stories} floors
                            </Badge>
                          )}
                        </div>

                        <div className="mt-4 flex items-end justify-between">
                          <div>
                            {building.rent_min ? (
                              <>
                                <span className="text-xl font-bold">
                                  {formatPrice(building.rent_min)}
                                </span>
                                {building.rent_max && building.rent_max !== building.rent_min && (
                                  <span className="text-muted-foreground">
                                    {" "}- {formatPrice(building.rent_max)}
                                  </span>
                                )}
                                <span className="text-muted-foreground">/mo</span>
                              </>
                            ) : (
                              <span className="text-muted-foreground">Contact for pricing</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
