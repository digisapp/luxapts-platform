"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { useRecentlyViewed } from "@/hooks/useRecentlyViewed";
import { RecentlyViewed } from "@/components/listings/RecentlyViewed";
import { SimilarListings } from "@/components/listings/SimilarListings";

// Recharts (~450KB) only loads when there's actually a chart to draw —
// the component below renders solely inside the priceHistory.length >= 2 branch
const PriceHistoryChart = dynamic(
  () => import("@/components/charts/PriceHistoryChart").then((m) => m.PriceHistoryChart),
  {
    ssr: false,
    loading: () => <div className="h-[300px] animate-pulse rounded-xl border bg-card" />,
  }
);

interface BuildingInfo {
  id: string;
  name: string;
  address: string;
  neighborhood?: string;
  citySlug: string;
  neighborhoodSlug?: string;
  image?: string;
  minPrice?: number;
  priceRange?: { min: number; max: number };
}

interface PriceSnapshot {
  date: string;
  price: number;
}

interface BuildingPageClientProps {
  building: BuildingInfo;
  priceHistory: PriceSnapshot[];
}

export function BuildingPageClient({ building, priceHistory }: BuildingPageClientProps) {
  const { addItem } = useRecentlyViewed();

  // Track this building view
  useEffect(() => {
    addItem({
      id: building.id,
      type: "building",
      name: building.name,
      address: building.address,
      neighborhood: building.neighborhood,
      image: building.image,
      price: building.minPrice,
    });
  }, [building, addItem]);

  return (
    <div className="space-y-6">
      {/* Price History Chart */}
      {priceHistory.length >= 2 && (
        <PriceHistoryChart
          data={priceHistory}
          title="Price History"
        />
      )}

      {/* Similar Buildings */}
      <SimilarListings
        buildingId={building.id}
        citySlug={building.citySlug}
        neighborhoodSlug={building.neighborhoodSlug}
        priceRange={building.priceRange}
      />

      {/* Recently Viewed */}
      <RecentlyViewed currentBuildingId={building.id} />
    </div>
  );
}
