"use client";

import dynamic from "next/dynamic";

interface PricePoint {
  date: string;
  price: number;
}

// recharts is ~380KB of JS; a static import made it part of hydrating every
// unit page, even though the chart sits below the fold and only renders with
// two or more price points. Load it on demand, like the building page does.
const UnitPriceHistoryChart = dynamic(
  () => import("./UnitPriceHistoryChart").then((m) => m.UnitPriceHistoryChart),
  {
    ssr: false,
    loading: () => <div className="h-[240px] animate-pulse rounded-xl bg-white/[0.03]" />,
  }
);

export function UnitPriceHistory({ data }: { data: PricePoint[] }) {
  if (data.length < 2) return null;
  return <UnitPriceHistoryChart data={data} />;
}
