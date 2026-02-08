"use client";

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, Filter } from "lucide-react";
import { BuildingStatsBar } from "./BuildingStatsBar";
import { BuildingRow } from "./BuildingRow";

interface City {
  id: string;
  name: string;
  slug: string;
}

export interface BuildingSummary {
  id: string;
  name: string;
  address_1: string;
  zip: string | null;
  status: string;
  website_url: string | null;
  year_built: number | null;
  stories: number | null;
  city_id: string;
  cities: { id: string; name: string; slug: string }[] | { id: string; name: string; slug: string } | null;
  image_count: number;
  unit_count: number;
  available_unit_count: number;
}

type FilterMode = "all" | "active" | "inactive" | "missing_images";

interface BuildingsManagerProps {
  cities: City[];
  buildings: BuildingSummary[];
}

export function BuildingsManager({ cities, buildings }: BuildingsManagerProps) {
  const [selectedCity, setSelectedCity] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");

  // Compute city counts
  const cityCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const b of buildings) {
      counts[b.city_id] = (counts[b.city_id] || 0) + 1;
    }
    return counts;
  }, [buildings]);

  // Filter buildings
  const filtered = useMemo(() => {
    let result = buildings;

    if (selectedCity !== "all") {
      result = result.filter((b) => b.city_id === selectedCity);
    }

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          b.address_1.toLowerCase().includes(q)
      );
    }

    if (filter === "active") {
      result = result.filter((b) => b.status === "active");
    } else if (filter === "inactive") {
      result = result.filter((b) => b.status === "inactive");
    } else if (filter === "missing_images") {
      result = result.filter((b) => b.image_count === 0);
    }

    return result;
  }, [buildings, selectedCity, search, filter]);

  // Stats
  const statsSource = selectedCity === "all" ? buildings : buildings.filter((b) => b.city_id === selectedCity);
  const activeCount = statsSource.filter((b) => b.status === "active").length;
  const inactiveCount = statsSource.filter((b) => b.status === "inactive").length;
  const missingImagesCount = statsSource.filter((b) => b.image_count === 0).length;
  const totalUnits = statsSource.reduce((sum, b) => sum + b.unit_count, 0);
  const availableUnits = statsSource.reduce((sum, b) => sum + b.available_unit_count, 0);

  const filterOptions: { value: FilterMode; label: string }[] = [
    { value: "all", label: "All" },
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" },
    { value: "missing_images", label: "Missing Images" },
  ];

  return (
    <div className="space-y-6">
      <BuildingStatsBar
        totalBuildings={statsSource.length}
        activeCount={activeCount}
        inactiveCount={inactiveCount}
        missingImagesCount={missingImagesCount}
        totalUnits={totalUnits}
        availableUnits={availableUnits}
      />

      {/* City Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setSelectedCity("all")}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            selectedCity === "all"
              ? "bg-primary text-primary-foreground"
              : "bg-muted hover:bg-accent"
          }`}
        >
          All Cities
          <Badge variant="secondary" className="ml-1 text-xs">
            {buildings.length}
          </Badge>
        </button>
        {cities.map((city) => (
          <button
            key={city.id}
            onClick={() => setSelectedCity(city.id)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              selectedCity === city.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted hover:bg-accent"
            }`}
          >
            {city.name}
            <Badge variant="secondary" className="ml-1 text-xs">
              {cityCounts[city.id] || 0}
            </Badge>
          </button>
        ))}
      </div>

      {/* Search + Filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search buildings..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Filter className="h-4 w-4 text-muted-foreground" />
          {filterOptions.map((opt) => (
            <Button
              key={opt.value}
              variant={filter === opt.value ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Building List */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="rounded-lg border p-12 text-center">
            <p className="text-muted-foreground">No buildings match your filters.</p>
          </div>
        ) : (
          filtered.map((building) => (
            <BuildingRow key={building.id} building={building} />
          ))
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        Showing {filtered.length} of {buildings.length} buildings
      </p>
    </div>
  );
}
