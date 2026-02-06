"use client";

import { useEffect, useState } from "react";
import {
  BarChart3,
  Monitor,
  Smartphone,
  Tablet,
  MousePointer,
  Search,
  TrendingUp,
  Users,
  Eye,
  ArrowUpRight,
} from "lucide-react";
import type { VisitorAnalytics as VisitorAnalyticsType } from "@/types/analytics";

interface Props {
  days?: number;
}

export function VisitorAnalytics({ days = 30 }: Props) {
  const [data, setData] = useState<VisitorAnalyticsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/admin/analytics?days=${days}`);
        if (!res.ok) throw new Error("Failed to fetch analytics");
        const json = await res.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [days]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-32 bg-white/5 rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-white/5 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
        {error || "No data available"}
      </div>
    );
  }

  const { visitors, devices, pages, buildings, conversions, search } = data;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          icon={<Users className="w-5 h-5 text-purple-400" />}
          label="Total Sessions"
          value={visitors.summary.total_sessions.toLocaleString()}
          subtext={`Last ${days} days`}
        />
        <SummaryCard
          icon={<Eye className="w-5 h-5 text-blue-400" />}
          label="Avg Pages/Session"
          value={visitors.summary.avg_pages_per_session.toString()}
          subtext="Page depth"
        />
        <SummaryCard
          icon={<ArrowUpRight className="w-5 h-5 text-amber-400" />}
          label="Bounce Rate"
          value={`${visitors.summary.bounce_rate}%`}
          subtext="Single page visits"
        />
        <SummaryCard
          icon={<Search className="w-5 h-5 text-green-400" />}
          label="Searches"
          value={search.total.toLocaleString()}
          subtext={`Avg ${search.avg_results} results`}
        />
      </div>

      {/* Device Breakdown */}
      <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg p-4">
        <h3 className="text-sm font-medium text-white/70 mb-4 flex items-center gap-2">
          <Monitor className="w-4 h-4" />
          Device Breakdown
        </h3>
        <div className="grid grid-cols-3 gap-4">
          <DeviceBar
            icon={<Monitor className="w-5 h-5" />}
            label="Desktop"
            percentage={devices.percentages.desktop}
            count={devices.counts.desktop}
            color="bg-blue-500"
          />
          <DeviceBar
            icon={<Smartphone className="w-5 h-5" />}
            label="Mobile"
            percentage={devices.percentages.mobile}
            count={devices.counts.mobile}
            color="bg-green-500"
          />
          <DeviceBar
            icon={<Tablet className="w-5 h-5" />}
            label="Tablet"
            percentage={devices.percentages.tablet}
            count={devices.counts.tablet}
            color="bg-purple-500"
          />
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top Pages */}
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg p-4">
          <h3 className="text-sm font-medium text-white/70 mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Top Pages
          </h3>
          <div className="space-y-2">
            {pages.top.slice(0, 8).map((page, i) => (
              <div key={page.path} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-white/40 text-xs w-4">{i + 1}</span>
                  <span className="text-sm text-white/80 truncate max-w-[200px]">
                    {page.path === "/" ? "Homepage" : page.path}
                  </span>
                </div>
                <span className="text-sm text-white/60">{page.count.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Viewed Buildings */}
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg p-4">
          <h3 className="text-sm font-medium text-white/70 mb-4 flex items-center gap-2">
            <Eye className="w-4 h-4" />
            Top Viewed Buildings
          </h3>
          <div className="space-y-2">
            {buildings.top_viewed.slice(0, 8).map((building, i) => (
              <div key={building.building_id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-white/40 text-xs w-4">{i + 1}</span>
                  <div>
                    <span className="text-sm text-white/80 block truncate max-w-[180px]">
                      {building.name}
                    </span>
                    {building.neighborhood && (
                      <span className="text-xs text-white/40">{building.neighborhood}</span>
                    )}
                  </div>
                </div>
                <span className="text-sm text-white/60">{building.count.toLocaleString()}</span>
              </div>
            ))}
            {buildings.top_viewed.length === 0 && (
              <p className="text-white/40 text-sm">No building views yet</p>
            )}
          </div>
        </div>
      </div>

      {/* Conversions */}
      <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg p-4">
        <h3 className="text-sm font-medium text-white/70 mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4" />
          Conversion Events
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <ConversionMetric
            label="Contact Clicks"
            value={conversions.contact_clicked}
            icon={<MousePointer className="w-4 h-4 text-blue-400" />}
          />
          <ConversionMetric
            label="Tours Scheduled"
            value={conversions.tour_scheduled}
            icon={<TrendingUp className="w-4 h-4 text-green-400" />}
          />
          <ConversionMetric
            label="Leads Submitted"
            value={conversions.lead_submitted}
            icon={<Users className="w-4 h-4 text-purple-400" />}
          />
          <ConversionMetric
            label="Favorites Added"
            value={conversions.favorite_added}
            icon={<Eye className="w-4 h-4 text-amber-400" />}
          />
        </div>
      </div>

      {/* Search by City */}
      {Object.keys(search.by_city).length > 0 && (
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg p-4">
          <h3 className="text-sm font-medium text-white/70 mb-4 flex items-center gap-2">
            <Search className="w-4 h-4" />
            Searches by City
          </h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(search.by_city)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 10)
              .map(([city, count]) => (
                <div
                  key={city}
                  className="px-3 py-1.5 bg-white/5 rounded-full text-sm flex items-center gap-2"
                >
                  <span className="text-white/80 capitalize">{city.replace(/-/g, " ")}</span>
                  <span className="text-white/40">{count}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  subtext,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtext: string;
}) {
  return (
    <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-white/50 uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-2xl font-semibold text-white">{value}</div>
      <div className="text-xs text-white/40 mt-1">{subtext}</div>
    </div>
  );
}

function DeviceBar({
  icon,
  label,
  percentage,
  count,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  percentage: number;
  count: number;
  color: string;
}) {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-2 text-white/60 mb-2">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <div className="text-2xl font-semibold text-white">{percentage}%</div>
      <div className="text-xs text-white/40">{count.toLocaleString()} sessions</div>
      <div className="mt-2 h-2 bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

function ConversionMetric({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="text-center p-3 bg-white/5 rounded-lg">
      <div className="flex items-center justify-center mb-2">{icon}</div>
      <div className="text-xl font-semibold text-white">{value.toLocaleString()}</div>
      <div className="text-xs text-white/50">{label}</div>
    </div>
  );
}
