"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowRight, Sparkles, Mic, Video, MapPin } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ListingPlaceholder } from "@/components/ui/ListingPlaceholder";
import { SimliAvatar } from "@/components/simli";
import { HomeLeadCapture } from "@/components/leads/HomeLeadCapture";
import { formatPrice } from "@/lib/utils";
import { useAnalytics } from "@/hooks/useAnalytics";

export interface HomeStats {
  cities: number;
  buildings: number;
  availableUnits: number;
}

export interface HomeCity {
  name: string;
  slug: string;
}

export interface FeaturedBuilding {
  id: string;
  name: string;
  cityName: string | null;
  neighborhood: string | null;
  image: string;
  availableUnits: number;
  minPrice: number | null;
}

function BuildingImage({ src, seed, alt }: { src: string; seed: string; alt: string }) {
  const [failed, setFailed] = useState(false);

  // Leasing sites delete and rename photos constantly. When one 404s, show the
  // placeholder rather than a stock apartment that isn't this building.
  if (failed) return <ListingPlaceholder seed={seed} name={alt} />;

  return (
    <Image
      src={src}
      alt={alt}
      fill
      className="object-cover group-hover:scale-105 transition-transform duration-500"
      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
      onError={() => setFailed(true)}
    />
  );
}

export interface TopNeighborhood {
  name: string;
  slug: string;
  cityName: string | null;
  citySlug: string | null;
}

interface HomeClientProps {
  stats: HomeStats | null;
  featured: FeaturedBuilding[];
  neighborhoods: TopNeighborhood[];
  cities: HomeCity[];
}

