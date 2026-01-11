"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Sparkles } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

const FEATURED_CITIES = [
  { name: "New York", slug: "new-york" },
  { name: "Miami", slug: "miami" },
  { name: "Los Angeles", slug: "los-angeles" },
  { name: "Dallas", slug: "dallas" },
  { name: "Austin", slug: "austin" },
  { name: "Nashville", slug: "nashville" },
  { name: "Atlanta", slug: "atlanta" },
  { name: "Brooklyn", slug: "brooklyn" },
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
        <section className="relative flex min-h-screen items-center justify-center px-6 overflow-hidden">
          {/* Premium gradient background with aurora effect */}
          <div className="absolute inset-0">
            {/* Primary glow */}
            <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[600px] bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-cyan-500/10 rounded-full blur-[120px] animate-pulse" />
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
              <span className="text-sm text-white/70">AI-Powered Search</span>
            </div>

            <h1 className="text-5xl md:text-7xl lg:text-8xl font-medium tracking-tight text-white mb-8 animate-fade-in [animation-delay:100ms]">
              Find your
              <br />
              <span className="bg-gradient-to-r from-white via-cyan-200 to-blue-400 bg-clip-text text-transparent">perfect home</span>
            </h1>

            <p className="text-lg md:text-xl text-white/50 max-w-2xl mx-auto mb-12 leading-relaxed animate-fade-in [animation-delay:200ms]">
              AI-powered apartment search across major US cities.
              Real-time pricing, instant comparisons, zero hassle.
            </p>

            {/* Search Input - Glass Style */}
            <div className="max-w-xl mx-auto mb-8 animate-fade-in [animation-delay:300ms]">
              <div className="relative group">
                {/* Glow effect on focus */}
                <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-purple-500/20 rounded-full blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-500" />
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Try: '2 bedroom in Miami under $3,500' or 'pet-friendly studio NYC'"
                    className="w-full h-14 px-6 rounded-full bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] text-white placeholder:text-white/30 focus:outline-none focus:border-white/20 focus:bg-white/[0.05] transition-all duration-300"
                  />
                  <button
                    onClick={handleSearch}
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-10 px-6 rounded-full bg-white text-black font-medium text-sm flex items-center gap-2 hover:bg-white/90 hover:shadow-lg hover:shadow-white/20 transition-all duration-300"
                  >
                    Search
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Quick links - Glass Pills */}
            <div className="flex flex-wrap justify-center gap-3 text-sm animate-fade-in [animation-delay:400ms]">
              {FEATURED_CITIES.map((city, index) => (
                <Link
                  key={city.slug}
                  href={`/search?city=${city.slug}`}
                  className="px-4 py-2 rounded-full bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] text-white/50 hover:text-white hover:bg-white/[0.08] hover:border-white/[0.12] transition-all duration-300"
                  style={{ animationDelay: `${400 + index * 50}ms` }}
                >
                  {city.name}
                </Link>
              ))}
            </div>
          </div>

          {/* Scroll indicator */}
          <div className="absolute bottom-12 left-1/2 -translate-x-1/2 animate-bounce">
            <div className="w-px h-16 bg-gradient-to-b from-white/20 to-transparent" />
          </div>
        </section>

        {/* Features Section */}
        <section className="py-32 px-6 relative">
          {/* Background glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-blue-500/5 rounded-full blur-[100px]" />

          <div className="relative max-w-6xl mx-auto">
            <div className="grid md:grid-cols-3 gap-6">
              {/* AI Search Card */}
              <div className="group p-8 rounded-2xl bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] hover:bg-white/[0.04] hover:border-white/[0.1] transition-all duration-500">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/20 mb-6 group-hover:scale-110 transition-transform duration-300">
                  <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                </div>
                <h3 className="text-xl font-medium text-white mb-3">AI Search</h3>
                <p className="text-white/40 leading-relaxed">
                  Describe what you want in natural language. Our AI understands context and finds exactly what you need.
                </p>
              </div>

              {/* Real-time Data Card */}
              <div className="group p-8 rounded-2xl bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] hover:bg-white/[0.04] hover:border-white/[0.1] transition-all duration-500">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/20 mb-6 group-hover:scale-110 transition-transform duration-300">
                  <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                  </svg>
                </div>
                <h3 className="text-xl font-medium text-white mb-3">Real-time Data</h3>
                <p className="text-white/40 leading-relaxed">
                  Always current pricing and availability. Track price changes over time. Never see outdated listings.
                </p>
              </div>

              {/* Compare Card */}
              <div className="group p-8 rounded-2xl bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] hover:bg-white/[0.04] hover:border-white/[0.1] transition-all duration-500">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/20 mb-6 group-hover:scale-110 transition-transform duration-300">
                  <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                  </svg>
                </div>
                <h3 className="text-xl font-medium text-white mb-3">Compare</h3>
                <p className="text-white/40 leading-relaxed">
                  Side-by-side building comparisons. Amenities, pricing, policies, and neighborhood data all in one view.
                </p>
              </div>
            </div>
          </div>
        </section>

      </main>

      <Footer />
    </div>
  );
}
