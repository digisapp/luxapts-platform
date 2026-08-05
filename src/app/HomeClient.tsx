"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowRight, Sparkles, Mic, Video, MapPin } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { SimliAvatar } from "@/components/simli";
import { formatPrice } from "@/lib/utils";
import { useAnalytics } from "@/hooks/useAnalytics";

export interface HomeStats {
  cities: number;
  buildings: number;
  availableUnits: number;
}

export interface FeaturedBuilding {
  id: string;
  name: string;
  cityName: string | null;
  neighborhood: string | null;
  image: string;
  /** Curated image to swap in if the scraped/hotlinked photo fails to load */
  fallbackImage: string;
  availableUnits: number;
  minPrice: number | null;
}

function BuildingImage({ src, fallback, alt }: { src: string; fallback: string; alt: string }) {
  const [current, setCurrent] = useState(src);
  return (
    <Image
      src={current}
      alt={alt}
      fill
      className="object-cover group-hover:scale-105 transition-transform duration-500"
      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
      onError={() => {
        if (current !== fallback) setCurrent(fallback);
      }}
    />
  );
}

export interface TopNeighborhood {
  name: string;
  slug: string;
  cityName: string | null;
}

interface HomeClientProps {
  stats: HomeStats | null;
  featured: FeaturedBuilding[];
  neighborhoods: TopNeighborhood[];
}

const FEATURED_CITIES = [
  { name: "New York", slug: "new-york" },
  { name: "Miami", slug: "miami" },
  { name: "Los Angeles", slug: "los-angeles" },
  { name: "Chicago", slug: "chicago" },
  { name: "San Francisco", slug: "san-francisco" },
  { name: "Dallas", slug: "dallas" },
  { name: "Austin", slug: "austin" },
  { name: "Nashville", slug: "nashville" },
  { name: "Atlanta", slug: "atlanta" },
  { name: "Brooklyn", slug: "brooklyn" },
];

const STACY_PROMPTS = [
  "Find me a 2 bed in Miami",
  "What has a rooftop pool?",
  "Dog-friendly buildings",
];

// Conversational example searches — teach "describe it" over "browse".
// Price-first phrasing: most people think in price before amenities.
const EXAMPLE_SEARCHES = [
  "Studio in Williamsburg under $2,800",
  "2-bedroom in Miami under $3,500",
  "Dog-friendly apartment in Austin under $2,400",
  "Luxury apartment in Brickell with a rooftop pool",
  "Walk to downtown Nashville under $2,200",
];

// A/B test: which frustration framing converts better. Variant is sticky per
// browser (localStorage) and stamped on hero engagement events so conversion
// can be compared per variant in the analytics dashboard.
const HERO_VARIANTS = {
  searching: "Stop searching.",
  scrolling: "Stop scrolling.",
} as const;
type HeroVariant = keyof typeof HERO_VARIANTS;
const HERO_VARIANT_KEY = "staycio_hero_variant";

// Type for SpeechRecognition
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

