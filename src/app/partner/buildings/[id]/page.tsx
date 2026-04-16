"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Building2, ArrowLeft, CheckCircle, XCircle,
  DollarSign, Save, Loader2
} from "lucide-react";

interface Unit {
  id: string;
  unit_number: string | null;
  floor: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  is_available: boolean;
  available_on: string | null;
  current_rent: number | null;
}

interface Building {
  id: string;
  name: string;
  address_1: string;
  status: string;
  description: string | null;
  website_url: string | null;
  leasing_phone: string | null;
  leasing_email: string | null;
  pet_policy: string | null;
  parking_policy: string | null;
}

interface UnitEdit {
  is_available: boolean;
  available_on: string;
  rent: string;
  dirty: boolean;
  saving: boolean;
}

export default function PartnerBuildingPage() {
  const params = useParams();
  const router = useRouter();
  const buildingId = params.id as string;

  const [building, setBuilding] = useState<Building | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [unitEdits, setUnitEdits] = useState<Record<string, UnitEdit>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editDesc, setEditDesc] = useState(false);
  const [form, setForm] = useState({
    description: "",
    leasing_phone: "",
    leasing_email: "",
    pet_policy: "",
    parking_policy: "",
  });

  const load = useCallback(async () => {
    const res = await fetch(`/api/partner/buildings/${buildingId}`);
    if (!res.ok) { router.push("/partner/buildings"); return; }
    const data = await res.json();
    setBuilding(data.building);
    setUnits(data.units || []);
    setForm({
      description: data.building.description || "",
      leasing_phone: data.building.leasing_phone || "",
      leasing_email: data.building.leasing_email || "",
      pet_policy: data.building.pet_policy || "",
      parking_policy: data.building.parking_policy || "",
    });
    const edits: Record<string, UnitEdit> = {};
    for (const u of data.units || []) {
      edits[u.id] = {
        is_available: u.is_available,
        available_on: u.available_on || "",
        rent: u.current_rent != null ? String(u.current_rent) : "",
        dirty: false,
        saving: false,
      };
    }
    setUnitEdits(edits);
    setLoading(false);
  }, [buildingId, router]);

  useEffect(() => { load(); }, [load]);

  const saveBuilding = async () => {
    setSaving(true);
    await fetch(`/api/partner/buildings/${buildingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: form.description || null,
        leasing_phone: form.leasing_phone || null,
        leasing_email: form.leasing_email || null,
        pet_policy: form.pet_policy || null,
        parking_policy: form.parking_policy || null,
      }),
    });
    setSaving(false);
    setEditDesc(false);
  };

  const saveUnit = async (unitId: string) => {
    const edit = unitEdits[unitId];
    if (!edit) return;
    setUnitEdits((prev) => ({ ...prev, [unitId]: { ...prev[unitId], saving: true } }));

    const body: Record<string, unknown> = { is_available: edit.is_available };
    if (edit.available_on) body.available_on = edit.available_on;
    if (edit.rent && !isNaN(Number(edit.rent))) body.rent = Number(edit.rent);

    await fetch(`/api/partner/buildings/${buildingId}/units?unit_id=${unitId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setUnitEdits((prev) => ({
      ...prev,
      [unitId]: { ...prev[unitId], saving: false, dirty: false },
    }));
  };

  const updateUnitEdit = (unitId: string, updates: Partial<UnitEdit>) => {
    setUnitEdits((prev) => ({
      ...prev,
      [unitId]: { ...prev[unitId], ...updates, dirty: true },
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!building) return null;

  const availableCount = Object.values(unitEdits).filter((e) => e.is_available).length;
  const dirtyUnits = Object.entries(unitEdits).filter(([, e]) => e.dirty);

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/partner/buildings">
            <ArrowLeft className="h-4 w-4 mr-1" /> Buildings
          </Link>
        </Button>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">{building.name}</h1>
          <p className="text-muted-foreground">{building.address_1}</p>
        </div>
        <Badge variant={building.status === "active" ? "default" : "secondary"} className="capitalize">
          {building.status}
        </Badge>
      </div>

      {/* Building details */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4" /> Building Info
          </CardTitle>
          {!editDesc ? (
            <Button variant="outline" size="sm" onClick={() => setEditDesc(true)}>Edit</Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEditDesc(false)}>Cancel</Button>
              <Button size="sm" onClick={saveBuilding} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                Save
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {editDesc ? (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">Description</label>
                <textarea
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm min-h-[80px] resize-y"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Describe your building..."
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium">Leasing Phone</label>
                  <input
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                    value={form.leasing_phone}
                    onChange={(e) => setForm((f) => ({ ...f, leasing_phone: e.target.value }))}
                    placeholder="+1 (555) 000-0000"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Leasing Email</label>
                  <input
                    type="email"
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                    value={form.leasing_email}
                    onChange={(e) => setForm((f) => ({ ...f, leasing_email: e.target.value }))}
                    placeholder="leasing@example.com"
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium">Pet Policy</label>
                  <textarea
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm min-h-[60px] resize-y"
                    value={form.pet_policy}
                    onChange={(e) => setForm((f) => ({ ...f, pet_policy: e.target.value }))}
                    placeholder="Cats and small dogs allowed..."
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Parking Policy</label>
                  <textarea
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm min-h-[60px] resize-y"
                    value={form.parking_policy}
                    onChange={(e) => setForm((f) => ({ ...f, parking_policy: e.target.value }))}
                    placeholder="Valet parking available..."
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 text-sm">
              {form.description && (
                <div className="sm:col-span-2">
                  <p className="font-medium text-muted-foreground mb-1">Description</p>
                  <p className="whitespace-pre-line">{form.description}</p>
                </div>
              )}
              {form.leasing_phone && (
                <div>
                  <p className="font-medium text-muted-foreground mb-1">Leasing Phone</p>
                  <p>{form.leasing_phone}</p>
                </div>
              )}
              {form.leasing_email && (
                <div>
                  <p className="font-medium text-muted-foreground mb-1">Leasing Email</p>
                  <p>{form.leasing_email}</p>
                </div>
              )}
              {form.pet_policy && (
                <div>
                  <p className="font-medium text-muted-foreground mb-1">Pet Policy</p>
                  <p>{form.pet_policy}</p>
                </div>
              )}
              {form.parking_policy && (
                <div>
                  <p className="font-medium text-muted-foreground mb-1">Parking Policy</p>
                  <p>{form.parking_policy}</p>
                </div>
              )}
              {!form.description && !form.leasing_phone && !form.leasing_email && (
                <p className="text-muted-foreground sm:col-span-2">
                  No details added yet. Click Edit to add building information.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Units */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Units</CardTitle>
            <p className="text-sm text-muted-foreground mt-0.5">
              {availableCount} of {units.length} available
              {dirtyUnits.length > 0 && (
                <span className="ml-2 text-amber-600 font-medium">· {dirtyUnits.length} unsaved change{dirtyUnits.length > 1 ? "s" : ""}</span>
              )}
            </p>
          </div>
          {dirtyUnits.length > 0 && (
            <Button
              size="sm"
              onClick={() => dirtyUnits.forEach(([id]) => saveUnit(id))}
            >
              <Save className="h-4 w-4 mr-1" /> Save All
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {units.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">
              No units found. Contact your account manager to import unit data.
            </p>
          ) : (
            <div className="space-y-2">
              {units.map((unit) => {
                const edit = unitEdits[unit.id];
                if (!edit) return null;
                const bedsLabel = unit.beds === 0 ? "Studio" : unit.beds != null ? `${unit.beds}BR` : "—";

                return (
                  <div
                    key={unit.id}
                    className={`rounded-lg border p-3 transition-colors ${edit.dirty ? "border-amber-300 bg-amber-50/40" : ""}`}
                  >
                    <div className="flex items-center gap-3 flex-wrap">
                      {/* Unit info */}
                      <div className="min-w-[80px]">
                        <p className="font-medium text-sm">
                          {unit.unit_number ? `Unit ${unit.unit_number}` : "No #"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {bedsLabel}
                          {unit.baths != null ? ` · ${unit.baths}BA` : ""}
                          {unit.sqft != null ? ` · ${unit.sqft} sqft` : ""}
                        </p>
                      </div>

                      {/* Available toggle */}
                      <button
                        onClick={() => updateUnitEdit(unit.id, { is_available: !edit.is_available })}
                        className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                          edit.is_available
                            ? "bg-green-100 text-green-700 hover:bg-green-200"
                            : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                        }`}
                      >
                        {edit.is_available
                          ? <><CheckCircle className="h-3.5 w-3.5" /> Available</>
                          : <><XCircle className="h-3.5 w-3.5" /> Unavailable</>
                        }
                      </button>

                      {/* Available-on date (only if available) */}
                      {edit.is_available && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-muted-foreground">From</span>
                          <input
                            type="date"
                            className="rounded border px-2 py-1 text-xs"
                            value={edit.available_on}
                            onChange={(e) => updateUnitEdit(unit.id, { available_on: e.target.value })}
                          />
                        </div>
                      )}

                      {/* Rent */}
                      <div className="flex items-center gap-1.5 ml-auto">
                        <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                        <input
                          type="number"
                          className="w-24 rounded border px-2 py-1 text-xs text-right"
                          value={edit.rent}
                          onChange={(e) => updateUnitEdit(unit.id, { rent: e.target.value })}
                          placeholder="Rent/mo"
                          min={0}
                        />
                        <span className="text-xs text-muted-foreground">/mo</span>
                      </div>

                      {/* Save button if dirty */}
                      {edit.dirty && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => saveUnit(unit.id)}
                          disabled={edit.saving}
                        >
                          {edit.saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
