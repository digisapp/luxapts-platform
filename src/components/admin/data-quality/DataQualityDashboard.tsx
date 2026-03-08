"use client";

import { useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Image,
  Phone,
  FileText,
  MapPin,
  DollarSign,
  Home,
  Globe,
  Shield,
  ChevronDown,
  ChevronUp,
  Save,
  Loader2,
} from "lucide-react";

interface BuildingQuality {
  id: string;
  name: string;
  address_1: string;
  city_name: string;
  city_slug: string;
  city_id: string;
  score: number;
  max_score: number;
  percentage: number;
  issues: string[];
  counts: {
    images: number;
    units: number;
    available_units: number;
    amenities: number;
  };
  has: {
    description: boolean;
    images: boolean;
    units: boolean;
    pricing: boolean;
    contact: boolean;
    amenities: boolean;
    location: boolean;
    policies: boolean;
    website: boolean;
  };
  leasing_phone: string | null;
  leasing_email: string | null;
  website_url: string | null;
  description: string | null;
}

interface Summary {
  total_buildings: number;
  average_score: number;
  no_images: number;
  no_units: number;
  no_pricing: number;
  no_contact: number;
  missing_description: number;
  no_website: number;
  grade_a: number;
  grade_b: number;
  grade_c: number;
  grade_f: number;
}

type IssueFilter =
  | "all"
  | "no_images"
  | "no_contact"
  | "missing_description"
  | "no_units"
  | "no_pricing"
  | "no_website";

interface DataQualityDashboardProps {
  summary: Summary;
  buildings: BuildingQuality[];
  cities: { id: string; name: string }[];
}

