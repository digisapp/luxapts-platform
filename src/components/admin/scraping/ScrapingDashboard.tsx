"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RefreshCw,
  ExternalLink,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface City {
  name: string;
  slug: string;
}

interface ScrapeBuilding {
  id: string;
  name: string;
  website_url: string | null;
  city: string | null;
  city_slug: string | null;
  neighborhood: string | null;
  scrape_enabled: boolean;
  scrape_state: string;
  amenities: { scraped_at: string | null; success: boolean | null; error: string | null };
  units: { scraped_at: string | null; success: boolean | null; error: string | null; count: number };
  images: { scraped_at: string | null; success: boolean | null; error: string | null; count: number };
}

interface ScrapeJob {
  id: string;
  type: string;
  status: string;
  buildings_processed: number | null;
  errors: unknown;
  created_at: string;
  completed_at: string | null;
}

interface ScrapeData {
  summary: {
    total: number;
    never_scraped: number;
    success: number;
    stale: number;
    failed: number;
    total_units: number;
  };
  buildings: ScrapeBuilding[];
  recent_jobs: ScrapeJob[];
}

interface ScrapingDashboardProps {
  cities: City[];
}

const stateConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  never_scraped: { label: "Never Scraped", color: "text-muted-foreground", icon: Clock },
  success: { label: "Fresh", color: "text-green-400", icon: CheckCircle },
  stale: { label: "Stale", color: "text-amber-400", icon: AlertTriangle },
  failed: { label: "Failed", color: "text-red-400", icon: XCircle },
};

