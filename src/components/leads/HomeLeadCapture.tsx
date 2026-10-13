"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { useAnalytics } from "@/hooks/useAnalytics";

export interface LeadCaptureCity {
  name: string;
  slug: string;
}

interface HomeLeadCaptureProps {
  cities: LeadCaptureCity[];
  /** Whatever the visitor typed into the hero, as the starting note. */
  defaultNotes?: string;
}

/**
 * Low-friction homepage capture: email, city, and a free-text note.
 *
 * Deliberately not `LeadCaptureForm` — that one asks for seven fields to book
 * a specific tour, which is the right trade on a building page where intent is
 * already high. Cold homepage traffic will not fill it in, so this asks for
 * the two fields `/api/leads` actually requires and lets everything else ride
 * in the note.
 */
export function HomeLeadCapture({ cities, defaultNotes = "" }: HomeLeadCaptureProps) {
  const { track } = useAnalytics();
  const [email, setEmail] = useState("");
  // Deliberately empty: cities arrive alphabetically, so defaulting to
  // cities[0] would quietly file every unedited submission under Atlanta.
  const [citySlug, setCitySlug] = useState("");
  // null until the visitor types, so the hero query keeps flowing through.
  const [notesDraft, setNotesDraft] = useState<string | null>(null);
  const notes = notesDraft ?? defaultNotes;
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "web_form",
          city_slug: citySlug,
          email: email.trim(),
          notes: notes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Something went wrong. Please try again.");
      }

      setDone(true);
      track.leadSubmitted("home_cta", citySlug);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="rounded-3xl bg-card border border-border shadow-[0_1px_2px_rgba(20,33,43,0.04)] dark:bg-white/[0.03] dark:backdrop-blur-xl dark:border-white/[0.08] dark:shadow-none p-8 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-positive" />
        <h3 className="mt-4 text-xl font-medium text-foreground">Stacy&apos;s on it.</h3>
        <p className="mt-2 text-muted-foreground dark:text-white/60">
          We&apos;ll email you matches as they come up. Nothing else — no drip campaign.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-3xl bg-card border border-border shadow-[0_1px_2px_rgba(20,33,43,0.04)] dark:bg-white/[0.03] dark:backdrop-blur-xl dark:border-white/[0.08] dark:shadow-none p-6 sm:p-8 text-left"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="home-lead-email" className="mb-2 block text-sm text-foreground/80 dark:text-white/70">
            Email
          </label>
          <input
            id="home-lead-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className="w-full h-12 px-4 rounded-xl bg-card border border-foreground/15 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-link focus:ring-2 focus:ring-ring dark:bg-white/[0.04] dark:border-white/[0.08] dark:focus:border-white/25 dark:focus:bg-white/[0.06] dark:focus:ring-0 transition-colors"
          />
        </div>
        <div>
          <label htmlFor="home-lead-city" className="mb-2 block text-sm text-foreground/80 dark:text-white/70">
            City
          </label>
          <select
            id="home-lead-city"
            required
            value={citySlug}
            onChange={(e) => setCitySlug(e.target.value)}
            className="w-full h-12 px-4 rounded-xl bg-card border border-foreground/15 text-foreground focus:outline-none focus:border-link focus:ring-2 focus:ring-ring dark:bg-white/[0.04] dark:border-white/[0.08] dark:focus:border-white/25 dark:focus:bg-white/[0.06] dark:focus:ring-0 transition-colors"
          >
            <option value="" disabled className="bg-popover text-popover-foreground dark:bg-neutral-900 dark:text-white">
              Select a city
            </option>
            {cities.map((city) => (
              // Options render in the OS menu, which ignores the dark page —
              // set their colors explicitly or they are white-on-white.
              <option key={city.slug} value={city.slug} className="bg-popover text-popover-foreground dark:bg-neutral-900 dark:text-white">
                {city.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4">
        <label htmlFor="home-lead-notes" className="mb-2 block text-sm text-foreground/80 dark:text-white/70">
          What are you looking for?
        </label>
        <textarea
          id="home-lead-notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotesDraft(e.target.value)}
          placeholder="2 bed under $3,500, dog-friendly, walkable to the train, moving in June"
          className="w-full px-4 py-3 rounded-xl bg-card border border-foreground/15 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-link focus:ring-2 focus:ring-ring dark:bg-white/[0.04] dark:border-white/[0.08] dark:focus:border-white/25 dark:focus:bg-white/[0.06] dark:focus:ring-0 transition-colors resize-none"
        />
      </div>

      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="mt-5 w-full h-12 rounded-xl bg-primary text-primary-foreground font-medium flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Sending…
          </>
        ) : (
          <>
            Keep looking for me
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>

      <p className="mt-3 text-center text-xs text-muted-foreground dark:text-white/55">
        One email when something fits. Unsubscribe any time.
      </p>
    </form>
  );
}
