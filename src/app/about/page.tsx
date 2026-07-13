import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Sparkles, MapPin, Users, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "About - Staycio",
  description:
    "Staycio is the intelligent luxury apartment marketplace for major US cities — AI-powered search, real pricing history, and certified in-person tour guides.",
};

const values = [
  {
    icon: Sparkles,
    title: "AI-native search",
    body: "Describe the home you want in plain English. Our AI understands budgets, neighborhoods, amenities, and timing — and only shows real, verified pricing.",
  },
  {
    icon: MapPin,
    title: "Major-city focus",
    body: "We go deep in the cities that matter — New York, Miami, Los Angeles, Austin, Dallas, Atlanta, Nashville, and Brooklyn — with curated luxury inventory.",
  },
  {
    icon: Users,
    title: "Certified tour guides",
    body: "Every Staycio shower is building-certified, background-vetted, and rated by clients — so you tour with someone who actually knows the property.",
  },
  {
    icon: ShieldCheck,
    title: "Pricing transparency",
    body: "We track price history over time and timestamp every quote, so you always know what a unit really costs — and how it's trending.",
  },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <Header />
      <main className="flex-1">
        <div className="mx-auto max-w-4xl px-6 py-16 lg:py-24">
          <h1 className="text-4xl lg:text-5xl font-semibold tracking-tight">
            The intelligent way to find your next home.
          </h1>
          <p className="mt-6 text-lg text-zinc-400 max-w-2xl">
            Staycio is a luxury apartment marketplace built for major US
            cities. We combine AI-powered discovery, honest pricing data, and a
            network of certified local tour guides to make renting a great
            apartment feel effortless.
          </p>

          <div className="mt-16 grid gap-6 sm:grid-cols-2">
            {values.map((v) => (
              <div
                key={v.title}
                className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6"
              >
                <v.icon className="h-6 w-6 text-white" aria-hidden="true" />
                <h2 className="mt-4 text-lg font-medium">{v.title}</h2>
                <p className="mt-2 text-sm text-zinc-400">{v.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-16 rounded-2xl border border-zinc-800 bg-zinc-950 p-8 text-center">
            <h2 className="text-2xl font-semibold">Find your place</h2>
            <p className="mt-2 text-zinc-400">
              Start with a search, or just tell Lexi what you&apos;re looking
              for.
            </p>
            <Link
              href="/search"
              className="mt-6 inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-medium text-black hover:bg-zinc-200 transition-colors"
            >
              Search apartments
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
