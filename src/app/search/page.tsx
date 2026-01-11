"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Search, SlidersHorizontal, Building2, MapPin, Bed, Bath, Square, X, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { formatPrice } from "@/lib/utils";

interface SearchResult {
  building: {
    id: string;
    name: string;
    address_1: string;
    zip: string;
    pet_policy: string | null;
    neighborhoods: { slug: string; name: string } | null;
  };
  unit: {
    id: string;
    unit_number: string | null;
    beds: number | null;
    baths: number | null;
    sqft: number | null;
    available_on: string | null;
  };
  pricing: {
    rent: number;
    net_effective_rent: number | null;
    captured_at: string;
  } | null;
}

interface SearchResponse {
  city: string;
  captured_at_max: string | null;
  results: SearchResult[];
}

export default function SearchPage() {
  const [city, setCity] = useState("miami");
  const [bedsMin, setBedsMin] = useState("");
  const [bedsMax, setBedsMax] = useState("");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [sort, setSort] = useState("price_low");
  const [showFilters, setShowFilters] = useState(false);

  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [capturedAt, setCapturedAt] = useState<string | null>(null);

  const handleSearch = async () => {
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        city_slug: city,
        sort,
        limit: 30,
      };

      if (bedsMin) body.beds_min = parseInt(bedsMin);
      if (bedsMax) body.beds_max = parseInt(bedsMax);
      if (budgetMin) body.budget_min = parseInt(budgetMin);
      if (budgetMax) body.budget_max = parseInt(budgetMax);

      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data: SearchResponse = await res.json();
        setResults(data.results);
        setCapturedAt(data.captured_at_max);
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
  }, [city, sort]);

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
                  placeholder="Search by neighborhood, building name..."
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

                <div className="grid gap-4 md:grid-cols-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium">Beds (min)</label>
                    <Select value={bedsMin} onValueChange={setBedsMin}>
                      <SelectTrigger>
                        <SelectValue placeholder="Any" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Any</SelectItem>
                        <SelectItem value="0">Studio</SelectItem>
                        <SelectItem value="1">1</SelectItem>
                        <SelectItem value="2">2</SelectItem>
                        <SelectItem value="3">3+</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium">Beds (max)</label>
                    <Select value={bedsMax} onValueChange={setBedsMax}>
                      <SelectTrigger>
                        <SelectValue placeholder="Any" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Any</SelectItem>
                        <SelectItem value="0">Studio</SelectItem>
                        <SelectItem value="1">1</SelectItem>
                        <SelectItem value="2">2</SelectItem>
                        <SelectItem value="3">3+</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

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
                      setBedsMin("");
                      setBedsMax("");
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
                {results.length} {results.length === 1 ? "Apartment" : "Apartments"} Available
              </h1>
              {capturedAt && (
                <p className="text-sm text-muted-foreground">
                  Prices updated {new Date(capturedAt).toLocaleDateString()}
                </p>
              )}
            </div>

            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="price_low">Price: Low to High</SelectItem>
                <SelectItem value="price_high">Price: High to Low</SelectItem>
                <SelectItem value="sqft_high">Largest First</SelectItem>
                <SelectItem value="newest">Newest</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Results Grid */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-0">
                    <Skeleton className="h-48 w-full rounded-t-xl" />
                    <div className="p-4 space-y-3">
                      <Skeleton className="h-6 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                      <div className="flex gap-2">
                        <Skeleton className="h-6 w-16" />
                        <Skeleton className="h-6 w-16" />
                        <Skeleton className="h-6 w-16" />
                      </div>
                      <Skeleton className="h-8 w-24" />
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : results.length === 0 ? (
              <div className="col-span-full py-12 text-center">
                <Building2 className="mx-auto h-12 w-12 text-muted-foreground" />
                <h3 className="mt-4 text-lg font-semibold">No apartments found</h3>
                <p className="mt-2 text-muted-foreground">
                  Try adjusting your filters or searching in a different city
                </p>
              </div>
            ) : (
              results.map((result) => (
                <Link
                  key={result.unit.id}
                  href={`/buildings/${result.building.id}`}
                >
                  <Card className="group h-full cursor-pointer overflow-hidden transition-all hover:shadow-lg hover:-translate-y-1">
                    <CardContent className="p-0">
                      {/* Image placeholder */}
                      <div className="relative h-48 bg-gradient-to-br from-muted to-muted/50">
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Building2 className="h-16 w-16 text-muted-foreground/30" />
                        </div>
                        {result.building.neighborhoods && (
                          <Badge className="absolute top-3 left-3" variant="secondary">
                            {result.building.neighborhoods.name}
                          </Badge>
                        )}
                        {result.unit.unit_number && (
                          <Badge className="absolute top-3 right-3" variant="outline">
                            Unit {result.unit.unit_number}
                          </Badge>
                        )}
                      </div>

                      <div className="p-4">
                        <h3 className="font-semibold group-hover:text-primary transition-colors">
                          {result.building.name}
                        </h3>
                        <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {result.building.address_1}
                        </p>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <Badge variant="outline" className="gap-1">
                            <Bed className="h-3 w-3" />
                            {result.unit.beds === 0 ? "Studio" : `${result.unit.beds} bed`}
                          </Badge>
                          {result.unit.baths && (
                            <Badge variant="outline" className="gap-1">
                              <Bath className="h-3 w-3" />
                              {result.unit.baths} bath
                            </Badge>
                          )}
                          {result.unit.sqft && (
                            <Badge variant="outline" className="gap-1">
                              <Square className="h-3 w-3" />
                              {result.unit.sqft.toLocaleString()} sqft
                            </Badge>
                          )}
                        </div>

                        <div className="mt-4 flex items-end justify-between">
                          <div>
                            {result.pricing ? (
                              <>
                                <span className="text-xl font-bold">
                                  {formatPrice(result.pricing.rent)}
                                </span>
                                <span className="text-muted-foreground">/mo</span>
                              </>
                            ) : (
                              <span className="text-muted-foreground">Contact for pricing</span>
                            )}
                          </div>
                          {result.unit.available_on && (
                            <span className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              {new Date(result.unit.available_on).toLocaleDateString()}
                            </span>
                          )}
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
