import Link from "next/link";
import { Building2, Search, ArrowRight, MapPin, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

const FEATURED_CITIES = [
  { name: "New York City", slug: "nyc", units: "12,000+", image: "🗽" },
  { name: "Miami", slug: "miami", units: "8,500+", image: "🌴" },
  { name: "Los Angeles", slug: "la", units: "10,000+", image: "🌇" },
  { name: "Austin", slug: "austin", units: "5,200+", image: "🤠" },
  { name: "Chicago", slug: "chicago", units: "7,800+", image: "🏙️" },
  { name: "San Francisco", slug: "sf", units: "4,500+", image: "🌉" },
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden bg-gradient-to-b from-background to-muted/30 py-20 md:py-32">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-3xl text-center">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-background/80 px-4 py-2 text-sm backdrop-blur">
                <Sparkles className="h-4 w-4 text-yellow-500" />
                <span>AI-Powered Apartment Search</span>
              </div>

              <h1 className="mb-6 text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
                Find Your Perfect
                <span className="text-primary"> Apartment</span>
              </h1>

              <p className="mb-10 text-lg text-muted-foreground md:text-xl">
                The intelligent rental search platform. Discover apartments across major US cities with AI-powered recommendations, real-time pricing, and instant comparisons.
              </p>

              {/* Search Box */}
              <div className="mx-auto max-w-xl">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Try: '2 bed under $4k in Brickell with gym'"
                      className="h-12 w-full rounded-lg border bg-background pl-10 pr-4 text-base focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <Button size="lg" className="h-12 px-8" asChild>
                    <Link href="/search">
                      Search
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </div>

                <div className="mt-4 flex flex-wrap justify-center gap-2 text-sm text-muted-foreground">
                  <span>Popular:</span>
                  <Link href="/search?city=nyc&beds=1" className="text-foreground hover:underline">
                    NYC 1BR
                  </Link>
                  <span>•</span>
                  <Link href="/search?city=miami&neighborhood=brickell" className="text-foreground hover:underline">
                    Miami Brickell
                  </Link>
                  <span>•</span>
                  <Link href="/search?city=la&budget_max=3000" className="text-foreground hover:underline">
                    LA under $3k
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Background decoration */}
          <div className="absolute inset-0 -z-10 overflow-hidden">
            <div className="absolute -top-1/2 left-1/2 h-[800px] w-[800px] -translate-x-1/2 rounded-full bg-primary/5 blur-3xl" />
          </div>
        </section>

        {/* Featured Cities */}
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="mb-12 text-center">
              <h2 className="mb-3 text-3xl font-bold">Explore Cities</h2>
              <p className="text-muted-foreground">
                Browse thousands of apartments in major markets
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURED_CITIES.map((city) => (
                <Link key={city.slug} href={`/${city.slug}`}>
                  <Card className="group h-full cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1">
                    <CardContent className="flex items-center gap-4 p-6">
                      <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-muted text-3xl">
                        {city.image}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold group-hover:text-primary transition-colors">
                          {city.name}
                        </h3>
                        <p className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Building2 className="h-3 w-3" />
                          {city.units} units
                        </p>
                      </div>
                      <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="bg-muted/30 py-20">
          <div className="container mx-auto px-4">
            <div className="mb-12 text-center">
              <h2 className="mb-3 text-3xl font-bold">Why LuxApts?</h2>
              <p className="text-muted-foreground">
                The smarter way to find your next apartment
              </p>
            </div>

            <div className="grid gap-8 md:grid-cols-3">
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <Sparkles className="h-8 w-8 text-primary" />
                </div>
                <h3 className="mb-2 text-lg font-semibold">AI-Powered Search</h3>
                <p className="text-sm text-muted-foreground">
                  Natural language search that understands what you&apos;re looking for. Just describe your ideal apartment.
                </p>
              </div>

              <div className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <Building2 className="h-8 w-8 text-primary" />
                </div>
                <h3 className="mb-2 text-lg font-semibold">Real-Time Pricing</h3>
                <p className="text-sm text-muted-foreground">
                  Always see the latest prices and availability. No outdated listings or surprise fees.
                </p>
              </div>

              <div className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <MapPin className="h-8 w-8 text-primary" />
                </div>
                <h3 className="mb-2 text-lg font-semibold">Compare & Decide</h3>
                <p className="text-sm text-muted-foreground">
                  Side-by-side building comparisons with amenities, pricing, and policies all in one place.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-2xl rounded-2xl bg-primary p-8 text-center text-primary-foreground md:p-12">
              <h2 className="mb-4 text-2xl font-bold md:text-3xl">
                Ready to Find Your Home?
              </h2>
              <p className="mb-8 opacity-90">
                Start your search now and let our AI help you find the perfect apartment.
              </p>
              <Button size="lg" variant="secondary" asChild>
                <Link href="/search">
                  Start Searching
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
