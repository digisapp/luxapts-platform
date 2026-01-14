"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Sparkles, Mic } from "lucide-react";
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

// Type for SpeechRecognition
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

export default function HomePage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Check for speech recognition support
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      setSpeechSupported(!!SpeechRecognition);
    }
  }, []);

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
        <section className="relative flex min-h-[85vh] items-center justify-center px-6 overflow-hidden">
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
              Real-time pricing, instant comparisons, zero hassle.
            </p>

            {/* Search Input - Glass Style */}
            <div className="max-w-xl mx-auto mb-8 animate-fade-in [animation-delay:300ms]">
              <div className="relative group">
                {/* Glow effect on focus */}
                <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-purple-500/20 rounded-full blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-500" />
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Try: '2 bedroom in Miami under $3,500'"
                    className="w-full h-14 px-6 pr-36 rounded-full bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] text-white placeholder:text-white/30 focus:outline-none focus:border-white/20 focus:bg-white/[0.05] transition-all duration-300"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                    {/* Voice Search Button */}
                    {speechSupported && (
                      <button
                        onClick={isListening ? stopListening : startListening}
                        className={`h-10 w-10 rounded-full flex items-center justify-center transition-all duration-300 ${
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
                      className="h-10 px-5 rounded-full bg-white text-black font-medium text-sm flex items-center gap-2 hover:bg-white/90 hover:shadow-lg hover:shadow-white/20 transition-all duration-300"
                    >
                      Search
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
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
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
            <div className="w-px h-12 bg-gradient-to-b from-white/20 to-transparent" />
          </div>
        </section>

      </main>

      <Footer />
    </div>
  );
}
