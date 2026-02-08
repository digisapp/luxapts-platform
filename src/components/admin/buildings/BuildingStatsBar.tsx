"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Building2, Eye, EyeOff, ImageOff, Home, CheckCircle } from "lucide-react";

interface BuildingStatsBarProps {
  totalBuildings: number;
  activeCount: number;
  inactiveCount: number;
  missingImagesCount: number;
  totalUnits: number;
  availableUnits: number;
}

export function BuildingStatsBar({
  totalBuildings,
  activeCount,
  inactiveCount,
  missingImagesCount,
  totalUnits,
  availableUnits,
}: BuildingStatsBarProps) {
  const stats = [
    { label: "Total Buildings", value: totalBuildings, icon: Building2, color: "text-blue-500" },
    { label: "Active", value: activeCount, icon: Eye, color: "text-green-500" },
    { label: "Inactive", value: inactiveCount, icon: EyeOff, color: "text-gray-500" },
    { label: "Missing Images", value: missingImagesCount, icon: ImageOff, color: "text-red-500" },
    { label: "Total Units", value: totalUnits, icon: Home, color: "text-purple-500" },
    { label: "Available Units", value: availableUnits, icon: CheckCircle, color: "text-emerald-500" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
              <span className="text-sm text-muted-foreground">{stat.label}</span>
            </div>
            <p className="mt-1 text-2xl font-bold">{stat.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
