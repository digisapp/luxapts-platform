"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams, useRouter } from "next/navigation";
import { Search, SlidersHorizontal, Building2, MapPin, Bed, Bath, Square, X, Calendar, Sparkles, Loader2, Layout, Map as MapIcon, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { formatPrice } from "@/lib/utils";
import { SearchMap } from "@/components/map/SearchMap";

interface UnitImage {
  id: string;
  url: string;
  alt_text: string | null;
  category: string | null;
}

interface Floorplan {
  id: string;
  name: string;
  layout_image_url: string | null;
}

interface SearchResult {
  building: {
    id: string;
    name: string;
    address_1: string;
    zip: string;
    lat: number | null;
    lng: number | null;
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
    floorplan_id: string | null;
  };
  pricing: {
    rent: number;
    net_effective_rent: number | null;
    captured_at: string;
  } | null;
  images?: UnitImage[];
  floorplan?: Floorplan | null;
}

interface SearchResponse {
  city: string;
  captured_at_max: string | null;
  results: SearchResult[];
}

interface ParsedFilters {
  city_slug?: string;
  beds_min?: number;
  beds_max?: number;
  budget_min?: number;
  budget_max?: number;
  pet_friendly?: boolean;
  sort?: string;
  summary?: string;
}

function SearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryParam = searchParams.get("q");
  const cityParam = searchParams.get("city");

  const [city, setCity] = useState(cityParam || "miami");
  const [bedsMin, setBedsMin] = useState("");
  const [bedsMax, setBedsMax] = useState("");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [sort, setSort] = useState("price_low");
  const [showFilters, setShowFilters] = useState(false);
  const [searchInput, setSearchInput] = useState(queryParam || "");

  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [capturedAt, setCapturedAt] = useState<string | null>(null);

  // Map view state
  const [showMap, setShowMap] = useState(true);
  const [highlightedListingId, setHighlightedListingId] = useState<string | null>(null);

  // AI search state
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiParsing, setAiParsing] = useState(false);

  const handleSearch = useCallback(async (filters?: ParsedFilters) => {
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        city_slug: filters?.city_slug || city,
        sort: filters?.sort || sort,
        limit: 30,
      };

      const bedsMinVal = filters?.beds_min !== undefined ? filters.beds_min : (bedsMin ? parseInt(bedsMin) : undefined);
      const bedsMaxVal = filters?.beds_max !== undefined ? filters.beds_max : (bedsMax ? parseInt(bedsMax) : undefined);
      const budgetMinVal = filters?.budget_min !== undefined ? filters.budget_min : (budgetMin ? parseInt(budgetMin) : undefined);
      const budgetMaxVal = filters?.budget_max !== undefined ? filters.budget_max : (budgetMax ? parseInt(budgetMax) : undefined);

      if (bedsMinVal !== undefined) body.beds_min = bedsMinVal;
      if (bedsMaxVal !== undefined) body.beds_max = bedsMaxVal;
      if (budgetMinVal !== undefined) body.budget_min = budgetMinVal;
      if (budgetMaxVal !== undefined) body.budget_max = budgetMaxVal;

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
  }, [city, sort, bedsMin, bedsMax, budgetMin, budgetMax]);

  // Parse AI query and apply filters
  const parseAndSearch = useCallback(async (query: string) => {
    setAiParsing(true);
    setAiSummary(null);

    try {
      const res = await fetch("/api/parse-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      if (res.ok) {
        const data = await res.json();
        const filters: ParsedFilters = data.filters;

        // Update UI state with parsed filters
        if (filters.city_slug) setCity(filters.city_slug);
        if (filters.beds_min !== undefined) setBedsMin(filters.beds_min.toString());
        if (filters.beds_max !== undefined) setBedsMax(filters.beds_max.toString());
        if (filters.budget_min !== undefined) setBudgetMin(filters.budget_min.toString());
        if (filters.budget_max !== undefined) setBudgetMax(filters.budget_max.toString());
        if (filters.sort) setSort(filters.sort);
        if (filters.summary) setAiSummary(filters.summary);

        // Search with the parsed filters
        await handleSearch(filters);
      } else {
        // Fallback to regular search
        await handleSearch();
      }
    } catch (error) {
      console.error("AI parsing error:", error);
      await handleSearch();
    } finally {
      setAiParsing(false);
    }
  }, [handleSearch]);

  // Handle AI search from input
  const handleAiSearch = () => {
    if (searchInput.trim()) {
      // Update URL with query
      router.push(`/search?q=${encodeURIComponent(searchInput.trim())}`);
      parseAndSearch(searchInput.trim());
    } else {
      setAiSummary(null);
      handleSearch();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleAiSearch();
    }
  };

  // Initial load - check for query param
  useEffect(() => {
    if (queryParam) {
      parseAndSearch(queryParam);
    } else if (cityParam) {
      setCity(cityParam);
      handleSearch();
    } else {
      handleSearch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-search when sort changes (but not on initial load)
  useEffect(() => {
    if (!aiParsing && results.length > 0) {
      handleSearch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort]);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 bg-muted/30">
        <div className="container mx-auto px-4 py-8">
          {/* AI Search Bar */}
          <div className="mb-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="relative flex-1">
                <Sparkles className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-primary" />
                <Input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Try: '2 bedroom in Miami under $3,500' or 'pet-friendly studio'"
                  className="h-12 pl-10"
                />
              </div>

              <Select value={city} onValueChange={(val) => { setCity(val); setAiSummary(null); }}>
                <SelectTrigger className="h-12 w-full md:w-[180px]">
                  <SelectValue placeholder="Select city" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="miami">Miami</SelectItem>
                  <SelectItem value="new-york">New York City</SelectItem>
                  <SelectItem value="los-angeles">Los Angeles</SelectItem>
                  <SelectItem value="austin">Austin</SelectItem>
                  <SelectItem value="dallas">Dallas</SelectItem>
                  <SelectItem value="nashville">Nashville</SelectItem>
                  <SelectItem value="atlanta">Atlanta</SelectItem>
                  <SelectItem value="brooklyn">Brooklyn</SelectItem>
                  <SelectItem value="chicago">Chicago</SelectItem>
                  <SelectItem value="san-francisco">San Francisco</SelectItem>
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

              <Button
                variant={showMap ? "default" : "outline"}
                className="h-12"
                onClick={() => setShowMap(!showMap)}
              >
                {showMap ? <List className="mr-2 h-4 w-4" /> : <MapIcon className="mr-2 h-4 w-4" />}
                {showMap ? "List" : "Map"}
              </Button>

              <Button className="h-12 gap-2" onClick={handleAiSearch} disabled={aiParsing}>
                {aiParsing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                AI Search
              </Button>
            </div>

            {/* AI Summary Banner */}
            {aiSummary && (
              <div className="mt-4 flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
                <Sparkles className="h-5 w-5 text-primary flex-shrink-0" />
                <p className="text-sm font-medium">{aiSummary}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  onClick={() => {
                    setAiSummary(null);
                    setSearchInput("");
                    setBedsMin("");
                    setBedsMax("");
                    setBudgetMin("");
                    setBudgetMax("");
                    router.push("/search");
                    handleSearch();
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

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
                  <Button onClick={() => { setAiSummary(null); handleSearch(); }}>Apply Filters</Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setBedsMin("");
                      setBedsMax("");
                      setBudgetMin("");
                      setBudgetMax("");
                      setAiSummary(null);
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
                {loading ? "Searching..." : `${results.length} ${results.length === 1 ? "Apartment" : "Apartments"} Available`}
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

          {/* Split Layout - Listings + Map */}
          <div className={`flex gap-6 ${showMap ? "flex-col lg:flex-row" : ""}`}>
            {/* Results Grid */}
            <div className={`${showMap ? "lg:w-1/2 xl:w-3/5" : "w-full"} ${showMap ? "lg:h-[calc(100vh-300px)] lg:overflow-y-auto lg:pr-4" : ""}`}>
              <div className={`grid gap-6 ${showMap ? "grid-cols-1 xl:grid-cols-2" : "md:grid-cols-2 lg:grid-cols-3"}`}>
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
                  results.map((result) => {
                    const primaryImage = result.images?.[0];
                    const hasFloorplan = result.floorplan?.layout_image_url;
                    const isHighlighted = highlightedListingId === result.unit.id;

                    return (
                      <Link
                        key={result.unit.id}
                        href={`/buildings/${result.building.id}`}
                        onMouseEnter={() => setHighlightedListingId(result.unit.id)}
                        onMouseLeave={() => setHighlightedListingId(null)}
                      >
                        <Card className={`group h-full cursor-pointer overflow-hidden transition-all hover:shadow-lg hover:-translate-y-1 ${isHighlighted ? "ring-2 ring-primary shadow-lg" : ""}`}>
                          <CardContent className="p-0">
                            {/* Image section */}
                            <div className="relative h-48 bg-gradient-to-br from-muted to-muted/50 overflow-hidden">
                              {primaryImage ? (
                                <Image
                                  src={primaryImage.url}
                                  alt={primaryImage.alt_text || `${result.building.name} - Unit ${result.unit.unit_number}`}
                                  fill
                                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                                />
                              ) : (
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <Building2 className="h-16 w-16 text-muted-foreground/30" />
                                </div>
                              )}
                              {/* Overlay gradient for text readability */}
                              {primaryImage && (
                                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                              )}
                              {result.building.neighborhoods && (
                                <Badge className="absolute top-3 left-3 bg-background/90 backdrop-blur-sm" variant="secondary">
                                  {result.building.neighborhoods.name}
                                </Badge>
                              )}
                              <div className="absolute top-3 right-3 flex gap-2">
                                {hasFloorplan && (
                                  <Badge className="bg-background/90 backdrop-blur-sm gap-1" variant="outline">
                                    <Layout className="h-3 w-3" />
                                    Floor Plan
                                  </Badge>
                                )}
                                {result.unit.unit_number && (
                                  <Badge className="bg-background/90 backdrop-blur-sm" variant="outline">
                                    Unit {result.unit.unit_number}
                                  </Badge>
                                )}
                              </div>
                              {/* Image count indicator */}
                              {result.images && result.images.length > 1 && (
                                <div className="absolute bottom-3 right-3 bg-black/60 text-white text-xs px-2 py-1 rounded-full">
                                  +{result.images.length - 1} photos
                                </div>
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
                    );
                  })
                )}
              </div>
            </div>

            {/* Map View */}
            {showMap && (
              <div className="lg:w-1/2 xl:w-2/5 h-[400px] lg:h-[calc(100vh-300px)] rounded-xl overflow-hidden border sticky top-4">
                <SearchMap
                  listings={results
                    .filter((r) => r.building.lat && r.building.lng && r.pricing)
                    .map((r) => ({
                      id: r.unit.id,
                      buildingId: r.building.id,
                      buildingName: r.building.name,
                      unitNumber: r.unit.unit_number || "",
                      lat: r.building.lat!,
                      lng: r.building.lng!,
                      rent: r.pricing!.rent,
                      beds: r.unit.beds || 0,
                      baths: r.unit.baths || 1,
                      sqft: r.unit.sqft,
                      neighborhood: r.building.neighborhoods?.name || "",
                    }))}
                  onListingClick={(id) => {
                    const result = results.find((r) => r.unit.id === id);
                    if (result) {
                      router.push(`/buildings/${result.building.id}`);
                    }
                  }}
                  onListingHover={setHighlightedListingId}
                  highlightedListingId={highlightedListingId}
                />
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 bg-muted/30 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </main>
        <Footer />
      </div>
    }>
      <SearchContent />
    </Suspense>
  );
}
