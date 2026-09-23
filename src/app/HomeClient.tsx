"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { buildingPath } from "@/lib/seo/urls";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowRight, Sparkles, Mic, MapPin } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ListingPlaceholder } from "@/components/ui/ListingPlaceholder";
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
  /** SEO slug (migration 026). Falls back to the id when absent. */
  slug?: string | null;
  name: string;
  cityName: string | null;
  neighborhood: string | null;
  image: string;
  availableUnits: number;
  minPrice: number | null;
  /** Bedroom range across the building's open units; 0 is a studio. */
  bedRange: { min: number; max: number } | null;
}

function formatBeds(n: number): string {
  return n === 0 ? "Studio" : `${n} bed`;
}

function formatBedRange(r: { min: number; max: number }): string {
  if (r.min === r.max) return formatBeds(r.min);
  // "Studio–2 bed", "1–3 bed"
  return `${r.min === 0 ? "Studio" : r.min}–${formatBeds(r.max)}`;
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
  units: number;
}

interface HomeClientProps {
  stats: HomeStats | null;
  featured: FeaturedBuilding[];
  neighborhoods: TopNeighborhood[];
  cities: HomeCity[];
  /** Markets with open units, most inventory first. */
  browseCities: HomeCity[];
}

// Fallback only, for when the inventory query fails. The live list comes from
// `browseCities`, so a market never gets a button after it runs dry — this
// curated list used to link Chicago and San Francisco with nothing open in
// either.
const FEATURED_CITIES: HomeCity[] = [
  { name: "New York", slug: "new-york" },
  { name: "Miami", slug: "miami" },
  { name: "Los Angeles", slug: "los-angeles" },
  { name: "Dallas", slug: "dallas" },
  { name: "Austin", slug: "austin" },
  { name: "Nashville", slug: "nashville" },
  { name: "Atlanta", slug: "atlanta" },
  { name: "Brooklyn", slug: "brooklyn" },
];

// Three, not five. Every extra option in the hero is another way to not use
// the search box, and these only have to demonstrate the phrasing.
//
// Each one has to be a query the parser actually fills in and the search
// actually answers — an example that returns an empty page is worse than no
// example. Between them they show the three things a filter row cannot do:
// neighborhood + amenity, a pet rule, and a move-in date.
const EXAMPLE_SEARCHES = [
  "1 bed in Brickell under $3,500 with a pool and gym",
  "Dog-friendly in Austin under $2,400, moving in November",
  "Studio in Williamsburg with a gym",
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
    sub: "Tell Stacy where you want to live, your budget, move-in date, and must-haves. She searches every available listing and brings you the best matches.",
  },
  outcome: {
    headline: "Your next apartment,",
    accent: "found in one sentence.",
    sub: "One sentence — neighborhood, budget, move-in date, dealbreakers. Stacy reads every available listing and comes back with the handful actually worth your time.",
  },
} as const;
type HeroVariant = keyof typeof HERO_VARIANTS;
// Versioned key: the old assignments were for a test that no longer exists, so
// they must not carry over and skew the new one.
const HERO_VARIANT_KEY = "staycio_hero_variant_v2";

// Type for SpeechRecognition
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

