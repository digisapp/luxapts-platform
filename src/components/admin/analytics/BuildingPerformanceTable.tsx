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
    { id: "leads", label: "Most Popular", icon: <Building2 className="h-4 w-4" /> },
    { id: "favorites", label: "Most Favorited", icon: <Heart className="h-4 w-4" /> },
    { id: "available", label: "Most Available", icon: <Home className="h-4 w-4" /> },
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

  const getLabel = () => {
    switch (activeTab) {
      case "leads":
        return "Leads";
      case "favorites":
        return "Saves";
      case "available":
        return "Units";
    }
  };

  const data = getData();

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab(tab.id)}
            className="gap-2"
          >
            {tab.icon}
            {tab.label}
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
              className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-muted-foreground w-6">
                  #{index + 1}
                </span>
                <div>
                  <p className="font-medium">{building.name}</p>
                  {building.neighborhood && (
                    <p className="text-sm text-muted-foreground">
                      {building.neighborhood}
                    </p>
                  )}
                </div>
              </div>
              <Badge variant="secondary">
                {getCount(building)} {getLabel()}
              </Badge>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
