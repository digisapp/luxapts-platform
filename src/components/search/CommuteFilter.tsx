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
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm">
        <Navigation className="h-4 w-4 text-cyan-400" aria-hidden="true" />
        <span className="text-white/80">
          {MODE_LABELS[value.mode]} ≤ {value.maxMinutes} min to{" "}
          <span className="text-white">{value.label}</span>
        </span>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="ml-auto rounded-full p-1 text-white/50 hover:text-white hover:bg-white/[0.08] transition-colors"
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
          <Navigation className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" aria-hidden="true" />
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
            className="h-9 w-full rounded-md border border-white/[0.08] bg-white/[0.03] pl-9 pr-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-white/30"
          />
        </div>
        <div className="flex gap-2">
          <Select value={mode} onValueChange={(v) => setMode(v as CommuteTarget["mode"])}>
            <SelectTrigger className="h-9 w-[92px] text-sm bg-white/[0.03] border-white/[0.08]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-black/90 backdrop-blur-xl border-white/[0.1]">
              <SelectItem value="driving">Drive</SelectItem>
              <SelectItem value="walking">Walk</SelectItem>
              <SelectItem value="cycling">Bike</SelectItem>
            </SelectContent>
          </Select>
          <Select value={String(maxMinutes)} onValueChange={(v) => setMaxMinutes(parseInt(v, 10))}>
            <SelectTrigger className="h-9 w-[104px] text-sm bg-white/[0.03] border-white/[0.08]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-black/90 backdrop-blur-xl border-white/[0.1]">
              <SelectItem value="15">≤ 15 min</SelectItem>
              <SelectItem value="30">≤ 30 min</SelectItem>
              <SelectItem value="45">≤ 45 min</SelectItem>
              <SelectItem value="60">≤ 60 min</SelectItem>
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={applyDestination}
            disabled={geocoding || !address.trim()}
            className="h-9 rounded-md border border-white/[0.08] bg-white/[0.06] px-3 text-sm text-white/80 hover:bg-white/[0.1] disabled:opacity-40 transition-colors"
          >
            {geocoding ? <Loader2 className="h-4 w-4 animate-spin" /> : "Set"}
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