export default function HomeClient({ stats, featured, neighborhoods, cities, browseCities }: HomeClientProps) {
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
  const cityLinks = browseCities.length > 0 ? browseCities : FEATURED_CITIES;
  // The same buildings the featured grid renders, reused as the hero backdrop
  // so the first screen shows real inventory without a second image payload.
  const heroImages = featured.slice(0, 6);

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
        <section className="relative flex min-h-[64svh] items-center justify-center px-6 pt-28 pb-14 overflow-hidden">
          {/* Real inventory as the backdrop. This page sells apartments, so the
              first screen has to contain some — the aurora on its own was a
              black rectangle with a paragraph on it, and the first photograph
              did not appear until 1,000px down. Scrimmed hard so it reads as
              texture behind the headline, never as content competing with it. */}
          <div className="absolute inset-0" aria-hidden="true">
            {heroImages.length > 0 && (
              <div className="absolute inset-0 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 blur-[5px] scale-[1.06]">
                {heroImages.map((building, i) => (
                  <div
                    key={building.id}
                    className={`relative h-full ${
                      i < 2 ? "" : i === 2 ? "hidden sm:block" : "hidden lg:block"
                    }`}
                  >
                    {/* Blurred to 5px and sitting under three scrims, so it
                        is fetched small and cheap — asking for the full tile
                        width and quality here would cost real bytes on the
                        critical path for pixels nobody can resolve. */}
                    <Image
                      src={building.image}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 25vw, 15vw"
                      quality={40}
                      priority={i < 2}
                    />
                  </div>
                ))}
              </div>
            )}
            {/* Scrim stack: flat wash to drop the photos to texture, radial to
                clear the centre for type, then top and bottom fades so the
                header and the featured band below both meet pure black. */}
            <div className="absolute inset-0 bg-black/[0.6]" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_45%,rgba(0,0,0,0.86)_0%,rgba(0,0,0,0.66)_55%,rgba(0,0,0,0.4)_100%)]" />
            <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black via-black/80 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-black" />
            {/* Aurora, now over the photography rather than instead of it */}
            <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[600px] bg-cyan-500/[0.07] rounded-full blur-[120px]" />
            <div className="absolute top-1/2 right-1/4 w-[300px] h-[300px] bg-cyan-500/5 rounded-full blur-[80px]" />
          </div>

          <div className="relative z-10 max-w-4xl mx-auto text-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] mb-6 sm:mb-8 animate-fade-in">
              <Sparkles className="h-4 w-4 text-cyan-400" />
              <span className="text-sm text-white/70">{proofLine}</span>
            </div>

            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-medium tracking-tight text-balance text-white mb-6 animate-fade-in [animation-delay:100ms]">
              {hero.headline}
              <br />
              <span className="bg-gradient-to-r from-white via-cyan-200 to-cyan-400 bg-clip-text text-transparent">
                {hero.accent}
              </span>
            </h1>

            {/* Hidden on phones: at four lines it pushed the example searches
                below the fixed bottom nav, and the examples teach the same
                thing — what to type — more concretely than the sentence. */}
            <p className="hidden sm:block text-lg text-white/60 max-w-2xl mx-auto mb-10 leading-relaxed animate-fade-in [animation-delay:240ms]">
              {hero.sub}
            </p>

            {/* Search Input - Glass Style */}
            <div className="max-w-xl mx-auto animate-fade-in [animation-delay:300ms]">
              <div className="relative group">
                {/* Glow effect on focus */}
                <div className="absolute -inset-1 bg-cyan-500/20 rounded-full blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-500" />
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="2-bedroom in Miami under $3,500"
                    className="w-full h-12 sm:h-14 px-5 sm:px-6 pr-14 sm:pr-48 rounded-full bg-white/[0.06] backdrop-blur-xl border border-white/[0.14] text-white text-base placeholder:text-white/50 focus:outline-none focus:border-white/30 focus:bg-white/[0.09] transition-all duration-300"
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
                    {/* Search button — inline from sm up, where there is room
                        for it to keep its label. On a phone it used to be a
                        36px unlabelled circle that the placeholder ran
                        underneath (pr-14 could not clear mic + button), so
                        below it becomes a full-width labelled CTA instead. */}
                    <button
                      onClick={handleSearch}
                      className="hidden sm:flex h-10 px-5 rounded-full bg-white text-black font-medium text-sm items-center justify-center gap-2 hover:bg-white/90 hover:shadow-lg hover:shadow-white/20 transition-all duration-300"
                    >
                      <ArrowRight className="h-4 w-4" />
                      <span className="whitespace-nowrap">Ask Stacy</span>
                    </button>
                  </div>
                </div>
              </div>

              <button
                onClick={handleSearch}
                className="sm:hidden mt-3 w-full h-12 rounded-full bg-white text-black font-medium text-base flex items-center justify-center gap-2 active:bg-white/90 transition-colors duration-300"
              >
                Ask Stacy
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            {/* One quiet escape hatch, kept because the header links to
                listings from nowhere — the ten city pills that used to sit
                here were the problem, not the existence of a browse link. */}
            <p className="mt-4 text-sm text-white/60 animate-fade-in [animation-delay:320ms]">
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
                  className="px-3.5 py-1.5 rounded-full text-xs sm:text-sm text-white/70 bg-white/[0.04] border border-white/[0.12] hover:text-white hover:bg-white/[0.1] hover:border-white/[0.22] transition-colors duration-300 cursor-pointer"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Featured Residences — kept directly under the hero so the first
            thing past the gradient is an actual apartment. */}
        {featured.length > 0 && (
          <section className="py-16 sm:py-20 px-6 relative overflow-hidden">
            {/* Background effect */}
            <div className="absolute inset-0">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] bg-gradient-to-r from-cyan-500/5 to-cyan-500/5 rounded-full blur-[100px]" />
            </div>

            <div className="relative z-10 max-w-6xl mx-auto">
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8 sm:mb-10">
                <div>
                  {/* Solid, not gradient. The gradient belongs to the h1; when
                      every heading has it, it stops reading as an accent. */}
                  <h2 className="text-3xl md:text-4xl font-medium text-white mb-3">
                    Buildings with the most availability
                  </h2>
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
                    href={buildingPath(building)}
                    className="group rounded-2xl overflow-hidden bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.18] hover:bg-white/[0.05] transition-colors duration-300"
                  >
                    <div className="relative h-44 sm:h-52 overflow-hidden">
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
                        <span className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-black/60 ring-1 ring-emerald-400/30 backdrop-blur-sm text-xs text-emerald-300 font-medium">
                          {building.availableUnits} available
                        </span>
                      )}
                    </div>

                    <div className="p-5">
                      <h3 className="text-lg text-white font-medium leading-tight mb-1">{building.name}</h3>
                      {(building.cityName || building.bedRange) && (
                        <p className="text-sm text-white/70 flex items-center gap-1 mb-4">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          {building.cityName}
                          {building.cityName && building.bedRange && (
                            <span aria-hidden="true" className="px-1 text-white/25">·</span>
                          )}
                          {building.bedRange && formatBedRange(building.bedRange)}
                        </p>
                      )}
                      <div className="flex items-center justify-between">
                        {building.minPrice ? (
                          <p className="text-base text-white/70">
                            From <span className="text-white font-semibold">{formatPrice(building.minPrice)}</span>/mo
                          </p>
                        ) : (
                          <p className="text-base text-white/70">Contact for pricing</p>
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

        {/* Browse — the city and neighborhood pills, together in one band
            instead of as two near-identical sections. These are the site's
            main internal links, so they stay on the page, just not in the
            hero competing with the search box. */}
        <section className="py-14 sm:py-16 px-6 relative">
          <div className="max-w-6xl mx-auto">
            {/* Grids, not a centred wrap. Ten and twelve chips justified to the
                centre broke into an 8+2 and a 5/4/3 pyramid that read as a
                layout accident; an even grid is the same links, deliberate. */}
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-8">
              <div>
                <h2 className="text-2xl md:text-3xl font-medium text-white mb-2">
                  Or browse by city
                </h2>
                <p className="text-white/60">
                  Prefer to look around yourself? Start here.
                </p>
              </div>
              {/* The rest of the markets we cover — including ones with
                  nothing open right now, which this band leaves out. */}
              <Link
                href="/cities"
                onClick={() => trackHeroEngagement("browse_link")}
                className="inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition-colors shrink-0"
              >
                All cities
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              {cityLinks.map((city) => (
                <Link
                  key={city.slug}
                  href={`/cities/${city.slug}`}
                  onClick={() => trackHeroEngagement("browse_link")}
                  className="px-4 py-3 rounded-full text-center bg-white/[0.03] border border-white/[0.08] text-base text-white/85 hover:text-white hover:bg-white/[0.08] hover:border-white/[0.18] transition-colors duration-300"
                >
                  {city.name}
                </Link>
              ))}
            </div>

            {neighborhoods.length > 0 && (
              <>
                <h3 className="mt-12 mb-5 text-sm uppercase tracking-wider text-white/60">
                  Popular neighborhoods
                </h3>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
                  {neighborhoods.map((n) => (
                    <Link
                      key={`${n.citySlug ?? ""}/${n.slug}`}
                      href={
                        n.citySlug
                          ? `/neighborhoods/${n.slug}?city=${encodeURIComponent(n.citySlug)}`
                          : `/neighborhoods/${n.slug}`
                      }
                      onClick={() => trackHeroEngagement("browse_link")}
                      className="px-4 py-3 rounded-2xl bg-white/[0.03] border border-white/[0.08] text-base text-white/90 hover:text-white hover:bg-white/[0.08] hover:border-white/[0.18] transition-colors duration-300"
                    >
                      <span className="block truncate">{n.name}</span>
                      <span className="block truncate text-sm text-white/60">
                        {n.cityName}
                        {n.cityName && <span aria-hidden="true" className="px-1 text-white/25">·</span>}
                        <span className="text-emerald-300">{n.units} available</span>
                      </span>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>

        {/* Lead capture — the homepage previously had no way to catch anyone
            who did not click straight through to search. */}
        <section className="py-16 sm:py-20 px-6 relative overflow-hidden">
          <div className="absolute inset-0">
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-gradient-to-r from-cyan-500/10 to-cyan-500/5 rounded-full blur-[110px]" />
          </div>

          <div className="relative z-10 max-w-xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-3xl md:text-4xl font-medium text-balance text-white mb-4">
                Still looking? Let Stacy keep searching.
              </h2>
              <p className="text-white/60">
                Tell her what you&apos;re looking for, and she&apos;ll let you know when something matches — whether it&apos;s a new listing, a price drop, or new availability.
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