export default function HomeClient({ stats, featured, neighborhoods }: HomeClientProps) {
  const router = useRouter();
  const { trackEvent } = useAnalytics();
  const [searchQuery, setSearchQuery] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  // SSR renders the "searching" variant; the sticky assignment swaps in
  // post-hydration to avoid a server/client mismatch.
  const [heroVariant, setHeroVariant] = useState<HeroVariant>("searching");
  const heroVariantRef = useRef<HeroVariant>("searching");
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Check for speech recognition support + cleanup on unmount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      // Browser-capability detection must happen post-hydration so server and
      // first client render match.
      setSpeechSupported(!!SpeechRecognition);
    }
    return () => {
      // Prevent memory leak: stop recognition if component unmounts while listening
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    };
  }, []);

  // Assign (or restore) the sticky hero headline variant and log an
  // impression so each variant has a denominator for conversion rate.
  useEffect(() => {
    let variant = localStorage.getItem(HERO_VARIANT_KEY) as HeroVariant | null;
    if (!variant || !(variant in HERO_VARIANTS)) {
      variant = Math.random() < 0.5 ? "searching" : "scrolling";
      localStorage.setItem(HERO_VARIANT_KEY, variant);
    }
    heroVariantRef.current = variant;
    setHeroVariant(variant);
    const impressionKey = `${HERO_VARIANT_KEY}_seen`;
    if (!sessionStorage.getItem(impressionKey)) {
      sessionStorage.setItem(impressionKey, "true");
      trackEvent("hero_variant_view", "engagement", { variant });
    }
    // trackEvent identity changes when auth hydrates; the impressionKey guard
    // makes re-runs harmless, but only mount matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trackHeroEngagement = (source: "search" | "voice" | "example" | "browse_link") => {
    trackEvent("hero_engaged", "conversion", { variant: heroVariantRef.current, source });
  };

  const startListening = () => {
    if (!speechSupported) return;

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return;

    const recognition = new SpeechRecognitionAPI();

    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      setSearchQuery(transcript);
      setIsListening(false);
      // Auto-search after voice input
      if (transcript.trim()) {
        trackHeroEngagement("voice");
        router.push(`/search?q=${encodeURIComponent(transcript.trim())}`);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  const handleSearch = () => {
    trackHeroEngagement("search");
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      router.push("/search");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  // Real inventory as the trust signal when we have it, generic tagline as fallback
  const proofLine =
    stats && stats.buildings >= 20
      ? stats.availableUnits >= 100
        ? `${stats.availableUnits.toLocaleString()} apartments across ${stats.cities} cities • Updated daily`
        : `${stats.buildings.toLocaleString()} buildings across ${stats.cities} cities • Updated daily`
      : "AI-Powered Search";

  return (
    <div className="flex min-h-screen flex-col bg-black">
      <Header />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative flex min-h-[85svh] items-center justify-center px-6 overflow-hidden">
          {/* Premium gradient background with aurora effect */}
          <div className="absolute inset-0">
            {/* Primary glow */}
            <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[600px] bg-gradient-to-r from-blue-500/10 via-sky-500/10 to-cyan-500/10 rounded-full blur-[120px]" />
            {/* Secondary glow */}
            <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-gradient-to-r from-rose-500/5 to-orange-500/5 rounded-full blur-[100px]" />
            {/* Accent glow */}
            <div className="absolute top-1/2 right-1/4 w-[300px] h-[300px] bg-cyan-500/5 rounded-full blur-[80px]" />
            {/* Grid overlay */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:100px_100px]" />
          </div>

          <div className="relative z-10 max-w-4xl mx-auto text-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] mb-8 animate-fade-in">
              <Sparkles className="h-4 w-4 text-cyan-400" />
              <span className="text-sm text-white/70">{proofLine}</span>
            </div>

            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-medium tracking-tight text-white mb-5 sm:mb-6 animate-fade-in [animation-delay:100ms]">
              {HERO_VARIANTS[heroVariant]}
              <br />
              <span className="bg-gradient-to-r from-white via-cyan-200 to-blue-400 bg-clip-text text-transparent">Just tell Stacy what you want.</span>
            </h1>

            <p className="text-base sm:text-lg text-white/60 max-w-2xl mx-auto mb-8 sm:mb-12 leading-relaxed animate-fade-in [animation-delay:240ms]">
              Describe your ideal apartment naturally. Stacy searches thousands of live listings, compares pricing and availability, and recommends the ones actually worth touring.
            </p>

            {/* Search Input - Glass Style */}
            <div className="max-w-xl mx-auto mb-5 animate-fade-in [animation-delay:300ms]">
              <div className="relative group">
                {/* Glow effect on focus */}
                <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-cyan-500/20 rounded-full blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-500" />
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="2-bedroom in Miami under $3,500"
                    className="w-full h-12 sm:h-14 px-5 sm:px-6 pr-14 sm:pr-48 rounded-full bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] text-white text-base placeholder:text-white/40 focus:outline-none focus:border-white/20 focus:bg-white/[0.05] transition-all duration-300"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 sm:gap-2">
                    {/* Voice Search Button */}
                    {speechSupported && (
                      <button
                        onClick={isListening ? stopListening : startListening}
                        className={`h-9 w-9 sm:h-10 sm:w-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                          isListening
                            ? "bg-red-500 text-white animate-pulse"
                            : "bg-white/[0.08] text-white/60 hover:bg-white/[0.15] hover:text-white"
                        }`}
                        aria-label={isListening ? "Stop listening" : "Voice search"}
                      >
                        <Mic className="h-4 w-4" />
                      </button>
                    )}
                    {/* Search Button */}
                    <button
                      onClick={handleSearch}
                      aria-label="Ask Stacy"
                      className="h-9 w-9 sm:h-10 sm:w-auto sm:px-5 rounded-full bg-white text-black font-medium text-sm flex items-center justify-center gap-2 hover:bg-white/90 hover:shadow-lg hover:shadow-white/20 transition-all duration-300"
                    >
                      <ArrowRight className="h-4 w-4" />
                      <span className="hidden sm:inline whitespace-nowrap">Ask Stacy</span>
                    </button>
                  </div>
                </div>
              </div>
              <p className="mt-4 text-sm text-white/40">
                or{" "}
                <Link
                  href="/search"
                  onClick={() => trackHeroEngagement("browse_link")}
                  className="text-white/60 underline underline-offset-4 decoration-white/20 hover:text-white hover:decoration-white/50 transition-colors"
                >
                  start your search
                </Link>
              </p>
            </div>

            {/* Conversational example searches — tap to run */}
            <p className="text-xs uppercase tracking-wider text-white/40 mb-3 animate-fade-in [animation-delay:330ms]">
              Try asking
            </p>
            <div className="flex flex-wrap justify-center gap-2 mb-8 animate-fade-in [animation-delay:350ms]">
              {EXAMPLE_SEARCHES.map((example) => (
                <button
                  key={example}
                  onClick={() => {
                    trackHeroEngagement("example");
                    router.push(`/search?q=${encodeURIComponent(example)}`);
                  }}
                  className="px-3 py-1.5 rounded-full text-xs text-white/50 border border-transparent hover:text-white hover:bg-white/[0.05] hover:border-white/[0.1] transition-colors duration-300 cursor-pointer"
                >
                  &ldquo;{example}&rdquo;
                </button>
              ))}
            </div>

            {/* Quick links - Glass Pills */}
            <div className="flex flex-wrap justify-center gap-2 sm:gap-3 text-sm">
              {FEATURED_CITIES.map((city, index) => (
                <Link
                  key={city.slug}
                  href={`/cities/${city.slug}`}
                  className="animate-fade-in px-3 py-1.5 sm:px-4 sm:py-2 rounded-full bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] text-white/60 hover:text-white hover:bg-white/[0.08] hover:border-white/[0.12] transition-colors duration-300 text-xs sm:text-sm"
                  style={{ animationDelay: `${400 + index * 40}ms` }}
                >
                  {city.name}
                </Link>
              ))}
            </div>
          </div>

          {/* Scroll indicator */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
            <div className="w-px h-12 bg-gradient-to-b from-white/20 to-transparent" />
          </div>
        </section>

        {/* Featured Residences */}
        {featured.length > 0 && (
          <section className="py-24 px-6 relative overflow-hidden">
            {/* Background effect */}
            <div className="absolute inset-0">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] bg-gradient-to-r from-cyan-500/5 to-blue-500/5 rounded-full blur-[100px]" />
            </div>

            <div className="relative z-10 max-w-6xl mx-auto">
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-12">
                <div>
                  <h2 className="text-3xl md:text-4xl font-medium text-white mb-3">
                    Featured <span className="bg-gradient-to-r from-cyan-200 to-blue-400 bg-clip-text text-transparent">residences</span>
                  </h2>
                  <p className="text-white/60">
                    Buildings with the most availability right now.
                  </p>
                </div>
                <Link
                  href="/search"
                  className="inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition-colors shrink-0"
                >
                  View all
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {featured.map((building) => (
                  <Link
                    key={building.id}
                    href={`/buildings/${building.id}`}
                    className="group rounded-2xl overflow-hidden bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.18] hover:bg-white/[0.05] transition-colors duration-300"
                  >
                    <div className="relative h-52 overflow-hidden">
                      <BuildingImage
                        src={building.image}
                        fallback={building.fallbackImage}
                        alt={building.name}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                      {building.neighborhood && (
                        <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-sm text-xs text-white/90">
                          {building.neighborhood}
                        </span>
                      )}
                      {building.availableUnits > 0 && (
                        <span className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-emerald-500/80 backdrop-blur-sm text-xs text-white font-medium">
                          {building.availableUnits} available
                        </span>
                      )}
                    </div>

                    <div className="p-5">
                      <h3 className="text-white font-medium leading-tight mb-1">{building.name}</h3>
                      {building.cityName && (
                        <p className="text-sm text-white/50 flex items-center gap-1 mb-4">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          {building.cityName}
                        </p>
                      )}
                      <div className="flex items-center justify-between">
                        {building.minPrice ? (
                          <p className="text-sm text-white/60">
                            From <span className="text-white font-medium">{formatPrice(building.minPrice)}</span>/mo
                          </p>
                        ) : (
                          <p className="text-sm text-white/50">Contact for pricing</p>
                        )}
                        <ArrowRight className="h-4 w-4 text-white/40 group-hover:text-white group-hover:translate-x-0.5 transition-all duration-300" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Browse by Neighborhood */}
        {neighborhoods.length > 0 && (
          <section className="py-16 px-6 relative">
            <div className="max-w-4xl mx-auto text-center">
              <h2 className="text-2xl md:text-3xl font-medium text-white mb-3">
                Browse by neighborhood
              </h2>
              <p className="text-white/60 mb-8">
                Explore apartments by neighborhood.
              </p>
              <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
                {neighborhoods.map((n) => (
                  <Link
                    key={n.slug}
                    href={`/neighborhoods/${n.slug}`}
                    className="px-4 py-2 rounded-full bg-white/[0.03] border border-white/[0.06] text-sm text-white/60 hover:text-white hover:bg-white/[0.08] hover:border-white/[0.12] transition-colors duration-300"
                  >
                    {n.name}
                    {n.cityName && <span className="text-white/40"> · {n.cityName}</span>}
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Meet Stacy Section */}
        <section className="py-24 px-6 relative overflow-hidden">
          {/* Background effects */}
          <div className="absolute inset-0">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-cyan-500/5 rounded-full blur-[100px]" />
          </div>

          <div className="relative z-10 max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-500/10 border border-cyan-500/20 mb-6">
                <Video className="h-4 w-4 text-cyan-400" />
                <span className="text-sm text-cyan-300">AI Video Assistant</span>
              </div>
              <h2 className="text-4xl md:text-5xl font-medium text-white mb-4">
                Talk to <span className="bg-gradient-to-r from-cyan-200 to-blue-400 bg-clip-text text-transparent">Stacy</span>
              </h2>
              <p className="text-lg text-white/60 max-w-xl mx-auto">
                Talk naturally. Stacy understands budgets, neighborhoods, commute times, pets, amenities, and the little details that matter.
              </p>
            </div>

            {/* Avatar Card */}
            <div className="max-w-md mx-auto">
              <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.08] rounded-3xl p-8 hover:border-cyan-500/30 transition-all duration-500">
                <SimliAvatar
                  autoStart={false}
                  className="mb-6"
                />

                {/* Example prompts — tappable, run as a search */}
                <div className="space-y-2">
                  <p className="text-xs text-white/50 uppercase tracking-wider mb-3">Try asking</p>
                  <div className="flex flex-wrap gap-2">
                    {STACY_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => router.push(`/search?q=${encodeURIComponent(prompt)}`)}
                        className="text-xs px-3 py-1.5 rounded-full bg-white/[0.05] text-white/60 border border-white/[0.08] hover:bg-white/[0.1] hover:text-white hover:border-white/[0.16] transition-colors duration-300 cursor-pointer"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

      </main>

      <Footer />
    </div>
  );
}
