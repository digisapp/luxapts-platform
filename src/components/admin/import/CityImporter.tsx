"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, AlertCircle, Play, ChevronDown, ChevronUp } from "lucide-react";

interface ImportResult {
  cities_created?: number;
  neighborhoods_created?: number;
  buildings_created?: number;
  buildings_updated?: number;
  units_created?: number;
  amenities_linked?: number;
  facts_created?: number;
  skipped?: number;
  errors?: string[];
}

interface CityConfig {
  name: string;
  slug: string;
  endpoint: string;
  buildingCount: number;
  flag: string;
}

const CITIES: CityConfig[] = [
  { name: "Miami",      slug: "miami",     endpoint: "/api/import/miami",    buildingCount: 48, flag: "🌴" },
  { name: "New York",   slug: "nyc",       endpoint: "/api/import/nyc",      buildingCount: 85, flag: "🗽" },
  { name: "Los Angeles",slug: "la",        endpoint: "/api/import/la",       buildingCount: 22, flag: "🌅" },
  { name: "Austin",     slug: "austin",    endpoint: "/api/import/austin",   buildingCount: 19, flag: "🤠" },
  { name: "Dallas",     slug: "dallas",    endpoint: "/api/import/dallas",   buildingCount: 45, flag: "⭐" },
  { name: "Nashville",  slug: "nashville", endpoint: "/api/import/nashville",buildingCount: 18, flag: "🎸" },
  { name: "Atlanta",    slug: "atlanta",   endpoint: "/api/import/atlanta",  buildingCount: 18, flag: "🍑" },
  { name: "Brooklyn",   slug: "brooklyn",  endpoint: "/api/import/brooklyn", buildingCount: 16, flag: "🌉" },
];

type CityStatus = "idle" | "running" | "done" | "error";

interface CityState {
  status: CityStatus;
  result?: ImportResult;
  error?: string;
  expandedErrors?: boolean;
}

export function CityImporter() {
  const [states, setStates] = useState<Record<string, CityState>>({});
  const [importingAll, setImportingAll] = useState(false);

  const setState = (slug: string, update: Partial<CityState>) =>
    setStates((prev) => ({ ...prev, [slug]: { ...prev[slug], ...update } }));

  const runImport = async (city: CityConfig) => {
    setState(city.slug, { status: "running", result: undefined, error: undefined });

    try {
      const res = await fetch(city.endpoint, { method: "POST" });
      const data = await res.json();

      if (!res.ok || data.error) {
        setState(city.slug, { status: "error", error: data.error ?? `HTTP ${res.status}` });
      } else {
        setState(city.slug, { status: "done", result: data.results ?? data });
      }
    } catch (err) {
      setState(city.slug, { status: "error", error: String(err) });
    }
  };

  const runAll = async () => {
    setImportingAll(true);
    // Run sequentially to avoid DB contention
    for (const city of CITIES) {
      const current = states[city.slug];
      if (current?.status === "running") continue;
      await runImport(city);
    }
    setImportingAll(false);
  };

  const totalBuildings = CITIES.reduce((s, c) => s + c.buildingCount, 0);
  const doneCount = CITIES.filter((c) => states[c.slug]?.status === "done").length;
  const errorCount = CITIES.filter((c) => states[c.slug]?.status === "error").length;

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center justify-between gap-4 pb-2">
        <div className="text-sm text-muted-foreground">
          {totalBuildings} buildings across {CITIES.length} cities
          {doneCount > 0 && (
            <span className="ml-2 text-green-600 font-medium">· {doneCount} imported</span>
          )}
          {errorCount > 0 && (
            <span className="ml-2 text-red-500 font-medium">· {errorCount} failed</span>
          )}
        </div>
        <Button
          size="sm"
          onClick={runAll}
          disabled={importingAll}
          className="gap-2 shrink-0"
        >
          {importingAll ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          {importingAll ? "Importing…" : "Import All Cities"}
        </Button>
      </div>

      {/* City rows */}
      <div className="rounded-lg border divide-y">
        {CITIES.map((city) => {
          const state = states[city.slug] ?? { status: "idle" };
          const { status, result, error, expandedErrors } = state;

          return (
            <div key={city.slug} className="p-4">
              <div className="flex items-center gap-3">
                {/* Icon + name */}
                <span className="text-xl w-7 text-center shrink-0">{city.flag}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{city.name}</span>
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                      {city.buildingCount} buildings
                    </Badge>
                    {status === "done" && (
                      <Badge className="text-[10px] h-4 px-1.5 bg-green-600">imported</Badge>
                    )}
                    {status === "error" && (
                      <Badge variant="destructive" className="text-[10px] h-4 px-1.5">failed</Badge>
                    )}
                  </div>

                  {/* Result summary */}
                  {status === "done" && result && (
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {result.buildings_created != null && result.buildings_created > 0 && (
                        <span className="text-green-600">+{result.buildings_created} new</span>
                      )}
                      {result.buildings_updated != null && result.buildings_updated > 0 && (
                        <span>~{result.buildings_updated} updated</span>
                      )}
                      {result.units_created != null && result.units_created > 0 && (
                        <span>{result.units_created} units</span>
                      )}
                      {result.amenities_linked != null && result.amenities_linked > 0 && (
                        <span>{result.amenities_linked} amenities</span>
                      )}
                      {result.neighborhoods_created != null && result.neighborhoods_created > 0 && (
                        <span>{result.neighborhoods_created} neighborhoods</span>
                      )}
                      {result.facts_created != null && result.facts_created > 0 && (
                        <span>{result.facts_created} facts</span>
                      )}
                    </div>
                  )}

                  {/* Errors */}
                  {status === "error" && error && (
                    <p className="mt-1 text-xs text-red-500">{error}</p>
                  )}
                  {status === "done" && result?.errors && result.errors.length > 0 && (
                    <div className="mt-1.5">
                      <button
                        onClick={() => setState(city.slug, { expandedErrors: !expandedErrors })}
                        className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-500"
                      >
                        {expandedErrors ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        {result.errors.length} warning{result.errors.length !== 1 ? "s" : ""}
                      </button>
                      {expandedErrors && (
                        <ul className="mt-1 space-y-0.5 pl-3 list-disc text-xs text-muted-foreground max-h-32 overflow-y-auto">
                          {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                        </ul>
                      )}
                    </div>
                  )}
                </div>

                {/* Action button */}
                <Button
                  size="sm"
                  variant={status === "done" ? "outline" : status === "error" ? "destructive" : "default"}
                  className="h-8 gap-1.5 shrink-0"
                  onClick={() => runImport(city)}
                  disabled={status === "running" || importingAll}
                >
                  {status === "running" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : status === "done" ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                  ) : status === "error" ? (
                    <AlertCircle className="h-3.5 w-3.5" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                  {status === "running" ? "Running…" : status === "done" ? "Re-import" : status === "error" ? "Retry" : "Import"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Each import is idempotent — re-running updates existing buildings rather than creating duplicates.
        Run sequentially if importing all at once to avoid DB conflicts.
      </p>
    </div>
  );
}
