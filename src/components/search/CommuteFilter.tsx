"use client";

import { useState } from "react";
import { Navigation, X, Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface CommuteTarget {
  label: string;
  lng: number;
  lat: number;
  mode: "driving" | "walking" | "cycling";
  maxMinutes: number;
}

interface CommuteFilterProps {
  /** Bias address lookup toward the searched city (first result's coords) */
  proximity?: { lng: number; lat: number } | null;
  value: CommuteTarget | null;
  onChange: (target: CommuteTarget | null) => void;
}

const MODE_LABELS: Record<CommuteTarget["mode"], string> = {
  driving: "Drive",
  walking: "Walk",
  cycling: "Bike",
};

export function CommuteFilter({ proximity, value, onChange }: CommuteFilterProps) {
  const [address, setAddress] = useState("");
  const [mode, setMode] = useState<CommuteTarget["mode"]>("driving");
  const [maxMinutes, setMaxMinutes] = useState(30);
  const [geocoding, setGeocoding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyDestination = async () => {
    const query = address.trim();
    if (!query || geocoding) return;
    setGeocoding(true);
    setError(null);

    try {
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
      if (!token) throw new Error("Maps not configured");

      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
          `?access_token=${token}&country=us&limit=1&types=address,poi,place,postcode,neighborhood` +
          (proximity ? `&proximity=${proximity.lng},${proximity.lat}` : "")
      );
      if (!res.ok) throw new Error("Address lookup failed");

      const data = await res.json();
      const feature = data.features?.[0];
      if (!feature?.center) {
        setError("Couldn't find that address");
        return;
      }

      onChange({
        label: feature.place_name?.split(",").slice(0, 2).join(",") || query,
        lng: feature.center[0],
        lat: feature.center[1],
        mode,
        maxMinutes,
      });
    } catch {
      setError("Address lookup failed");
    } finally {
      setGeocoding(false);
    }
  };

  if (value) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card py-0 pl-3 pr-0 text-sm md:px-3 md:py-2 dark:bg-white/[0.03]">
        <Navigation className="h-4 w-4 text-link dark:text-cyan-400" aria-hidden="true" />
        <span className="text-foreground/80">
          {MODE_LABELS[value.mode]} ≤ {value.maxMinutes} min to{" "}
          <span className="text-foreground">{value.label}</span>
        </span>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="ml-auto flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-foreground/[0.08] transition-colors md:h-auto md:w-auto md:p-1"
          aria-label="Clear commute filter"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Navigation className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyDestination();
              }
            }}
            placeholder="Commute to: work, school, an address…"
            aria-label="Commute destination: work, school or an address"
            enterKeyHint="go"
            autoComplete="street-address"
            className="h-11 md:h-9 w-full rounded-md border border-border bg-card pl-9 pr-3 text-base md:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring dark:bg-white/[0.03]"
          />
        </div>
        <div className="flex gap-2">
          <Select value={mode} onValueChange={(v) => setMode(v as CommuteTarget["mode"])}>
            <SelectTrigger aria-label="Travel mode" className="h-11 md:h-9 w-[92px] text-sm bg-card border-border dark:bg-white/[0.03] dark:border-white/[0.08]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover backdrop-blur-xl border-border dark:bg-black/90 dark:border-white/[0.1]">
              <SelectItem value="driving">Drive</SelectItem>
              <SelectItem value="walking">Walk</SelectItem>
              <SelectItem value="cycling">Bike</SelectItem>
            </SelectContent>
          </Select>
          <Select value={String(maxMinutes)} onValueChange={(v) => setMaxMinutes(parseInt(v, 10))}>
            <SelectTrigger aria-label="Maximum commute time" className="h-11 md:h-9 w-[116px] text-sm bg-card border-border dark:bg-white/[0.03] dark:border-white/[0.08]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover backdrop-blur-xl border-border dark:bg-black/90 dark:border-white/[0.1]">
              <SelectItem value="15">≤ 15 min</SelectItem>
              <SelectItem value="30">≤ 30 min</SelectItem>
              <SelectItem value="45">≤ 45 min</SelectItem>
              <SelectItem value="60">≤ 60 min</SelectItem>
            </SelectContent>
          </Select>
          {/* Reads as ready (a solid button) once there is a destination to
              apply; until then it is a clearly inert outline, not a
              half-faded button that looks broken. */}
          <button
            type="button"
            onClick={applyDestination}
            disabled={geocoding || !address.trim()}
            aria-label={geocoding ? "Looking up address" : "Apply commute filter"}
            title={!address.trim() ? "Enter a destination first" : undefined}
            className="flex h-11 min-w-11 flex-1 items-center justify-center rounded-md border border-primary bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:border-dashed disabled:border-foreground/15 disabled:bg-transparent disabled:font-normal disabled:text-foreground/40 sm:flex-none md:h-9 md:min-w-0"
          >
            {geocoding ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : "Apply"}
          </button>
        </div>
      </div>
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