function ScoreBar({ percentage }: { percentage: number }) {
  let color = "bg-red-500";
  if (percentage >= 80) color = "bg-green-500";
  else if (percentage >= 60) color = "bg-yellow-500";
  else if (percentage >= 40) color = "bg-orange-500";

  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${color} transition-all`} style={{ width: `${percentage}%` }} />
      </div>
      <span className="text-sm font-medium">{percentage}%</span>
    </div>
  );
}

function GradeBadge({ percentage }: { percentage: number }) {
  if (percentage >= 80) return <Badge className="bg-green-100 text-green-800">A</Badge>;
  if (percentage >= 60) return <Badge className="bg-yellow-100 text-yellow-800">B</Badge>;
  if (percentage >= 40) return <Badge className="bg-orange-100 text-orange-800">C</Badge>;
  return <Badge className="bg-red-100 text-red-800">F</Badge>;
}

function CheckIcon({ value }: { value: boolean }) {
  return value ? (
    <CheckCircle className="h-4 w-4 text-green-500" />
  ) : (
    <XCircle className="h-4 w-4 text-red-400" />
  );
}

export function DataQualityDashboard({
  summary,
  buildings,
  cities,
}: DataQualityDashboardProps) {
  const [search, setSearch] = useState("");
  const [issueFilter, setIssueFilter] = useState<IssueFilter>("all");
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let result = buildings;

    if (cityFilter !== "all") {
      result = result.filter((b) => b.city_id === cityFilter);
    }

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (b) => b.name.toLowerCase().includes(q) || b.address_1.toLowerCase().includes(q)
      );
    }

    if (issueFilter !== "all") {
      result = result.filter((b) => b.issues.includes(issueFilter));
    }

    return result;
  }, [buildings, search, issueFilter, cityFilter]);

  const getEditValue = useCallback(
    (buildingId: string, field: string, original: string | null) => {
      return editData[buildingId]?.[field] ?? original ?? "";
    },
    [editData]
  );

  const setEditField = useCallback((buildingId: string, field: string, value: string) => {
    setEditData((prev) => ({
      ...prev,
      [buildingId]: { ...prev[buildingId], [field]: value },
    }));
  }, []);

  const handleSave = useCallback(async (building: BuildingQuality) => {
    const changes = editData[building.id];
    if (!changes || Object.keys(changes).length === 0) return;

    setSaving(building.id);
    try {
      const res = await fetch(`/api/admin/buildings/${building.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });

      if (res.ok) {
        // Clear edit state for this building
        setEditData((prev) => {
          const next = { ...prev };
          delete next[building.id];
          return next;
        });
        // Reload page to reflect changes
        window.location.reload();
      }
    } catch (error) {
      console.error("Save error:", error);
    } finally {
      setSaving(null);
    }
  }, [editData]);

  const issueFilters: { value: IssueFilter; label: string; count: number }[] = [
    { value: "all", label: "All", count: buildings.length },
    { value: "no_images", label: "No Images", count: summary.no_images },
    { value: "no_contact", label: "No Contact", count: summary.no_contact },
    { value: "missing_description", label: "No Description", count: summary.missing_description },
    { value: "no_units", label: "No Units", count: summary.no_units },
    { value: "no_pricing", label: "No Pricing", count: summary.no_pricing },
    { value: "no_website", label: "No Website", count: summary.no_website },
  ];

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Average Score</p>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-3xl font-bold">{summary.average_score}%</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Grade A (80%+)</p>
            <p className="mt-1 text-3xl font-bold text-green-600">{summary.grade_a}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Need Work (B/C)</p>
            <p className="mt-1 text-3xl font-bold text-yellow-600">
              {summary.grade_b + summary.grade_c}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Critical (F)</p>
            <p className="mt-1 text-3xl font-bold text-red-600">{summary.grade_f}</p>
          </CardContent>
        </Card>
      </div>

      {/* Issue Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Top Issues to Fix
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: "No Images", count: summary.no_images, icon: Image, color: "text-red-500" },
              { label: "No Contact", count: summary.no_contact, icon: Phone, color: "text-orange-500" },
              { label: "No Description", count: summary.missing_description, icon: FileText, color: "text-yellow-500" },
              { label: "No Units", count: summary.no_units, icon: Home, color: "text-red-500" },
              { label: "No Pricing", count: summary.no_pricing, icon: DollarSign, color: "text-orange-500" },
              { label: "No Website", count: summary.no_website, icon: Globe, color: "text-gray-500" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2 rounded-lg border p-3">
                <item.icon className={`h-5 w-5 ${item.color}`} />
                <div>
                  <p className="text-lg font-bold">{item.count}</p>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search buildings..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <select
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
          className="rounded-md border bg-background px-3 py-2 text-sm"
        >
          <option value="all">All Cities</option>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Issue Filter Tabs */}
      <div className="flex flex-wrap gap-2">
        {issueFilters.map((f) => (
          <Button
            key={f.value}
            variant={issueFilter === f.value ? "default" : "outline"}
            size="sm"
            onClick={() => setIssueFilter(f.value)}
          >
            {f.label}
            <Badge variant="secondary" className="ml-1.5 text-xs">
              {f.count}
            </Badge>
          </Button>
        ))}
      </div>

      {/* Building List */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-muted-foreground">No buildings match your filters.</p>
            </CardContent>
          </Card>
        ) : (
          filtered.map((b) => {
            const isExpanded = expandedId === b.id;
            const hasEdits = editData[b.id] && Object.keys(editData[b.id]).length > 0;

            return (
              <Card key={b.id}>
                <CardContent className="p-4">
                  {/* Main Row */}
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : b.id)}
                      className="shrink-0"
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>

                    <GradeBadge percentage={b.percentage} />

                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{b.name}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {b.address_1} &middot; {b.city_name}
                      </p>
                    </div>

                    <div className="hidden items-center gap-3 sm:flex">
                      <CheckIcon value={b.has.images} />
                      <CheckIcon value={b.has.contact} />
                      <CheckIcon value={b.has.description} />
                      <CheckIcon value={b.has.units} />
                      <CheckIcon value={b.has.pricing} />
                    </div>

                    <ScoreBar percentage={b.percentage} />
                  </div>

                  {/* Expanded Detail */}
                  {isExpanded && (
                    <div className="mt-4 space-y-4 border-t pt-4">
                      {/* Checklist */}
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                        {[
                          { label: "Images", value: b.has.images, detail: `${b.counts.images} photos`, icon: Image },
                          { label: "Contact", value: b.has.contact, icon: Phone },
                          { label: "Description", value: b.has.description, icon: FileText },
                          { label: "Units", value: b.has.units, detail: `${b.counts.units} total`, icon: Home },
                          { label: "Pricing", value: b.has.pricing, icon: DollarSign },
                          { label: "Amenities", value: b.has.amenities, detail: `${b.counts.amenities} listed`, icon: Shield },
                          { label: "Location", value: b.has.location, icon: MapPin },
                          { label: "Policies", value: b.has.policies, icon: Shield },
                          { label: "Website", value: b.has.website, icon: Globe },
                        ].map((item) => (
                          <div
                            key={item.label}
                            className={`flex items-center gap-2 rounded-lg border p-2 text-sm ${
                              item.value ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950" : "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950"
                            }`}
                          >
                            <CheckIcon value={item.value} />
                            <span>{item.label}</span>
                            {item.detail && (
                              <span className="text-xs text-muted-foreground">({item.detail})</span>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Quick Edit Fields */}
                      <div className="space-y-3">
                        <p className="text-sm font-medium">Quick Edit</p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="text-xs text-muted-foreground">Leasing Phone</label>
                            <Input
                              value={getEditValue(b.id, "leasing_phone", b.leasing_phone)}
                              onChange={(e) => setEditField(b.id, "leasing_phone", e.target.value)}
                              placeholder="(305) 555-0100"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground">Leasing Email</label>
                            <Input
                              value={getEditValue(b.id, "leasing_email", b.leasing_email)}
                              onChange={(e) => setEditField(b.id, "leasing_email", e.target.value)}
                              placeholder="leasing@building.com"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="text-xs text-muted-foreground">Website URL</label>
                            <Input
                              value={getEditValue(b.id, "website_url", b.website_url)}
                              onChange={(e) => setEditField(b.id, "website_url", e.target.value)}
                              placeholder="https://buildingname.com"
                            />
                          </div>
                        </div>

                        {hasEdits && (
                          <Button
                            size="sm"
                            onClick={() => handleSave(b)}
                            disabled={saving === b.id}
                          >
                            {saving === b.id ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Save className="mr-2 h-4 w-4" />
                            )}
                            Save Changes
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        Showing {filtered.length} of {buildings.length} active buildings
      </p>
    </div>
  );
}
