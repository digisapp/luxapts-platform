import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Sparkles, MapPin, Users, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "About Staycio — Your space, found.",
  description:
    "Finding a home should feel like a conversation, not a search. Staycio is an AI apartment agent that searches thousands of apartments so you don't have to.",
};

const principles = [
  {
    icon: Sparkles,
    title: "Ask in your own words",
    body: "“Two bedrooms in Miami under $3,500 with a gym and good light” is a complete search. There's no filter grammar to learn, because you shouldn't have to search like a database to find a home.",
  },
  {
    icon: ShieldCheck,
    title: "Prices with a timestamp",
    body: "Rents move constantly. We track price history and stamp every quote, so you know what a place actually costs today — and which direction it's been heading.",
  },
  {
    icon: Users,
    title: "Tours with someone who's been inside",
    body: "Every Staycio tour guide is building-certified, background-vetted, and rated by the renters who came before you. Not someone who just unlocks the door.",
  },
  {
    icon: MapPin,
    title: "Fewer cities, known properly",
    body: "Anyone can scrape a hundred cities. We'd rather know eight of them exceptionally well — the neighborhoods, the buildings, the price history. Every city we launch is one we intend to know deeply.",
  },
];

/** The name, said out loud — three syllables that happen to be the process. */
const beats = [
  { word: "Stay", line: "Stop scrolling." },
  { word: "See", line: "See yourself in it." },
  { word: "Oh", line: "That's the one." },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <Header />
      <main className="flex-1">
        {/* Mission */}
        <section className="relative overflow-hidden px-6 pt-16 pb-16 lg:pt-24">
          <div className="absolute inset-0" aria-hidden="true">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[400px] bg-gradient-to-r from-blue-500/10 via-sky-500/10 to-cyan-500/10 rounded-full blur-[120px]" />
          </div>

          <div className="relative z-10 mx-auto max-w-3xl">
            <h1 className="text-4xl lg:text-5xl font-medium tracking-tight leading-[1.1]">
              Finding a home should feel like{" "}
              <span className="bg-gradient-to-r from-white via-cyan-200 to-blue-400 bg-clip-text text-transparent">
                a conversation.
              </span>
            </h1>
            <p className="mt-8 text-lg text-white/60 leading-relaxed max-w-2xl">
              Not a search. Not forty open tabs. A conversation with someone who
              already knows what you&apos;re looking for.
            </p>
          </div>
        </section>

        {/* Why we exist */}
        <section className="px-6 py-16 border-t border-white/[0.06]">
          <div className="mx-auto max-w-3xl">
            <p className="font-mono text-xs uppercase tracking-wider text-cyan-300">
              Why we exist
            </p>
            <h2 className="mt-4 text-3xl md:text-4xl font-medium">
              Apartment search hasn&apos;t changed since 2008.
            </h2>
            <div className="mt-6 space-y-4 text-lg text-white/60 leading-relaxed max-w-2xl">
              <p>
                You open a site. Click filters. Sort by price. Open a dozen tabs
                to compare, then hope the numbers you&apos;re reading are still
                true. Somewhere along the way, the work of finding a home got
                handed to the person looking for one.
              </p>
              <p className="text-white/80">
                We think that&apos;s backwards. Software should do the
                searching. You should just say what you want.
              </p>
            </div>
          </div>
        </section>

        {/* What makes us different */}
        <section className="px-6 py-16 border-t border-white/[0.06]">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-3xl md:text-4xl font-medium">
              What we hold ourselves to
            </h2>

            <div className="mt-10 grid gap-5 sm:grid-cols-2">
              {principles.map((p) => (
                <div
                  key={p.title}
                  className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 hover:border-white/[0.16] transition-colors duration-300"
                >
                  <p.icon className="h-6 w-6 text-cyan-300" aria-hidden="true" />
                  <h3 className="mt-4 text-lg font-medium">{p.title}</h3>
                  <p className="mt-2 text-sm text-white/60 leading-relaxed">
                    {p.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* The name — a payoff, not the main event */}
        <section className="relative overflow-hidden px-6 py-16 border-t border-white/[0.06]">
          <div className="absolute inset-0" aria-hidden="true">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[280px] bg-cyan-500/[0.06] rounded-full blur-[110px]" />
          </div>

          <div className="relative z-10 mx-auto max-w-3xl">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <h2 className="text-3xl md:text-4xl font-medium">
                Why we&apos;re called Staycio
              </h2>
              <span className="font-mono text-sm text-cyan-300">
                /STAY-see-oh/
              </span>
            </div>

            <div className="mt-6 space-y-4 text-lg text-white/60 leading-relaxed max-w-2xl">
              <p>
                <span className="text-white font-medium">Stay</span>, because
                most homes today aren&apos;t forever. People move for work, for
                school, for someone, for a fresh start. A place doesn&apos;t
                have to last forever to matter.
              </p>
              <p>
                <span className="text-white font-medium">Espacio</span>,
                Spanish for space — but not square footage. Nobody moves to a
                new city for the square footage. They move for the room to
                become someone.
              </p>
              <p className="text-white">Stay + espacio. Staycio.</p>
            </div>

            {/* Say it out loud and it's already the process */}
            <div className="mt-10 flex flex-wrap gap-x-10 gap-y-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-7 py-6">
              {beats.map((beat) => (
                <div key={beat.word}>
                  <span className="text-xl font-medium bg-gradient-to-r from-cyan-200 to-blue-400 bg-clip-text text-transparent">
                    {beat.word}.
                  </span>
                  <span className="ml-2.5 text-sm text-white/50">
                    {beat.line}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Stacy + close */}
        <section className="px-6 py-16 pb-24 border-t border-white/[0.06]">
          <div className="mx-auto max-w-3xl">
            <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.02] p-10 text-center">
              <div className="absolute inset-0" aria-hidden="true">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-gradient-to-r from-cyan-500/10 to-blue-500/10 rounded-full blur-[100px]" />
              </div>

              <div className="relative z-10">
                <p className="text-xl md:text-2xl font-medium leading-snug">
                  Staycio is the space.{" "}
                  <span className="bg-gradient-to-r from-cyan-200 to-blue-400 bg-clip-text text-transparent">
                    Stacy
                  </span>{" "}
                  is who finds it for you.
                </p>
                <p className="mt-4 text-white/60 max-w-lg mx-auto">
                  Tell her the city, the budget, the commute, the dog. She
                  searches thousands of apartments so you don&apos;t have to.
                </p>
                <Link
                  href="/search"
                  className="mt-8 inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-medium text-black hover:bg-white/90 hover:shadow-lg hover:shadow-white/20 transition-all duration-300"
                >
                  Your space, found.
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
