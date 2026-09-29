"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { useRecentlyViewed } from "@/hooks/useRecentlyViewed";
import { RecentlyViewed } from "@/components/listings/RecentlyViewed";
import { SimilarListings } from "@/components/listings/SimilarListings";

// Recharts (~450KB) only loads when there's actually a chart to draw —
// BuildingPriceHistory renders nothing below two data points
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

/** Rent trend chart — lives in the main column, where it has room to read. */
export function BuildingPriceHistory({ priceHistory }: { priceHistory: PriceSnapshot[] }) {
  if (priceHistory.length < 2) return null;
  return <PriceHistoryChart data={priceHistory} title="Price History" />;
}

/** Sidebar: records the view, then similar and recently viewed buildings. */
export function BuildingPageClient({ building }: { building: BuildingInfo }) {
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
      <SimilarListings
        buildingId={building.id}
        citySlug={building.citySlug}
        neighborhoodSlug={building.neighborhoodSlug}
        priceRange={building.priceRange}
      />

      <RecentlyViewed currentBuildingId={building.id} />
    </div>
  );
}
