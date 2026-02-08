"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ChevronDown, ChevronRight, Image } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface UnitData {
  id: string;
  unit_number: string | null;
  floor: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  is_available: boolean;
  available_on: string | null;
  unit_images: Array<{
    id: string;
    url: string;
    category: string | null;
    is_primary: boolean;
  }>;
}

interface UnitsSectionProps {
  units: UnitData[];
  buildingId: string;
}

function bedLabel(beds: number | null): string {
  if (beds === null) return "Unknown";
  if (beds === 0) return "Studio";
  if (beds >= 4) return "4+ Bed";
  return `${beds} Bed`;
}

function bedGroup(beds: number | null): string {
  if (beds === null) return "unknown";
  if (beds === 0) return "studio";
  if (beds >= 4) return "4+";
  return String(beds);
}

const groupOrder = ["studio", "1", "2", "3", "4+", "unknown"];

export function UnitsSection({ units, buildingId }: UnitsSectionProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [unitStates, setUnitStates] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    for (const u of units) {
      map[u.id] = u.is_available;
    }
    return map;
  });
  const [updatingUnit, setUpdatingUnit] = useState<string | null>(null);

  // Group units by bed count
  const groups: Record<string, UnitData[]> = {};
  for (const u of units) {
    const g = bedGroup(u.beds);
    if (!groups[g]) groups[g] = [];
    groups[g].push(u);
  }

  const sortedGroupKeys = groupOrder.filter((g) => groups[g]?.length);

  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const handleUnitToggle = async (unitId: string, checked: boolean) => {
    setUpdatingUnit(unitId);
    try {
      const res = await fetch(`/api/admin/buildings/${buildingId}/units`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitId, is_available: checked }),
      });
      if (res.ok) {
        setUnitStates((prev) => ({ ...prev, [unitId]: checked }));
      }
    } catch {
      // Failed
    } finally {
      setUpdatingUnit(null);
    }
  };

  if (units.length === 0) {
    return (
      <Card>
        <CardContent className="p-4 text-center">
          <p className="text-sm text-muted-foreground">No units found for this building.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <h4 className="font-semibold text-sm">
          Units ({units.length})
        </h4>
        {sortedGroupKeys.map((group) => {
          const groupUnits = groups[group];
          const availableCount = groupUnits.filter((u) => unitStates[u.id]).length;
          const isExpanded = expandedGroups.has(group);
          const label = group === "studio" ? "Studio" : group === "4+" ? "4+ Bed" : group === "unknown" ? "Unknown" : `${group} Bed`;

          return (
            <div key={group} className="rounded-lg border">
              <button
                onClick={() => toggleGroup(group)}
                className="flex w-full items-center justify-between p-3 text-sm font-medium hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  {label}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {groupUnits.length} total
                  </Badge>
                  <Badge variant="success" className="text-xs">
                    {availableCount} available
                  </Badge>
                </div>
              </button>

              {isExpanded && (
                <div className="border-t divide-y">
                  {groupUnits.map((unit) => (
                    <div
                      key={unit.id}
                      className="flex items-center justify-between px-4 py-2 text-sm"
                    >
                      <div className="flex items-center gap-4 flex-wrap">
                        <span className="font-medium w-16">
                          {unit.unit_number || "—"}
                        </span>
                        {unit.floor && (
                          <span className="text-muted-foreground">
                            Floor {unit.floor}
                          </span>
                        )}
                        {unit.sqft && (
                          <span className="text-muted-foreground">
                            {unit.sqft} sqft
                          </span>
                        )}
                        {unit.baths !== null && (
                          <span className="text-muted-foreground">
                            {unit.baths} bath
                          </span>
                        )}
                        {unit.available_on && (
                          <Badge variant="outline" className="text-xs">
                            Avail {formatDate(unit.available_on)}
                          </Badge>
                        )}
                        <span
                          className={`flex items-center gap-1 text-xs ${
                            unit.unit_images.length === 0
                              ? "text-red-500"
                              : "text-green-500"
                          }`}
                        >
                          <Image className="h-3 w-3" />
                          {unit.unit_images.length}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {unitStates[unit.id] ? "Available" : "Hidden"}
                        </span>
                        <Switch
                          checked={unitStates[unit.id]}
                          onCheckedChange={(checked) =>
                            handleUnitToggle(unit.id, checked)
                          }
                          disabled={updatingUnit === unit.id}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
