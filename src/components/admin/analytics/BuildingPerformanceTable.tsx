"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, Heart, Home } from "lucide-react";
import type { BuildingPerformance } from "@/types/analytics";

interface BuildingPerformanceTableProps {
  topBuildings: BuildingPerformance[];
  mostFavorited: BuildingPerformance[];
  buildingsWithAvailability: BuildingPerformance[];
}

type TabType = "leads" | "favorites" | "available";

export function BuildingPerformanceTable({
  topBuildings,
  mostFavorited,
  buildingsWithAvailability,
}: BuildingPerformanceTableProps) {
  const [activeTab, setActiveTab] = useState<TabType>("leads");

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: "leads", label: "Popular", icon: <Building2 className="h-4 w-4" /> },
    { id: "favorites", label: "Favorited", icon: <Heart className="h-4 w-4" /> },
    { id: "available", label: "Available", icon: <Home className="h-4 w-4" /> },
  ];

  const getData = () => {
    switch (activeTab) {
      case "leads":
        return topBuildings;
      case "favorites":
        return mostFavorited;
      case "available":
        return buildingsWithAvailability;
    }
  };

  const getCount = (building: BuildingPerformance) => {
    switch (activeTab) {
      case "leads":
        return building.leadCount;
      case "favorites":
        return building.favoritesCount;
      case "available":
        return building.availableUnits;
    }
  };

  const getLabel = (count: number) => {
    const one = count === 1;
    switch (activeTab) {
      case "leads":
        return one ? "lead" : "leads";
      case "favorites":
        return one ? "save" : "saves";
      case "available":
        return one ? "unit" : "units";
    }
  };

  const data = getData();

  return (
    <div className="space-y-4">
      {/* Three equal columns: as a flex row the "Most …" buttons were wider
          than an iPhone and pushed the whole dashboard into sideways scroll. */}
      <div className="grid grid-cols-3 gap-2 sm:flex" role="group" aria-label="Rank buildings by">
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? "default" : "outline"}
            size="sm"
            aria-pressed={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="h-10 min-w-0 gap-1.5 px-2 sm:px-3"
          >
            <span className="hidden min-[400px]:inline-flex" aria-hidden="true">{tab.icon}</span>
            <span className="truncate">
              <span className="hidden sm:inline">Most </span>
              {tab.label}
            </span>
          </Button>
        ))}
      </div>

      {data.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground">
          No data available
        </div>
      ) : (
        <div className="space-y-2">
          {data.slice(0, 5).map((building, index) => (
            <Link
              key={building.id}
              href={`/buildings/${building.id}`}
              className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="text-sm font-medium text-muted-foreground w-6">
                  #{index + 1}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium">{building.name}</p>
                  {building.neighborhood && (
                    <p className="text-sm text-muted-foreground">
                      {building.neighborhood}
                    </p>
                  )}
                </div>
              </div>
              <Badge variant="secondary" className="shrink-0 whitespace-nowrap">
                {getCount(building)} {getLabel(getCount(building))}
              </Badge>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
