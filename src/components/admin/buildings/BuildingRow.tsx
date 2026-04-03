"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronRight, Image, Home, ExternalLink } from "lucide-react";
import { BuildingDetails } from "./BuildingDetails";
import type { BuildingSummary } from "./BuildingsManager";

interface BuildingRowProps {
  building: BuildingSummary;
  cities?: Array<{ id: string; name: string; slug: string }>;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" | "success" }> = {
  active: { label: "Active", variant: "success" },
  inactive: { label: "Inactive", variant: "secondary" },
  coming_soon: { label: "Coming Soon", variant: "outline" },
};

export function BuildingRow({ building, cities = [] }: BuildingRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState(building.status);
  const [updating, setUpdating] = useState(false);
  const [detail, setDetail] = useState<unknown>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const handleStatusToggle = async (checked: boolean) => {
    const newStatus = checked ? "active" : "inactive";
    setUpdating(true);
    try {
      const res = await fetch(`/api/admin/buildings/${building.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setStatus(newStatus);
      }
    } catch {
      // Revert on error
    } finally {
      setUpdating(false);
    }
  };

  const handleExpand = async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (!detail) {
      setLoadingDetail(true);
      try {
        const res = await fetch(`/api/admin/buildings/${building.id}`);
        if (res.ok) {
          const data = await res.json();
          setDetail(data);
        }
      } catch {
        // Failed to load
      } finally {
        setLoadingDetail(false);
      }
    }
  };

  const imageColor =
    building.image_count === 0
      ? "text-red-500"
      : building.image_count < 3
      ? "text-amber-500"
      : "text-green-500";

  const statusInfo = statusConfig[status] || statusConfig.active;

  return (
    <div className="rounded-lg border transition-colors hover:bg-muted/30">
      {/* Collapsed Row */}
      <div
        className="flex cursor-pointer items-center gap-4 p-4"
        onClick={handleExpand}
      >
        <button className="shrink-0 text-muted-foreground">
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium truncate">{building.name}</p>
            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
          </div>
          <p className="text-sm text-muted-foreground truncate">
            {building.address_1}
            {building.zip ? `, ${building.zip}` : ""}
          </p>
        </div>

        <div className="hidden sm:flex items-center gap-4 text-sm">
          <span className={`flex items-center gap-1 ${imageColor}`}>
            <Image className="h-3.5 w-3.5" />
            {building.image_count}
          </span>
          <span className="flex items-center gap-1 text-muted-foreground">
            <Home className="h-3.5 w-3.5" />
            {building.available_unit_count}/{building.unit_count}
          </span>
          {building.website_url && (
            <a
              href={building.website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>

        <div
          className="flex items-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {status === "active" ? "Active" : "Inactive"}
          </span>
          <Switch
            checked={status === "active"}
            onCheckedChange={handleStatusToggle}
            disabled={updating}
          />
        </div>
      </div>

      {/* Expanded Detail */}
      {expanded && (
        <div className="border-t px-4 py-4 pl-12">
          {loadingDetail ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : detail ? (
            <BuildingDetails
              cities={cities}
              data={detail as {
                building: Record<string, unknown>;
                amenities: Array<{ amenity_id: string; details: string | null; amenities: { id: string; name: string; category: string | null } | null }>;
                images: Array<{ id: string; url: string; alt_text: string | null; category: string | null; is_primary: boolean; sort_order: number }>;
                units: Array<{ id: string; unit_number: string | null; floor: string | null; beds: number | null; baths: number | null; sqft: number | null; is_available: boolean; available_on: string | null; unit_images: Array<{ id: string; url: string; category: string | null; is_primary: boolean }> }>;
              }}
              buildingId={building.id}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Failed to load details.</p>
          )}
        </div>
      )}
    </div>
  );
}
