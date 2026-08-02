import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Sparkles, MapPin, Users, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "About Staycio — /STAY-see-oh/",
  description:
    "Staycio is stay + espacio, English and Spanish joined: a space to stay while you figure out the rest. AI-powered apartment discovery across major US cities.",
};

/** The three beats of the name, said out loud — also the shape of the search. */
const beats = [
  { word: "Stay", line: "Stop scrolling. Forty open tabs was never a search." },
  { word: "See", line: "See the place — and see yourself in it." },
  { word: "Oh", line: "Oh. That one." },
];

const values = [
  {
    icon: Sparkles,
    title: "AI-native search",
    body: "Describe the place you want the way you'd say it out loud. Stacy understands budget, neighborhood, amenities, and timing — and only shows real, verified pricing.",
  },
  {
    icon: MapPin,
    title: "Deep in a few cities",
    body: "New York, Miami, Los Angeles, Austin, Dallas, Atlanta, Nashville, Brooklyn. We'd rather know eight cities properly than list fifty badly.",
  },
  {
    icon: Users,
    title: "Someone who's actually been inside",
    body: "Every Staycio tour guide is building-certified, background-vetted, and rated by the people they've shown around. You tour with someone who knows the property.",
  },
  {
    icon: ShieldCheck,
    title: "Prices with a timestamp",
    body: "We track price history over time and stamp every quote, so you know what a unit really costs — and which way it's been moving.",
  },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <Header />
      <main className="flex-1">
        {/* The name */}
        <section className="relative overflow-hidden px-6 pt-16 pb-20 lg:pt-24">
          <div className="absolute inset-0" aria-hidden="true">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[400px] bg-gradient-to-r from-blue-500/10 via-sky-500/10 to-cyan-500/10 rounded-full blur-[120px]" />
          </div>

          <div className="relative z-10 mx-auto max-w-3xl">
            {/* Dictionary entry — owns the pronunciation instead of apologizing for it */}
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 pb-6 border-b border-white/[0.08]">
              <span className="text-2xl font-medium text-white">Staycio</span>
              <span className="font-mono text-sm text-cyan-300">/STAY-see-oh/</span>
              <span className="text-sm italic text-white/40">noun</span>
            </div>

            <h1 className="mt-10 text-4xl lg:text-5xl font-medium tracking-tight leading-[1.1]">
              A space to stay while you
              <br />
              <span className="bg-gradient-to-r from-white via-cyan-200 to-blue-400 bg-clip-text text-transparent">
                figure out the rest.
              </span>
            </h1>

            <p className="mt-8 text-lg text-white/60 leading-relaxed">
              The name is two words from two languages. It took us a while to
              admit that it&apos;s also the entire idea.
            </p>

            {/* Stay + espacio */}
            <div className="mt-12 grid gap-5 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
                <p className="font-mono text-xs uppercase tracking-wider text-cyan-300">
                  English
                </p>
                <p className="mt-3 text-2xl font-medium">stay</p>
                <p className="mt-3 text-sm text-white/60 leading-relaxed">
                  Not <em>settle down</em>. Not <em>forever home</em>. Stay. A
                  year in this city, maybe two, then somewhere else. That
                  isn&apos;t a smaller version of a life — it&apos;s how this
                  decade is supposed to work, and it deserves a word that
                  doesn&apos;t pretend otherwise.
                </p>
              </div>

              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
                <p className="font-mono text-xs uppercase tracking-wider text-cyan-300">
                  Spanish
                </p>
                <p className="mt-3 text-2xl font-medium">espacio</p>
                <p className="mt-3 text-sm text-white/60 leading-relaxed">
                  Space — but not only square footage.{" "}
                  <em>Hacer espacio</em> means to make room: for a person, for a
                  chapter, for whoever you&apos;re about to become. Nobody moves
                  to a new city for the square footage.
                </p>
              </div>
            </div>

            <p className="mt-8 text-lg text-white/70 leading-relaxed">
              Put them together and you get the whole thing.{" "}
              <span className="text-white">
                Stay + espacio. Staycio. Your space, found.
              </span>
            </p>
          </div>
        </section>

        {/* Stay. See. Oh. */}
        <section className="relative overflow-hidden px-6 py-20 border-t border-white/[0.06]">
          <div className="absolute inset-0" aria-hidden="true">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[300px] bg-cyan-500/[0.07] rounded-full blur-[110px]" />
          </div>

          <div className="relative z-10 mx-auto max-w-3xl">
            <p className="font-mono text-xs uppercase tracking-wider text-white/40">
              Say it out loud
            </p>
            <h2 className="mt-4 text-3xl md:text-4xl font-medium">
              It tells you what to do.
            </h2>
            <p className="mt-4 text-white/60">
              Three syllables, three beats. It&apos;s how the name is
              pronounced, and it happens to be exactly how finding a place
              goes.
            </p>

            <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.06] sm:grid-cols-3">
              {beats.map((beat) => (
                <div key={beat.word} className="bg-black/60 p-8">
                  <p className="text-3xl font-medium bg-gradient-to-r from-cyan-200 to-blue-400 bg-clip-text text-transparent">
                    {beat.word}.
                  </p>
                  <p className="mt-3 text-sm text-white/60 leading-relaxed">
                    {beat.line}
                  </p>
                </div>
              ))}
            </div>

            <p className="mt-8 text-sm text-white/40">
              Stay. See. Oh. — now you know how to say it, and you already know
              what we do.
            </p>
          </div>
        </section>

        {/* What that means in practice */}
        <section className="px-6 py-20 border-t border-white/[0.06]">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-3xl md:text-4xl font-medium">
              What that means in practice
            </h2>
            <p className="mt-4 text-white/60 max-w-2xl">
              A name is only worth something if the product agrees with it.
              Here&apos;s what we hold ourselves to.
            </p>

            <div className="mt-12 grid gap-5 sm:grid-cols-2">
              {values.map((v) => (
                <div
                  key={v.title}
                  className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 hover:border-white/[0.16] transition-colors duration-300"
                >
                  <v.icon className="h-6 w-6 text-cyan-300" aria-hidden="true" />
                  <h3 className="mt-4 text-lg font-medium">{v.title}</h3>
                  <p className="mt-2 text-sm text-white/60 leading-relaxed">
                    {v.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Stacy */}
        <section className="px-6 pb-24">
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
                  She&apos;s the name said out loud — the first two beats of it.
                  Tell her the city, the budget, the vibe. She searches while
                  you pack.
                </p>
                <Link
                  href="/search"
                  className="mt-8 inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-medium text-black hover:bg-white/90 hover:shadow-lg hover:shadow-white/20 transition-all duration-300"
                >
                  Find your space
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
