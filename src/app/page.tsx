"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

const FEATURED_CITIES = [
  { name: "New York", slug: "new-york" },
  { name: "Miami", slug: "miami" },
  { name: "Los Angeles", slug: "los-angeles" },
  { name: "Austin", slug: "austin" },
  { name: "Chicago", slug: "chicago" },
  { name: "San Francisco", slug: "san-francisco" },
];

export default function HomePage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = () => {
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

  return (
    <div className="flex min-h-screen flex-col bg-black">
      <Header />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative flex min-h-screen items-center justify-center px-6">
          {/* Subtle gradient background */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-radial from-zinc-900/50 via-transparent to-transparent rounded-full blur-3xl" />
          </div>

          <div className="relative z-10 max-w-4xl mx-auto text-center fade-in">
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-medium tracking-tight text-white mb-8">
              Find your
              <br />
              <span className="gradient-text">perfect home</span>
            </h1>

            <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-12 leading-relaxed">
              AI-powered apartment search across major US cities.
              Real-time pricing, instant comparisons, zero hassle.
            </p>

            {/* Search Input */}
            <div className="max-w-xl mx-auto mb-8">
              <div className="relative group">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Try: '2 bedroom in Miami under $3,500' or 'pet-friendly studio NYC'"
                  className="w-full h-14 px-6 rounded-full bg-zinc-900/80 border border-zinc-800 text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-700 focus:ring-1 focus:ring-zinc-700 transition-all"
                />
                <button
                  onClick={handleSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-10 px-6 rounded-full bg-white text-black font-medium text-sm flex items-center gap-2 hover:bg-zinc-200 transition-colors"
                >
                  Search
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Quick links */}
            <div className="flex flex-wrap justify-center gap-3 text-sm">
              {FEATURED_CITIES.map((city) => (
                <Link
                  key={city.slug}
                  href={`/search?city=${city.slug}`}
                  className="px-4 py-2 rounded-full border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors"
                >
                  {city.name}
                </Link>
              ))}
            </div>
          </div>

          {/* Scroll indicator */}
          <div className="absolute bottom-12 left-1/2 -translate-x-1/2">
            <div className="w-px h-16 bg-gradient-to-b from-zinc-700 to-transparent" />
          </div>
        </section>

        {/* Features Section */}
        <section className="py-32 px-6">
          <div className="max-w-6xl mx-auto">
            <div className="grid md:grid-cols-3 gap-12 md:gap-8">
              <div className="text-center md:text-left">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 mb-6">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                </div>
                <h3 className="text-xl font-medium text-white mb-3">AI Search</h3>
                <p className="text-zinc-500 leading-relaxed">
                  Describe what you want in natural language. Our AI understands context and finds exactly what you need.
                </p>
              </div>

              <div className="text-center md:text-left">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 mb-6">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                  </svg>
                </div>
                <h3 className="text-xl font-medium text-white mb-3">Real-time Data</h3>
                <p className="text-zinc-500 leading-relaxed">
                  Always current pricing and availability. Track price changes over time. Never see outdated listings.
                </p>
              </div>

              <div className="text-center md:text-left">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 mb-6">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                  </svg>
                </div>
                <h3 className="text-xl font-medium text-white mb-3">Compare</h3>
                <p className="text-zinc-500 leading-relaxed">
                  Side-by-side building comparisons. Amenities, pricing, policies, and neighborhood data all in one view.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Cities Grid */}
        <section className="py-32 px-6 border-t border-zinc-900">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-medium text-white mb-4">
                Explore cities
              </h2>
              <p className="text-zinc-500">
                Premium apartments in top US markets
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[
                { name: "New York City", slug: "new-york", count: "12,000+" },
                { name: "Miami", slug: "miami", count: "8,500+" },
                { name: "Los Angeles", slug: "la", count: "10,000+" },
                { name: "Chicago", slug: "chicago", count: "7,800+" },
                { name: "Austin", slug: "austin", count: "5,200+" },
                { name: "San Francisco", slug: "sf", count: "4,500+" },
              ].map((city) => (
                <Link
                  key={city.slug}
                  href={`/search?city=${city.slug}`}
                  className="group relative p-8 rounded-2xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900 transition-all"
                >
                  <h3 className="text-lg font-medium text-white group-hover:text-white transition-colors">
                    {city.name}
                  </h3>
                  <p className="text-sm text-zinc-500 mt-1">
                    {city.count} listings
                  </p>
                  <ArrowRight className="absolute top-8 right-8 h-5 w-5 text-zinc-700 group-hover:text-zinc-400 group-hover:translate-x-1 transition-all" />
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-32 px-6">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-medium text-white mb-6">
              Ready to find home?
            </h2>
            <p className="text-zinc-400 mb-10">
              Start your search today. It&apos;s free, fast, and powered by AI.
            </p>
            <Link
              href="/search"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-white text-black font-medium hover:bg-zinc-200 transition-colors"
            >
              Get started
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