// Curated for the browse band and the marketing copy — ordered by how much
// inventory and sales coverage each market has, not alphabetically.
const FEATURED_CITIES: HomeCity[] = [
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

// Three, not five. Every extra option in the hero is another way to not use
// the search box, and these only have to demonstrate the phrasing.
const EXAMPLE_SEARCHES = [
  "2-bedroom in Miami under $3,500",
  "Dog-friendly apartment in Austin under $2,400",
  "Studio in Williamsburg under $2,800",
];

// A/B test: two different pitches, not two synonyms. The previous test ran
// "Stop searching." against "Stop scrolling." — a one-word delta that sits
// inside the noise floor at this traffic volume and could never resolve.
// `frustration` is the control and the copy the page metadata still matches,
// so it is also what SSR renders.
const HERO_VARIANTS = {
  frustration: {
    headline: "Stop searching.",
    accent: "Just tell Stacy what you want.",
    sub: "Describe your ideal apartment naturally. Stacy searches thousands of live listings, compares pricing and availability, and recommends the ones actually worth touring.",
  },
  outcome: {
    headline: "Your next apartment,",
    accent: "found in one sentence.",
    sub: "Tell Stacy your budget, your neighborhood and your dealbreakers. She reads thousands of live listings and comes back with the handful actually worth your time.",
  },
} as const;
type HeroVariant = keyof typeof HERO_VARIANTS;
// Versioned key: the old assignments were for a test that no longer exists, so
// they must not carry over and skew the new one.
const HERO_VARIANT_KEY = "staycio_hero_variant_v2";

// What Stacy handles, as plain claims rather than a second set of tappable
// example chips — the hero already teaches the phrasing, and repeating it here
// under the same "Try asking" label just said the same thing twice.
const STACY_CAPABILITIES = [
  "Budgets, fees and what's actually included",
  "Neighborhoods, commute times and what's nearby",
  "Pets, amenities and the dealbreakers you forget to ask about",
];

// Type for SpeechRecognition
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

export default function HomeClient({ stats, featured, neighborhoods, cities }: HomeClientProps) {
  const router = useRouter();
  const { trackEvent } = useAnalytics();
  const [searchQuery, setSearchQuery] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  // SSR renders the control variant; the sticky assignment swaps in
  // post-hydration to avoid a server/client mismatch.
  const [heroVariant, setHeroVariant] = useState<HeroVariant>("frustration");
  const heroVariantRef = useRef<HeroVariant>("frustration");
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const hero = HERO_VARIANTS[heroVariant];
  // Real rows when the query succeeded, curated list when it didn't — the
  // picker must never render empty or the form cannot be submitted.
  const leadCities = cities.length > 0 ? cities : FEATURED_CITIES;

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

  // Assign (or restore) the sticky hero variant and log an impression so each
  // variant has a denominator for conversion rate.
  useEffect(() => {
    let variant = localStorage.getItem(HERO_VARIANT_KEY) as HeroVariant | null;
    if (!variant || !(variant in HERO_VARIANTS)) {
      variant = Math.random() < 0.5 ? "frustration" : "outcome";
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

  // Real inventory as the trust signal when we have it. No "updated daily"
  // claim: the large majority of listings carry a price older than 30 days, so
  // that was a freshness promise the data could not keep.
  const proofLine =
    stats && stats.buildings >= 20
      ? stats.availableUnits >= 100
        ? `${stats.availableUnits.toLocaleString()} available apartments across ${stats.cities} cities`
        : `${stats.buildings.toLocaleString()} buildings across ${stats.cities} cities`
      : "AI-powered apartment search";

  return (
    <div className="flex min-h-screen flex-col bg-black">
      <Header />

      <main className="flex-1">
        {/* Hero — one call to action. The city pills that used to live here now
            have their own band below: a headline telling people to stop
            browsing should not be sitting on top of ten browse links.
            `pt-28` is load-bearing, not spacing taste — the header is
            `fixed top-0 h-16`, so centered hero content taller than the
            viewport slides up underneath it and clips the badge on a phone. */}
        <section className="relative flex min-h-[76svh] items-center justify-center px-6 pt-28 pb-16 overflow-hidden">
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
              {hero.headline}
              <br />
              <span className="bg-gradient-to-r from-white via-cyan-200 to-blue-400 bg-clip-text text-transparent">
                {hero.accent}
              </span>
            </h1>

            <p className="text-base sm:text-lg text-white/60 max-w-2xl mx-auto mb-8 sm:mb-10 leading-relaxed animate-fade-in [animation-delay:240ms]">
              {hero.sub}
            </p>

            {/* Search Input - Glass Style */}
            <div className="max-w-xl mx-auto animate-fade-in [animation-delay:300ms]">
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
            </div>

            {/* One quiet escape hatch, kept because the header links to
                listings from nowhere — the ten city pills that used to sit
                here were the problem, not the existence of a browse link. */}
            <p className="mt-4 text-sm text-white/50 animate-fade-in [animation-delay:320ms]">
              or{" "}
              <Link
                href="/search"
                onClick={() => trackHeroEngagement("browse_link")}
                className="text-white/60 underline underline-offset-4 decoration-white/20 hover:text-white hover:decoration-white/50 transition-colors"
              >
                browse every listing
              </Link>
            </p>

            {/* Conversational example searches — tap to run */}
            <div className="mt-6 flex flex-wrap justify-center gap-2 animate-fade-in [animation-delay:350ms]">
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
          </div>

          {/* Scroll indicator */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
            <div className="w-px h-12 bg-gradient-to-b from-white/20 to-transparent" />
          </div>
        </section>

        {/* Featured Residences — kept directly under the hero so the first
            thing past the gradient is an actual apartment. */}
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
                    Buildings with the most open units right now, so there&apos;s more to choose from.
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
                        seed={building.id}
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

        {/* Meet Stacy — moved up from the bottom of the page. She is the whole
            pitch in the hero, so she cannot be the last thing on it. */}
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
                Type it or say it out loud. Stacy answers like a person who has already read every listing.
              </p>
            </div>

            {/* Avatar Card */}
            <div className="max-w-md mx-auto">
              <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.08] rounded-3xl p-8 hover:border-cyan-500/30 transition-all duration-500">
                <SimliAvatar
                  autoStart={false}
                  className="mb-6"
                />

                <ul className="space-y-2.5">
                  {STACY_CAPABILITIES.map((capability) => (
                    <li key={capability} className="flex items-start gap-2.5 text-sm text-white/60">
                      <Sparkles className="h-4 w-4 text-cyan-400/70 shrink-0 mt-0.5" />
                      <span>{capability}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Browse — the city and neighborhood pills, together in one band
            instead of as two near-identical sections. These are the site's
            main internal links, so they stay on the page, just not in the
            hero competing with the search box. */}
        <section className="py-16 px-6 relative">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl md:text-3xl font-medium text-white mb-3">
              Or browse by city
            </h2>
            <p className="text-white/60 mb-8">
              Prefer to look around yourself? Start here.
            </p>
            <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
              {FEATURED_CITIES.map((city) => (
                <Link
                  key={city.slug}
                  href={`/cities/${city.slug}`}
                  onClick={() => trackHeroEngagement("browse_link")}
                  className="px-4 py-2 rounded-full bg-white/[0.03] border border-white/[0.06] text-sm text-white/60 hover:text-white hover:bg-white/[0.08] hover:border-white/[0.12] transition-colors duration-300"
                >
                  {city.name}
                </Link>
              ))}
            </div>

            {neighborhoods.length > 0 && (
              <>
                <h3 className="mt-14 mb-6 text-sm uppercase tracking-wider text-white/40">
                  Popular neighborhoods
                </h3>
                <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
                  {neighborhoods.map((n) => (
                    <Link
                      key={`${n.citySlug ?? ""}/${n.slug}`}
                      href={
                        n.citySlug
                          ? `/neighborhoods/${n.slug}?city=${encodeURIComponent(n.citySlug)}`
                          : `/neighborhoods/${n.slug}`
                      }
                      onClick={() => trackHeroEngagement("browse_link")}
                      className="px-4 py-2 rounded-full bg-white/[0.03] border border-white/[0.06] text-sm text-white/60 hover:text-white hover:bg-white/[0.08] hover:border-white/[0.12] transition-colors duration-300"
                    >
                      {n.name}
                      {n.cityName && <span className="text-white/50"> · {n.cityName}</span>}
                    </Link>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>

        {/* Lead capture — the homepage previously had no way to catch anyone
            who did not click straight through to search. */}
        <section className="py-24 px-6 relative overflow-hidden">
          <div className="absolute inset-0">
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-gradient-to-r from-blue-500/10 to-cyan-500/5 rounded-full blur-[110px]" />
          </div>

          <div className="relative z-10 max-w-xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-3xl md:text-4xl font-medium text-white mb-4">
                Not seeing it? <span className="bg-gradient-to-r from-cyan-200 to-blue-400 bg-clip-text text-transparent">Let Stacy keep looking.</span>
              </h2>
              <p className="text-white/60">
                Tell us what you&apos;re after and we&apos;ll come back to you when something fits — new listings, price drops, buildings that just opened up.
              </p>
            </div>

            <HomeLeadCapture cities={leadCities} defaultNotes={searchQuery} />
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
