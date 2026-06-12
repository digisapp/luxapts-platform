"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Users, Phone, Mail, ChevronLeft, ChevronRight,
  Building2, Calendar, DollarSign, Loader2,
} from "lucide-react";

interface TargetedBuilding {
  building_id: string;
  building_name: string;
  rank: number | null;
}

interface Lead {
  id: string;
  name: string | null;
  user_email: string | null;
  user_phone: string | null;
  status: string;
  source: string | null;
  budget_min: number | null;
  budget_max: number | null;
  beds: number | null;
  move_in_date: string | null;
  created_at: string;
  cities: { name: string } | null;
  targeted_buildings: TargetedBuilding[];
}

const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-100 text-blue-700",
  contacted: "bg-purple-100 text-purple-700",
  qualified: "bg-green-100 text-green-700",
  touring: "bg-amber-100 text-amber-700",
  applied: "bg-emerald-100 text-emerald-700",
  closed: "bg-gray-100 text-gray-500",
  lost: "bg-red-100 text-red-500",
};

const STATUSES = ["", "new", "contacted", "qualified", "touring", "applied", "closed", "lost"];
const LIMIT = 20;

function formatBudget(min: number | null, max: number | null) {
  if (!min && !max) return null;
  const fmt = (n: number) => `$${n >= 1000 ? `${Math.round(n / 100) / 10}k` : n}`;
  if (min && max) return `${fmt(min)} – ${fmt(max)}`;
  if (max) return `up to ${fmt(max)}`;
  return `from ${fmt(min!)}`;
}

function InquiriesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const status = searchParams.get("status") || "";
  const page = Math.max(0, parseInt(searchParams.get("page") || "0"));

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ limit: String(LIMIT), offset: String(page * LIMIT) });
        if (status) params.set("status", status);
        const res = await fetch(`/api/partner/leads?${params}`);
        if (!res.ok) throw new Error("Request failed");
        const data = await res.json();
        if (ignore) return;
        setLeads(data.leads || []);
        setTotal(data.total || 0);
      } catch {
        if (!ignore) setError("Failed to load inquiries — please try again.");
      } finally {
        if (!ignore) setLoading(false);
      }
    };
    load();
    return () => { ignore = true; };
  }, [status, page]);

  const setFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.push(`?${params.toString()}`);
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Inquiries</h1>
        <p className="text-muted-foreground">
          {total} lead{total !== 1 ? "s" : ""} across your buildings
        </p>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button
            key={s || "all"}
            onClick={() => setFilter("status", s)}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors capitalize ${
              status === s
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {s || "All"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center">
            <p className="text-sm text-red-500">{error}</p>
          </CardContent>
        </Card>
      ) : leads.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg mb-2">No inquiries yet</h3>
            <p className="text-muted-foreground text-sm max-w-sm">
              {status
                ? `No leads with status "${status}".`
                : "When renters inquire about your buildings, they'll appear here."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {leads.map((lead) => {
            const budget = formatBudget(lead.budget_min, lead.budget_max);
            const bedsLabel = lead.beds === 0 ? "Studio" : lead.beds != null ? `${lead.beds}BR` : null;
            const city = lead.cities && typeof lead.cities === "object" && "name" in lead.cities
              ? (lead.cities as { name: string }).name
              : null;

            return (
              <Card key={lead.id}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start gap-4 flex-wrap">
                    <div className="flex-1 min-w-0 space-y-2">
                      {/* Name + status */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium">{lead.name || "Anonymous"}</p>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                            STATUS_COLORS[lead.status] || "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {lead.status}
                        </span>
                        {lead.source && (
                          <span className="text-xs text-muted-foreground">via {lead.source}</span>
                        )}
                      </div>

                      {/* Contact info */}
                      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                        {lead.user_email && (
                          <a
                            href={`mailto:${lead.user_email}`}
                            className="flex items-center gap-1.5 hover:text-foreground"
                          >
                            <Mail className="h-3.5 w-3.5" />
                            {lead.user_email}
                          </a>
                        )}
                        {lead.user_phone && (
                          <a
                            href={`tel:${lead.user_phone}`}
                            className="flex items-center gap-1.5 hover:text-foreground"
                          >
                            <Phone className="h-3.5 w-3.5" />
                            {lead.user_phone}
                          </a>
                        )}
                      </div>

                      {/* Preferences */}
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {city && (
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" /> {city}
                          </span>
                        )}
                        {bedsLabel && <span>{bedsLabel}</span>}
                        {budget && (
                          <span className="flex items-center gap-1">
                            <DollarSign className="h-3 w-3" /> {budget}/mo
                          </span>
                        )}
                        {lead.move_in_date && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Move-in {new Date(lead.move_in_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </span>
                        )}
                      </div>

                      {/* Targeted buildings */}
                      {lead.targeted_buildings.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {lead.targeted_buildings.map((tb) => (
                            <span
                              key={tb.building_id}
                              className="rounded-md bg-muted px-2 py-0.5 text-xs"
                            >
                              {tb.building_name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground shrink-0 pt-0.5">
                      {new Date(lead.created_at).toLocaleDateString("en-US", {
                        month: "short", day: "numeric", year: "numeric",
                      })}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages} · {total} total
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setFilter("page", String(page - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setFilter("page", String(page + 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PartnerLeadsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <InquiriesContent />
    </Suspense>
  );
}