function formatRelative(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function ScrapingDashboard({ cities }: ScrapingDashboardProps) {
  const [data, setData] = useState<ScrapeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [cityFilter, setCityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [triggeringIds, setTriggeringIds] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (cityFilter !== "all") params.set("city", cityFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      params.set("limit", "200");

      const res = await fetch(`/api/admin/scrape?${params}`);
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [cityFilter, statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function toggleScraping(buildingId: string, enable: boolean) {
    setTogglingIds((prev) => new Set(prev).add(buildingId));
    try {
      await fetch("/api/admin/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: enable ? "enable" : "disable",
          building_ids: [buildingId],
        }),
      });
      // Update local state
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          buildings: prev.buildings.map((b) =>
            b.id === buildingId ? { ...b, scrape_enabled: enable } : b
          ),
        };
      });
    } catch {
      // silently fail
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(buildingId);
        return next;
      });
    }
  }

  async function triggerScrape(buildingId: string) {
    setTriggeringIds((prev) => new Set(prev).add(buildingId));
    try {
      const res = await fetch("/api/admin/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "trigger",
          building_ids: [buildingId],
          type: "units",
        }),
      });
      if (res.ok) {
        const result = await res.json();
        // Follow up with the actual scrape endpoint
        if (result.endpoint) {
          await fetch(result.endpoint, {
            method: result.method || "POST",
            headers: { "Content-Type": "application/json" },
            body: result.body ? JSON.stringify(result.body) : undefined,
          });
        }
      }
    } catch {
      // silently fail
    } finally {
      setTriggeringIds((prev) => {
        const next = new Set(prev);
        next.delete(buildingId);
        return next;
      });
      // Refresh after a short delay to see updated status
      setTimeout(fetchData, 2000);
    }
  }

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const summary = data?.summary || {
    total: 0,
    never_scraped: 0,
    success: 0,
    stale: 0,
    failed: 0,
    total_units: 0,
  };

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{summary.total}</p>
            <p className="text-xs text-muted-foreground">Total Buildings</p>
          </CardContent>
        </Card>
        <Card className={cn(summary.never_scraped > 0 && "border-amber-500/50")}>
          <CardContent className="p-4 text-center">
            <p className={cn("text-2xl font-bold", summary.never_scraped > 0 && "text-amber-400")}>
              {summary.never_scraped}
            </p>
            <p className="text-xs text-muted-foreground">Never Scraped</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-400">{summary.success}</p>
            <p className="text-xs text-muted-foreground">Fresh (&lt;7d)</p>
          </CardContent>
        </Card>
        <Card className={cn(summary.stale > 0 && "border-amber-500/50")}>
          <CardContent className="p-4 text-center">
            <p className={cn("text-2xl font-bold", summary.stale > 0 && "text-amber-400")}>
              {summary.stale}
            </p>
            <p className="text-xs text-muted-foreground">Stale (&gt;7d)</p>
          </CardContent>
        </Card>
        <Card className={cn(summary.failed > 0 && "border-red-500/50")}>
          <CardContent className="p-4 text-center">
            <p className={cn("text-2xl font-bold", summary.failed > 0 && "text-red-400")}>
              {summary.failed}
            </p>
            <p className="text-xs text-muted-foreground">Failed</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={cityFilter} onValueChange={setCityFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Cities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Cities</SelectItem>
            {cities.map((c) => (
              <SelectItem key={c.slug} value={c.slug}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex gap-1">
          {["all", "pending", "success", "failed"].map((s) => (
            <Button
              key={s}
              variant={statusFilter === s ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(s)}
            >
              {s === "all" ? "All" : s === "pending" ? "Pending" : s.charAt(0).toUpperCase() + s.slice(1)}
            </Button>
          ))}
        </div>

        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Buildings Table */}
      <Card>
        <CardHeader>
          <CardTitle>Buildings ({data?.buildings.length || 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {!data?.buildings.length ? (
            <p className="text-muted-foreground py-4">No buildings match the current filter.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4">Building</th>
                    <th className="pb-2 pr-4">City</th>
                    <th className="pb-2 pr-4">State</th>
                    <th className="pb-2 pr-4 text-right">Units</th>
                    <th className="pb-2 pr-4 text-right">Images</th>
                    <th className="pb-2 pr-4">Last Scraped</th>
                    <th className="pb-2 pr-4">Enabled</th>
                    <th className="pb-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.buildings.map((b) => {
                    const stateInfo = stateConfig[b.scrape_state] || stateConfig.never_scraped;
                    const StateIcon = stateInfo.icon;
                    return (
                      <tr key={b.id} className="border-b last:border-0">
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{b.name}</span>
                            {b.website_url && (
                              <a
                                href={b.website_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-foreground"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">{b.city || "—"}</td>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-1.5">
                            <StateIcon className={cn("h-3.5 w-3.5", stateInfo.color)} />
                            <Badge
                              variant={
                                b.scrape_state === "success"
                                  ? "success"
                                  : b.scrape_state === "failed"
                                  ? "destructive"
                                  : "secondary"
                              }
                            >
                              {stateInfo.label}
                            </Badge>
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-right">{b.units.count}</td>
                        <td className="py-3 pr-4 text-right">{b.images.count}</td>
                        <td className="py-3 pr-4 text-muted-foreground">
                          {formatRelative(b.units.scraped_at)}
                        </td>
                        <td className="py-3 pr-4">
                          <Switch
                            checked={b.scrape_enabled}
                            disabled={togglingIds.has(b.id)}
                            onCheckedChange={(checked) => toggleScraping(b.id, checked)}
                          />
                        </td>
                        <td className="py-3">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={triggeringIds.has(b.id) || !b.scrape_enabled}
                            onClick={() => triggerScrape(b.id)}
                          >
                            {triggeringIds.has(b.id) ? (
                              <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
                            ) : (
                              <RefreshCw className="mr-1 h-3 w-3" />
                            )}
                            Scrape
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Jobs */}
      {data?.recent_jobs && data.recent_jobs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Scrape Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.recent_jobs.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    <Badge
                      variant={
                        job.status === "completed"
                          ? "success"
                          : job.status === "failed"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {job.status}
                    </Badge>
                    <span className="text-sm">
                      {job.type} — {job.buildings_processed || 0} buildings
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatRelative(job.created_at)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
