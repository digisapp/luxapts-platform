"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams, useRouter } from "next/navigation";
import { SlidersHorizontal, Building2, MapPin, Bed, Bath, Square, X, Calendar, Sparkles, Loader2, Layout, Map as MapIcon, List, PawPrint, Car, ChevronDown, Check, Brain, Star, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { formatPrice, cn } from "@/lib/utils";
import { SearchMap } from "@/components/map/SearchMap";
import { CompareButton } from "@/components/compare/CompareButton";
import { FavoriteButton } from "@/components/listings/FavoriteButton";
import { SaveSearchButton } from "@/components/listings/SaveSearchButton";
import { CommuteFilter, type CommuteTarget } from "@/components/search/CommuteFilter";
import { AMENITY_OPTIONS } from "@/lib/constants/amenities";

interface Neighborhood {
  slug: string;
  name: string;
}

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
    parking_policy: string | null;
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
  amenities?: string[];
  sort?: string;
  summary?: string;
}

// Filter overrides accepted by handleSearch. For the numeric filters,
// `null` explicitly clears the filter (ignoring current component state),
// while `undefined`/absent falls back to current state.
type SearchFilterOverrides = Omit<ParsedFilters, "beds_min" | "beds_max" | "budget_min" | "budget_max"> & {
  beds_min?: number | null;
  beds_max?: number | null;
  budget_min?: number | null;
  budget_max?: number | null;
};

interface SavedFilters {
  city?: string;
  bedsMin?: string;
  bedsMax?: string;
  budgetMin?: string;
  budgetMax?: string;
  bathsMin?: string;
  petFriendly?: boolean;
  parkingRequired?: boolean;
  moveInDate?: string;
  selectedAmenities?: string[];
  sort?: string;
}

interface SemanticBuilding {
  id: string;
  name: string;
  slug: string;
  address_1: string;
  description: string;
  hero_image_url: string | null;
  cities: { name: string; slug: string; state: string } | null;
  neighborhoods: { name: string; slug: string } | null;
  relevance_score: number;
}

// AMENITY_OPTIONS imported from @/lib/constants/amenities

function SearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryParam = searchParams.get("q");
  const cityParam = searchParams.get("city");
  const bedsMinParam = searchParams.get("beds_min");
  const bedsMaxParam = searchParams.get("beds_max");
  const budgetMinParam = searchParams.get("budget_min");
  const budgetMaxParam = searchParams.get("budget_max");
  const hasUrlFilters = Boolean(cityParam || bedsMinParam || bedsMaxParam || budgetMinParam || budgetMaxParam);

  // Seed filter state from URL params (hydration-safe — identical on server
  // and client). Saved filters from localStorage are restored in a
  // post-hydration effect below to avoid a server/client hydration mismatch.
  const [city, setCity] = useState(cityParam || "miami");
  const [bedsMin, setBedsMin] = useState(bedsMinParam || "");
  const [bedsMax, setBedsMax] = useState(bedsMaxParam || "");
  const [budgetMin, setBudgetMin] = useState(budgetMinParam || "");
  const [budgetMax, setBudgetMax] = useState(budgetMaxParam || "");
  const [sort, setSort] = useState("price_low");
  const [showFilters, setShowFilters] = useState(false);
  const [searchInput, setSearchInput] = useState(queryParam || "");

  // Advanced filter states
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [selectedNeighborhoods, setSelectedNeighborhoods] = useState<string[]>([]);
  const [bathsMin, setBathsMin] = useState("");
  const [petFriendly, setPetFriendly] = useState(false);
  const [parkingRequired, setParkingRequired] = useState(false);
  const [moveInDate, setMoveInDate] = useState("");
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
  const [showNeighborhoodDropdown, setShowNeighborhoodDropdown] = useState(false);
  const [showAmenityDropdown, setShowAmenityDropdown] = useState(false);

  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [capturedAt, setCapturedAt] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Race protection: only the most recent request may apply its results
  const requestIdRef = useRef(0);

  // Whether at least one search has been run (so sort changes can re-search
  // even when the previous search returned zero results)
  const hasSearchedRef = useRef(false);

  // True once saved filters have been restored post-hydration; gates the
  // initial search and the save-to-localStorage effect
  const [filtersHydrated, setFiltersHydrated] = useState(false);

  // Track listings whose images failed to load in the browser
  const [brokenImageIds, setBrokenImageIds] = useState<Set<string>>(new Set());

  // Map view state
  const [showMap, setShowMap] = useState(true);
  const [highlightedListingId, setHighlightedListingId] = useState<string | null>(null);

  // Default the map off on mobile (post-hydration to stay SSR-safe): it's a
  // heavy Mapbox GL instance + tile downloads, and the list is the primary
  // mobile view. Users can still toggle it on.
  useEffect(() => {
    if (window.matchMedia("(max-width: 1023px)").matches) {
      setShowMap(false);
    }
  }, []);

  // Lock body scroll while the mobile filter sheet is open
  useEffect(() => {
    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    if (showFilters && isMobile) {
      const previous = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = previous;
      };
    }
  }, [showFilters]);

  // Commute filter: destination + mode + cap; commuteTimes maps building_id -> minutes
  const [commute, setCommute] = useState<CommuteTarget | null>(null);
  const [commuteTimes, setCommuteTimes] = useState<Record<string, number> | null>(null);
  const commuteRequestIdRef = useRef(0);

  // AI search state
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiParsing, setAiParsing] = useState(false);

  // Smart (semantic) search state
  const [smartSearch, setSmartSearch] = useState(false);
  const [semanticResults, setSemanticResults] = useState<SemanticBuilding[]>([]);
  const [semanticQuery, setSemanticQuery] = useState<string | null>(null);

  // Restore saved filters after hydration (skipped when the URL carries an
  // explicit query or filters — those take precedence)
  useEffect(() => {
    if (!queryParam && !hasUrlFilters) {
      try {
        const saved = localStorage.getItem("staycio-search-filters");
        if (saved) {
          const parsed = JSON.parse(saved) as SavedFilters;
          if (parsed.city) setCity(parsed.city);
          if (parsed.bedsMin) setBedsMin(parsed.bedsMin);
          if (parsed.bedsMax) setBedsMax(parsed.bedsMax);
          if (parsed.budgetMin) setBudgetMin(parsed.budgetMin);
          if (parsed.budgetMax) setBudgetMax(parsed.budgetMax);
          if (parsed.bathsMin) setBathsMin(parsed.bathsMin);
          if (parsed.petFriendly) setPetFriendly(true);
          if (parsed.parkingRequired) setParkingRequired(true);
          if (parsed.moveInDate) setMoveInDate(parsed.moveInDate);
          if (parsed.selectedAmenities?.length) setSelectedAmenities(parsed.selectedAmenities);
          if (parsed.sort) setSort(parsed.sort);
        }
      } catch (e) {
        console.error("Error loading saved filters:", e);
      }
    }
    setFiltersHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save filters to localStorage when they change
  useEffect(() => {
    if (typeof window === "undefined") return;
    // Don't clobber saved filters with defaults before they've been restored
    if (!filtersHydrated) return;
    const filters = {
      city,
      bedsMin,
      bedsMax,
      budgetMin,
      budgetMax,
      bathsMin,
      petFriendly,
      parkingRequired,
      moveInDate,
      selectedAmenities,
      sort,
    };
    localStorage.setItem("staycio-search-filters", JSON.stringify(filters));
  }, [filtersHydrated, city, bedsMin, bedsMax, budgetMin, budgetMax, bathsMin, petFriendly, parkingRequired, moveInDate, selectedAmenities, sort]);

  // Fetch neighborhoods when city changes
  useEffect(() => {
    const controller = new AbortController();
    // Reset selections whenever the city changes, regardless of fetch outcome
    setSelectedNeighborhoods([]);
    async function fetchNeighborhoods() {
      try {
        const res = await fetch(`/api/cities/${city}/neighborhoods`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (res.ok) {
          const data = await res.json();
          if (controller.signal.aborted) return;
          setNeighborhoods(data.neighborhoods || []);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Error fetching neighborhoods:", error);
        setNeighborhoods([]);
      }
    }
    fetchNeighborhoods();
    return () => controller.abort();
  }, [city]);

  // Fetch commute times whenever the destination or the result set changes
  useEffect(() => {
    if (!commute || results.length === 0) {
      setCommuteTimes(null);
      return;
    }

    const points = [
      ...new Map(
        results
          .filter((r) => r.building.lat != null && r.building.lng != null)
          .map((r) => [
            r.building.id,
            { id: r.building.id, lng: r.building.lng as number, lat: r.building.lat as number },
          ])
      ).values(),
    ].slice(0, 200);

    if (points.length === 0) {
      setCommuteTimes({});
      return;
    }

    const requestId = ++commuteRequestIdRef.current;
    (async () => {
      try {
        const res = await fetch("/api/commute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            destination: { lng: commute.lng, lat: commute.lat },
            mode: commute.mode,
            points,
          }),
        });
        if (requestId !== commuteRequestIdRef.current) return;
        if (res.ok) {
          const data = await res.json();
          setCommuteTimes(data.durations || {});
        } else {
          setCommuteTimes({});
        }
      } catch {
        if (requestId === commuteRequestIdRef.current) setCommuteTimes({});
      }
    })();
  }, [commute, results]);

  // Results surviving the commute cap (untouched when no commute is set)
  const visibleResults =
    commute && commuteTimes
      ? results.filter((r) => {
          const minutes = commuteTimes[r.building.id];
          return minutes !== undefined && minutes <= commute.maxMinutes;
        })
      : results;

  // Count active filters
  const activeFilterCount = [
    bedsMin,
    bedsMax,
    budgetMin,
    budgetMax,
    bathsMin,
    petFriendly,
    parkingRequired,
    moveInDate,
    selectedNeighborhoods.length > 0,
    selectedAmenities.length > 0,
  ].filter(Boolean).length;

  const handleSearch = useCallback(async (filters?: SearchFilterOverrides) => {
    const requestId = ++requestIdRef.current;
    hasSearchedRef.current = true;
    setLoading(true);
    setSearchError(null);
    try {
      const body: Record<string, unknown> = {
        city_slug: filters?.city_slug || city,
        sort: filters?.sort || sort,
        limit: 200,
      };

      // Basic filters — `null` explicitly clears, `undefined` falls back to state
      const bedsMinVal = filters?.beds_min !== undefined ? filters.beds_min ?? undefined : (bedsMin ? parseInt(bedsMin) : undefined);
      const bedsMaxVal = filters?.beds_max !== undefined ? filters.beds_max ?? undefined : (bedsMax ? parseInt(bedsMax) : undefined);
      const budgetMinVal = filters?.budget_min !== undefined ? filters.budget_min ?? undefined : (budgetMin ? parseInt(budgetMin) : undefined);
      const budgetMaxVal = filters?.budget_max !== undefined ? filters.budget_max ?? undefined : (budgetMax ? parseInt(budgetMax) : undefined);

      if (bedsMinVal !== undefined) body.beds_min = bedsMinVal;
      if (bedsMaxVal !== undefined) body.beds_max = bedsMaxVal;
      if (budgetMinVal !== undefined) body.budget_min = budgetMinVal;
      if (budgetMaxVal !== undefined) body.budget_max = budgetMaxVal;

      // Advanced filters
      if (selectedNeighborhoods.length > 0) body.neighborhood_slugs = selectedNeighborhoods;
      if (bathsMin) body.baths_min = parseInt(bathsMin);
      if (filters?.pet_friendly || petFriendly) body.pet_friendly = true;
      if (parkingRequired) body.parking_required = true;
      if (moveInDate) body.move_in_date = moveInDate;

      // Amenities - use AI parsed amenities or selected amenities
      // Use amenities_all so buildings must have ALL selected amenities
      const amenities = filters?.amenities || selectedAmenities;
      if (amenities.length > 0) body.amenities_all = amenities;

      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (requestId !== requestIdRef.current) return;

      if (res.ok) {
        const data: SearchResponse = await res.json();
        if (requestId !== requestIdRef.current) return;
        setResults(data.results);
        setCapturedAt(data.captured_at_max);
        setBrokenImageIds(new Set());
      } else {
        setSearchError("Search failed. Please try again.");
      }
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      console.error("Search error:", error);
      setSearchError("Search failed. Please try again.");
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [city, sort, bedsMin, bedsMax, budgetMin, budgetMax, selectedNeighborhoods, bathsMin, petFriendly, parkingRequired, moveInDate, selectedAmenities]);

  // Semantic / Smart Search — natural language query against xAI vector index
  const handleSemanticSearch = useCallback(async (query: string) => {
    if (!query.trim()) { handleSearch(); return; }
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setSearchError(null);
    setSemanticResults([]);
    setSemanticQuery(query.trim());
    try {
      const res = await fetch("/api/search/semantic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim(), city_slug: city || undefined, limit: 20 }),
      });
      if (requestId !== requestIdRef.current) return;

      if (res.ok) {
        const data = await res.json();
        if (requestId !== requestIdRef.current) return;
        setSemanticResults(data.buildings || []);
      } else {
        setSearchError("Smart search failed. Please try again.");
      }
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      console.error("Semantic search error:", error);
      setSearchError("Smart search failed. Please try again.");
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [city, handleSearch]);

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
        if (filters.amenities?.length) setSelectedAmenities(filters.amenities);
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

  // Handle search from input — routes to semantic or parse-and-search depending on mode
  const handleAiSearch = () => {
    if (smartSearch) {
      if (searchInput.trim()) {
        router.push(`/search?q=${encodeURIComponent(searchInput.trim())}`);
        handleSemanticSearch(searchInput.trim());
      } else {
        setSemanticResults([]);
        setSemanticQuery(null);
      }
    } else {
      if (searchInput.trim()) {
        router.push(`/search?q=${encodeURIComponent(searchInput.trim())}`);
        parseAndSearch(searchInput.trim());
      } else {
        setAiSummary(null);
        handleSearch();
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !aiParsing && !loading) {
      handleAiSearch();
    }
  };

  // Initial load — runs once after saved filters (if any) have been restored,
  // so the first search uses the restored filters without double-searching
  const initialSearchDoneRef = useRef(false);
  useEffect(() => {
    if (!filtersHydrated || initialSearchDoneRef.current) return;
    initialSearchDoneRef.current = true;
    if (queryParam) {
      parseAndSearch(queryParam);
    } else {
      handleSearch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersHydrated]);

  // Re-search when sort changes (but not before the initial search has run,
  // and even if the previous search returned zero results)
  useEffect(() => {
    if (!aiParsing && hasSearchedRef.current) {
      handleSearch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort]);

  return (
    <div className="flex min-h-screen flex-col bg-black">
      <Header />

      <main className="flex-1">
        {/* Background effects */}
        <div className="fixed inset-0 -z-10">
          <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-[120px]" />
          <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-purple-500/5 rounded-full blur-[100px]" />
        </div>

        <div className="container mx-auto px-4 pt-20 pb-24 md:pt-24 lg:pb-8">
          {/* AI Search Bar */}
          <div className="mb-6 md:mb-8">
            {/* Mobile: Search input with AI button */}
            <div className="flex gap-2 mb-2 md:hidden">
              <div className="relative flex-1 group">
                {smartSearch
                  ? <Brain className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-400" />
                  : <Sparkles className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-400" />
                }
                <Input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={smartSearch ? "Describe your ideal apartment…" : "Try: '2BR in Miami under $3,500'"}
                  className={`pl-9 text-base bg-white/[0.03] backdrop-blur-xl border-white/[0.08] focus:border-white/20 ${smartSearch ? "border-violet-500/30" : ""}`}
                />
              </div>
              <Button
                size="icon"
                className={`shadow-lg ${smartSearch ? "bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-400 hover:to-purple-500 shadow-violet-500/20" : "bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 shadow-cyan-500/20"}`}
                onClick={handleAiSearch}
                disabled={aiParsing || loading}
              >
                {(aiParsing || (smartSearch && loading)) ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : smartSearch ? (
                  <Brain className="h-4 w-4" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
              </Button>
            </div>
            {/* Mobile: Smart Search toggle */}
            <div className="flex items-center gap-2 mb-3 md:hidden">
              <button
                onClick={() => { setSmartSearch(!smartSearch); setSemanticResults([]); setSemanticQuery(null); }}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${smartSearch ? "bg-violet-500/20 text-violet-300 border border-violet-500/30" : "bg-white/[0.05] text-white/40 border border-white/[0.08] hover:text-white/60"}`}
              >
                <Brain className="h-3 w-3" />
                Smart Search {smartSearch ? "ON" : "OFF"}
              </button>
              {smartSearch && (
                <span className="text-xs text-white/30">Natural language · AI-powered</span>
              )}
            </div>

            {/* Mobile: Compact filter row */}
            <div className="flex gap-2 md:hidden">
              <Select value={city} onValueChange={(val) => { setCity(val); setAiSummary(null); }}>
                <SelectTrigger className="h-9 flex-1 text-sm bg-white/[0.03] backdrop-blur-xl border-white/[0.08]">
                  <SelectValue placeholder="City" />
                </SelectTrigger>
                <SelectContent className="bg-black/90 backdrop-blur-xl border-white/[0.1]">
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
                variant={activeFilterCount > 0 ? "default" : "glass"}
                size="sm"
                className="h-9 px-3"
                onClick={() => setShowFilters(!showFilters)}
              >
                <SlidersHorizontal className="h-4 w-4" />
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="ml-1 h-4 w-4 rounded-full p-0 flex items-center justify-center text-[10px] bg-white/20">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>

              <Button
                variant={showMap ? "default" : "glass"}
                size="sm"
                className="h-9 px-3"
                onClick={() => setShowMap(!showMap)}
              >
                {showMap ? <List className="h-4 w-4" /> : <MapIcon className="h-4 w-4" />}
              </Button>
            </div>

            {/* Desktop: Full search bar */}
            <div className="hidden md:flex flex-row items-center gap-3">
              {/* Smart Search toggle pill */}
              <button
                onClick={() => { setSmartSearch(!smartSearch); setSemanticResults([]); setSemanticQuery(null); }}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 h-12 text-sm font-medium transition-all border ${smartSearch ? "bg-violet-500/15 text-violet-300 border-violet-500/40 shadow-sm shadow-violet-500/20" : "bg-white/[0.03] text-white/40 border-white/[0.08] hover:text-white/60 hover:bg-white/[0.06]"}`}
                title={smartSearch ? "Smart Search active — natural language mode" : "Enable Smart Search for natural language queries"}
              >
                <Brain className="h-4 w-4" />
                <span className="hidden lg:inline">Smart</span>
              </button>

              <div className="relative flex-1 group">
                <div className={`absolute -inset-1 rounded-xl blur-lg opacity-0 group-focus-within:opacity-100 transition-opacity duration-500 ${smartSearch ? "bg-gradient-to-r from-violet-500/20 via-purple-500/20 to-pink-500/20" : "bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-purple-500/20"}`} />
                <div className="relative">
                  {smartSearch
                    ? <Brain className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-violet-400" />
                    : <Sparkles className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-cyan-400" />
                  }
                  <Input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={smartSearch ? "Describe your ideal apartment in plain English…" : "Try: '2 bedroom in Miami under $3,500' or 'pet-friendly studio'"}
                    className={`h-12 pl-10 bg-white/[0.03] backdrop-blur-xl border-white/[0.08] focus:border-white/20 ${smartSearch ? "border-violet-500/20" : ""}`}
                  />
                </div>
              </div>

              <Select value={city} onValueChange={(val) => { setCity(val); setAiSummary(null); }}>
                <SelectTrigger className="h-12 w-[160px] bg-white/[0.03] backdrop-blur-xl border-white/[0.08]">
                  <SelectValue placeholder="Select city" />
                </SelectTrigger>
                <SelectContent className="bg-black/90 backdrop-blur-xl border-white/[0.1]">
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

              {!smartSearch && (
                <Button
                  variant={activeFilterCount > 0 ? "default" : "glass"}
                  className="h-12"
                  onClick={() => setShowFilters(!showFilters)}
                >
                  <SlidersHorizontal className="mr-2 h-4 w-4" />
                  Filters
                  {activeFilterCount > 0 && (
                    <Badge variant="secondary" className="ml-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs bg-white/20">
                      {activeFilterCount}
                    </Badge>
                  )}
                </Button>
              )}

              <Button
                variant={showMap ? "default" : "glass"}
                className="h-12"
                onClick={() => setShowMap(!showMap)}
              >
                {showMap ? <List className="mr-2 h-4 w-4" /> : <MapIcon className="mr-2 h-4 w-4" />}
                {showMap ? "List" : "Map"}
              </Button>

              <Button
                className={`h-12 gap-2 shadow-lg ${smartSearch ? "bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-400 hover:to-purple-500 shadow-violet-500/20" : "bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 shadow-cyan-500/20"}`}
                onClick={handleAiSearch}
                disabled={aiParsing || (smartSearch && loading)}
              >
                {(aiParsing || (smartSearch && loading)) ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : smartSearch ? (
                  <Brain className="h-4 w-4" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {smartSearch ? "Find Matches" : "AI Search"}
              </Button>
            </div>

            {/* AI Summary Banner */}
            {aiSummary && (
              <div className="mt-4 flex items-center gap-3 rounded-xl bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-purple-500/10 backdrop-blur-xl border border-cyan-500/20 p-4">
                <Sparkles className="h-5 w-5 text-cyan-400 flex-shrink-0" />
                <p className="text-sm font-medium text-white/90">{aiSummary}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto hover:bg-white/10"
                  onClick={() => {
                    setAiSummary(null);
                    setSearchInput("");
                    setBedsMin("");
                    setBedsMax("");
                    setBudgetMin("");
                    setBudgetMax("");
                    router.push("/search");
                    // State updates above haven't committed yet, so pass
                    // explicit clear sentinels instead of relying on state
                    handleSearch({ beds_min: null, beds_max: null, budget_min: null, budget_max: null });
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Filters Panel — bottom sheet on mobile, inline panel on md+ */}
            {showFilters && (
              <div
                className="fixed inset-0 z-[55] bg-black/60 backdrop-blur-sm md:hidden"
                onClick={() => setShowFilters(false)}
                aria-hidden="true"
              />
            )}
            {showFilters && (
              <div className="fixed inset-x-0 bottom-0 z-[60] max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-2xl border-t border-white/[0.1] bg-zinc-950/95 backdrop-blur-xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] space-y-6 md:static md:z-auto md:mt-4 md:max-h-none md:overflow-visible md:rounded-xl md:border md:border-white/[0.08] md:bg-white/[0.02] md:p-6 md:pb-6">
                <div className="mx-auto h-1 w-10 rounded-full bg-white/20 md:hidden" aria-hidden="true" />
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-white">Filters</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowFilters(false)}
                    className="hover:bg-white/10"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {/* Basic Filters Row */}
                <div>
                  <h4 className="text-sm font-medium text-white/50 mb-3">Basic</h4>
                  <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
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
                        inputMode="numeric"
                        placeholder="$0"
                        value={budgetMin}
                        onChange={(e) => setBudgetMin(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium">Max Budget</label>
                      <Input
                        type="number"
                        inputMode="numeric"
                        placeholder="No max"
                        value={budgetMax}
                        onChange={(e) => setBudgetMax(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Advanced Filters Row */}
                <div>
                  <h4 className="text-sm font-medium text-white/50 mb-3">Advanced</h4>
                  <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
                    {/* Neighborhoods Multi-select */}
                    <div className="relative">
                      <label className="mb-2 block text-sm font-medium">Neighborhoods</label>
                      <Button
                        variant="outline"
                        className="w-full justify-between"
                        onClick={() => setShowNeighborhoodDropdown(!showNeighborhoodDropdown)}
                      >
                        <span className="truncate">
                          {selectedNeighborhoods.length === 0
                            ? "All neighborhoods"
                            : `${selectedNeighborhoods.length} selected`}
                        </span>
                        <ChevronDown className="h-4 w-4 opacity-50" />
                      </Button>
                      {showNeighborhoodDropdown && neighborhoods.length > 0 && (
                        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-md border bg-popover p-1 shadow-md">
                          {neighborhoods.map((n) => (
                            <button
                              key={n.slug}
                              className={cn(
                                "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent cursor-pointer",
                                selectedNeighborhoods.includes(n.slug) && "bg-accent"
                              )}
                              onClick={() => {
                                setSelectedNeighborhoods((prev) =>
                                  prev.includes(n.slug)
                                    ? prev.filter((s) => s !== n.slug)
                                    : [...prev, n.slug]
                                );
                              }}
                            >
                              <div className={cn(
                                "h-4 w-4 border rounded flex items-center justify-center",
                                selectedNeighborhoods.includes(n.slug) && "bg-primary border-primary"
                              )}>
                                {selectedNeighborhoods.includes(n.slug) && (
                                  <Check className="h-3 w-3 text-primary-foreground" />
                                )}
                              </div>
                              {n.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Bathrooms */}
                    <div>
                      <label className="mb-2 block text-sm font-medium">Baths (min)</label>
                      <Select value={bathsMin} onValueChange={setBathsMin}>
                        <SelectTrigger>
                          <SelectValue placeholder="Any" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">Any</SelectItem>
                          <SelectItem value="1">1+</SelectItem>
                          <SelectItem value="2">2+</SelectItem>
                          <SelectItem value="3">3+</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Move-in Date */}
                    <div>
                      <label className="mb-2 block text-sm font-medium">Move-in by</label>
                      <Input
                        type="date"
                        value={moveInDate}
                        onChange={(e) => setMoveInDate(e.target.value)}
                        min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split("T")[0]}
                      />
                    </div>
                  </div>
                </div>

                {/* Amenities */}
                <div>
                  <h4 className="text-sm font-medium text-white/50 mb-3">Amenities</h4>
                  <div className="space-y-4">
                    {/* Amenity Multi-select */}
                    <div className="relative">
                      <Button
                        variant="outline"
                        className="w-full sm:w-auto min-w-[200px] justify-between"
                        onClick={() => setShowAmenityDropdown(!showAmenityDropdown)}
                      >
                        <span className="truncate">
                          {selectedAmenities.length === 0
                            ? "Select amenities..."
                            : `${selectedAmenities.length} amenity${selectedAmenities.length > 1 ? "ies" : ""} selected`}
                        </span>
                        <ChevronDown className="h-4 w-4 opacity-50 ml-2" />
                      </Button>
                      {showAmenityDropdown && (
                        <div className="absolute z-50 mt-1 w-full sm:w-[300px] max-h-60 overflow-auto rounded-md border bg-popover p-1 shadow-md">
                          {AMENITY_OPTIONS.map((amenity) => (
                            <button
                              key={amenity.name}
                              className={cn(
                                "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent cursor-pointer",
                                selectedAmenities.includes(amenity.name) && "bg-accent"
                              )}
                              onClick={() => {
                                setSelectedAmenities((prev) =>
                                  prev.includes(amenity.name)
                                    ? prev.filter((a) => a !== amenity.name)
                                    : [...prev, amenity.name]
                                );
                              }}
                            >
                              <div className={cn(
                                "h-4 w-4 border rounded flex items-center justify-center",
                                selectedAmenities.includes(amenity.name) && "bg-primary border-primary"
                              )}>
                                {selectedAmenities.includes(amenity.name) && (
                                  <Check className="h-3 w-3 text-primary-foreground" />
                                )}
                              </div>
                              {amenity.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Selected amenities badges */}
                    {selectedAmenities.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {selectedAmenities.map((amenity) => (
                          <Badge
                            key={amenity}
                            variant="secondary"
                            className="gap-1 bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
                          >
                            {amenity}
                            <button
                              onClick={() => setSelectedAmenities((prev) => prev.filter((a) => a !== amenity))}
                              className="ml-1 hover:text-white"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}

                    {/* Pet & Parking toggles */}
                    <div className="flex flex-wrap gap-6 pt-2">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <Switch
                          checked={petFriendly}
                          onCheckedChange={setPetFriendly}
                        />
                        <span className="flex items-center gap-2 text-sm">
                          <PawPrint className="h-4 w-4 text-green-600" />
                          Pet-friendly
                        </span>
                      </label>

                      <label className="flex items-center gap-3 cursor-pointer">
                        <Switch
                          checked={parkingRequired}
                          onCheckedChange={setParkingRequired}
                        />
                        <span className="flex items-center gap-2 text-sm">
                          <Car className="h-4 w-4 text-blue-600" />
                          Parking available
                        </span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-4 border-t border-white/[0.06]">
                  <Button
                    onClick={() => {
                      setAiSummary(null);
                      handleSearch();
                      // On mobile the sheet covers the results — close it so
                      // the new results are immediately visible
                      if (window.matchMedia("(max-width: 767px)").matches) {
                        setShowFilters(false);
                      }
                    }}
                    className="flex-1 md:flex-none bg-white text-black hover:bg-white/90"
                  >
                    Apply Filters
                  </Button>
                  <Button
                    variant="glass"
                    className="flex-1 md:flex-none"
                    onClick={() => {
                      setBedsMin("");
                      setBedsMax("");
                      setBudgetMin("");
                      setBudgetMax("");
                      setSelectedNeighborhoods([]);
                      setBathsMin("");
                      setPetFriendly(false);
                      setParkingRequired(false);
                      setMoveInDate("");
                      setSelectedAmenities([]);
                      setAiSummary(null);
                    }}
                  >
                    Clear All
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Results Header */}
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {smartSearch && semanticQuery ? (
                <>
                  <div className="flex items-center gap-2">
                    <Brain className="h-5 w-5 text-violet-400" />
                    <h1 className="text-2xl font-bold text-white">
                      {loading ? "Finding matches…" : `${semanticResults.length} Building${semanticResults.length !== 1 ? "s" : ""} Matched`}
                    </h1>
                  </div>
                  <p className="text-sm text-white/40 mt-0.5">
                    Smart Search: &ldquo;{semanticQuery}&rdquo;
                  </p>
                </>
              ) : (
                <>
                  <h1 className="text-2xl font-bold text-white">
                    {loading ? "Searching..." : `${visibleResults.length} ${visibleResults.length === 1 ? "Apartment" : "Apartments"} Available`}
                  </h1>
                  {capturedAt && (
                    <p className="text-sm text-white/40">
                      Prices updated {new Date(capturedAt).toLocaleDateString()}
                      {commute && commuteTimes && visibleResults.length < results.length &&
                        ` · ${results.length - visibleResults.length} hidden by commute filter`}
                    </p>
                  )}
                </>
              )}
            </div>

            {!smartSearch && (
              <div className="flex items-center gap-2">
                <SaveSearchButton
                  filters={{
                    city,
                    bedsMin: bedsMin ? parseInt(bedsMin) : undefined,
                    bedsMax: bedsMax ? parseInt(bedsMax) : undefined,
                    budgetMin: budgetMin ? parseInt(budgetMin) : undefined,
                    budgetMax: budgetMax ? parseInt(budgetMax) : undefined,
                    petFriendly: petFriendly || undefined,
                  }}
                  resultCount={results.length}
                />
                <Select value={sort} onValueChange={setSort}>
                  <SelectTrigger className="flex-1 sm:flex-none sm:w-[180px] bg-white/[0.03] backdrop-blur-xl border-white/[0.08]">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent className="bg-black/90 backdrop-blur-xl border-white/[0.1]">
                    <SelectItem value="price_low">Price: Low to High</SelectItem>
                    <SelectItem value="price_high">Price: High to Low</SelectItem>
                    <SelectItem value="sqft_high">Largest First</SelectItem>
                    <SelectItem value="newest">Newest</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Commute filter (standard search only) */}
          {!smartSearch && (
            <div className="mb-6">
              <CommuteFilter
                proximity={
                  results.find((r) => r.building.lat != null && r.building.lng != null)
                    ? {
                        lng: results.find((r) => r.building.lng != null)!.building.lng as number,
                        lat: results.find((r) => r.building.lat != null)!.building.lat as number,
                      }
                    : null
                }
                value={commute}
                onChange={setCommute}
              />
            </div>
          )}

          {/* Search error banner */}
          {searchError && !loading && (
            <div className="mb-6 flex items-center gap-3 rounded-xl bg-red-500/10 backdrop-blur-xl border border-red-500/20 p-4">
              <X className="h-5 w-5 text-red-400 flex-shrink-0" />
              <p className="text-sm font-medium text-red-300">{searchError}</p>
              <Button
                variant="glass"
                size="sm"
                className="ml-auto"
                onClick={() => {
                  if (smartSearch && semanticQuery) {
                    handleSemanticSearch(semanticQuery);
                  } else {
                    handleSearch();
                  }
                }}
              >
                Retry
              </Button>
            </div>
          )}

          {/* Split Layout - Listings + Map */}
          <div className={`flex gap-6 ${showMap && !smartSearch ? "flex-col lg:flex-row" : ""}`}>
            {/* Results Grid */}
            <div className={`${showMap && !smartSearch ? "lg:w-1/2 xl:w-3/5" : "w-full"} ${showMap && !smartSearch ? "lg:h-[calc(100dvh-300px)] lg:overflow-y-auto lg:pr-4" : ""}`}>

              {/* Semantic results */}
              {smartSearch && (
                <div className={`grid gap-5 stagger-children md:grid-cols-2 lg:grid-cols-3`}>
                  {loading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <Card key={i} className="overflow-hidden">
                        <CardContent className="p-0">
                          <div className="h-48 w-full rounded-t-xl bg-muted shimmer" />
                          <div className="p-4 space-y-3">
                            <div className="h-6 w-3/4 bg-muted rounded shimmer" />
                            <div className="h-4 w-1/2 bg-muted rounded shimmer" />
                            <div className="h-10 w-full bg-muted rounded shimmer" />
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  ) : semanticResults.length === 0 && semanticQuery ? (
                    <div className="col-span-full py-12 text-center">
                      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] mb-4">
                        <Brain className="h-8 w-8 text-white/30" />
                      </div>
                      <h3 className="text-lg font-semibold text-white">No matches found</h3>
                      <p className="mt-2 text-white/50">Try rephrasing your search or be more specific about location</p>
                    </div>
                  ) : semanticResults.length === 0 ? (
                    <div className="col-span-full py-10 text-center">
                      <p className="text-white/40 text-sm">Describe what you&apos;re looking for and click Find Matches</p>
                    </div>
                  ) : (
                    semanticResults.map((building) => {
                      const score = Math.round(building.relevance_score * 100);
                      return (
                        <Link key={building.id} href={`/buildings/${building.id}`}>
                          <Card className="group h-full cursor-pointer overflow-hidden bg-white/[0.02] backdrop-blur-xl border-white/[0.06] hover:bg-white/[0.04] hover:border-violet-500/30 transition-all duration-500">
                            <CardContent className="p-0">
                              {/* Image */}
                              <div className="relative h-44 bg-gradient-to-br from-white/[0.03] to-black/20 overflow-hidden">
                                {building.hero_image_url ? (
                                  <Image
                                    src={building.hero_image_url}
                                    alt={building.name}
                                    fill
                                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                                    sizes="(max-width: 768px) 100vw, 33vw"
                                  />
                                ) : (
                                  <div className="absolute inset-0 flex items-center justify-center">
                                    <Building2 className="h-14 w-14 text-muted-foreground/30" />
                                  </div>
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                                {building.neighborhoods && (
                                  <Badge className="absolute top-3 left-3 bg-background/90 backdrop-blur-sm" variant="secondary">
                                    {building.neighborhoods.name}
                                  </Badge>
                                )}
                                {/* Relevance score */}
                                <div className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-violet-500/90 backdrop-blur-sm px-2 py-0.5">
                                  <Star className="h-3 w-3 text-white fill-white" />
                                  <span className="text-xs font-medium text-white">{score}% match</span>
                                </div>
                              </div>

                              <div className="p-4">
                                <h3 className="font-semibold text-white group-hover:text-violet-400 transition-colors">
                                  {building.name}
                                </h3>
                                <p className="mt-1 flex items-center gap-1 text-sm text-white/50">
                                  <MapPin className="h-3 w-3" />
                                  {building.address_1}
                                  {building.cities ? `, ${building.cities.name}` : ""}
                                </p>
                                {building.description && (
                                  <p className="mt-2 text-xs text-white/40 line-clamp-2">
                                    {building.description}
                                  </p>
                                )}
                                {/* Relevance bar */}
                                <div className="mt-3">
                                  <div className="h-1 w-full rounded-full bg-white/[0.06]">
                                    <div
                                      className="h-1 rounded-full bg-gradient-to-r from-violet-500 to-purple-400 transition-all"
                                      style={{ width: `${score}%` }}
                                    />
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </Link>
                      );
                    })
                  )}
                </div>
              )}

              {/* Standard unit results */}
              {!smartSearch && (
              <div className={`grid gap-6 stagger-children ${showMap ? "grid-cols-1 xl:grid-cols-2" : "md:grid-cols-2 lg:grid-cols-3"}`}>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <Card key={i} className="overflow-hidden">
                      <CardContent className="p-0">
                        <div className="h-48 w-full rounded-t-xl bg-muted shimmer" />
                        <div className="p-4 space-y-3">
                          <div className="h-6 w-3/4 bg-muted rounded shimmer" />
                          <div className="h-4 w-1/2 bg-muted rounded shimmer" />
                          <div className="flex gap-2">
                            <div className="h-6 w-16 bg-muted rounded shimmer" />
                            <div className="h-6 w-16 bg-muted rounded shimmer" />
                            <div className="h-6 w-16 bg-muted rounded shimmer" />
                          </div>
                          <div className="h-8 w-24 bg-muted rounded shimmer" />
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : visibleResults.length === 0 ? (
                  <div className="col-span-full py-12 text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] mb-4">
                      <Building2 className="h-8 w-8 text-white/30" />
                    </div>
                    <h3 className="text-lg font-semibold text-white">No apartments found</h3>
                    <p className="mt-2 text-white/50">
                      {commute && results.length > 0
                        ? "No results within that commute — try a longer time or clear the commute filter"
                        : "Try adjusting your filters or searching in a different city"}
                    </p>
                  </div>
                ) : (
                  visibleResults.map((result) => {
                    const primaryImage = result.images?.[0];
                    // Fall back to the placeholder if the photo failed to load,
                    // rather than dropping the listing from the grid
                    const showImage = Boolean(primaryImage) && !brokenImageIds.has(result.unit.id);
                    const hasFloorplan = result.floorplan?.layout_image_url;
                    const isHighlighted = highlightedListingId === result.unit.id;

                    return (
                      <Link
                        key={result.unit.id}
                        href={`/buildings/${result.building.id}`}
                        onMouseEnter={() => setHighlightedListingId(result.unit.id)}
                        onMouseLeave={() => setHighlightedListingId(null)}
                      >
                        <Card className={`group h-full cursor-pointer overflow-hidden bg-white/[0.02] backdrop-blur-xl border-white/[0.06] hover:bg-white/[0.04] hover:border-white/[0.12] transition-all duration-500 ${isHighlighted ? "ring-2 ring-cyan-500/50 shadow-lg shadow-cyan-500/10" : ""}`}>
                          <CardContent className="p-0">
                            {/* Image section */}
                            <div className="relative h-48 bg-gradient-to-br from-white/[0.03] to-black/20 overflow-hidden">
                              {showImage && primaryImage ? (
                                <Image
                                  src={primaryImage.url}
                                  alt={primaryImage.alt_text || `${result.building.name} - Unit ${result.unit.unit_number}`}
                                  fill
                                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                                  onError={() => {
                                    setBrokenImageIds((prev) => new Set([...prev, result.unit.id]));
                                  }}
                                />
                              ) : (
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <Building2 className="h-16 w-16 text-muted-foreground/30" />
                                </div>
                              )}
                              {/* Overlay gradient for text readability */}
                              {showImage && (
                                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                              )}
                              {result.building.neighborhoods && (
                                <Badge className="absolute top-3 left-3 bg-background/90 backdrop-blur-sm" variant="secondary">
                                  {result.building.neighborhoods.name}
                                </Badge>
                              )}
                              <div className="absolute top-3 right-3 flex gap-2">
                                {commute && commuteTimes?.[result.building.id] !== undefined && (
                                  <Badge className="bg-cyan-950/90 text-cyan-300 backdrop-blur-sm gap-1" variant="outline">
                                    <Navigation className="h-3 w-3" />
                                    {commuteTimes[result.building.id]} min
                                  </Badge>
                                )}
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
                              {/* Compare and Favorite buttons */}
                              <div className="absolute bottom-3 left-3 flex gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                <CompareButton
                                  building={{
                                    id: result.building.id,
                                    name: result.building.name,
                                    address: result.building.address_1,
                                    neighborhood: result.building.neighborhoods?.name,
                                    image: primaryImage?.url,
                                  }}
                                />
                                <FavoriteButton
                                  item={{
                                    id: result.building.id,
                                    type: "building",
                                    name: result.building.name,
                                    address: result.building.address_1,
                                    neighborhood: result.building.neighborhoods?.name,
                                    image: primaryImage?.url,
                                    price: result.pricing?.rent,
                                    beds: result.unit.beds ?? undefined,
                                    baths: result.unit.baths ?? undefined,
                                  }}
                                  size="md"
                                />
                              </div>
                            </div>

                            <div className="p-4">
                              <h3 className="font-semibold text-white group-hover:text-cyan-400 transition-colors">
                                {result.building.name}
                              </h3>
                              <p className="mt-1 flex items-center gap-1 text-sm text-white/50">
                                <MapPin className="h-3 w-3" />
                                {result.building.address_1}
                              </p>

                              <div className="mt-3 flex flex-wrap gap-2">
                                <Badge variant="outline" className="gap-1 bg-white/[0.03] border-white/[0.08] text-white/70">
                                  <Bed className="h-3 w-3" />
                                  {result.unit.beds === 0 ? "Studio" : `${result.unit.beds} bed`}
                                </Badge>
                                {result.unit.baths && (
                                  <Badge variant="outline" className="gap-1 bg-white/[0.03] border-white/[0.08] text-white/70">
                                    <Bath className="h-3 w-3" />
                                    {result.unit.baths} bath
                                  </Badge>
                                )}
                                {result.unit.sqft && (
                                  <Badge variant="outline" className="gap-1 bg-white/[0.03] border-white/[0.08] text-white/70">
                                    <Square className="h-3 w-3" />
                                    {result.unit.sqft.toLocaleString()} sqft
                                  </Badge>
                                )}
                                {result.building.pet_policy && (
                                  <Badge variant="secondary" className="gap-1 bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                                    <PawPrint className="h-3 w-3" />
                                    Pets OK
                                  </Badge>
                                )}
                                {result.building.parking_policy && (
                                  <Badge variant="secondary" className="gap-1 bg-blue-500/10 text-blue-400 border-blue-500/20">
                                    <Car className="h-3 w-3" />
                                    Parking
                                  </Badge>
                                )}
                              </div>

                              <div className="mt-4 flex items-end justify-between">
                                <div>
                                  {result.pricing ? (
                                    <>
                                      <span className="text-xl font-bold text-white">
                                        {formatPrice(result.pricing.rent)}
                                      </span>
                                      <span className="text-white/50">/mo</span>
                                    </>
                                  ) : (
                                    <span className="text-white/50">Contact for pricing</span>
                                  )}
                                </div>
                                {result.unit.available_on && (
                                  <span className="flex items-center gap-1 text-sm text-white/40">
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
              )} {/* end !smartSearch */}
            </div>

            {/* Map View — only for standard search */}
            {showMap && !smartSearch && (
              <div className="lg:w-1/2 xl:w-2/5 h-[400px] lg:h-[calc(100dvh-300px)] rounded-xl overflow-hidden border border-white/[0.08] sticky top-4">
                <SearchMap
                  listings={visibleResults
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
      <div className="flex min-h-screen flex-col bg-black">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 bg-cyan-500/20 rounded-full blur-xl animate-pulse" />
              <Loader2 className="h-8 w-8 animate-spin text-cyan-400 relative" />
            </div>
            <p className="text-white/50 text-sm">Loading apartments...</p>
          </div>
        </main>
        <Footer />
      </div>
    }>
      <SearchContent />
    </Suspense>
  );
}
