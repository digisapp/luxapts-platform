"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Loader2, BookOpen } from "lucide-react";

interface Fact {
  id: string;
  key: string;
  value: string;
  created_at: string;
}

interface BuildingFactsCardProps {
  buildingId: string;
}

// Suggested keys to make it easy for admins
const SUGGESTED_KEYS = [
  "year_built", "floors", "units_total", "transit_score", "walk_score",
  "bike_score", "move_in_specials", "laundry", "concierge_hours",
  "management_company", "neighborhood_vibe", "nearest_subway",
];

export function BuildingFactsCard({ buildingId }: BuildingFactsCardProps) {
  const [facts, setFacts] = useState<Fact[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/buildings/${buildingId}/facts`)
      .then((r) => r.json())
      .then((data) => { setFacts(data.facts || []); setLoading(false); });
  }, [buildingId]);

  const addFact = async () => {
    const key = newKey.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    const value = newValue.trim();
    if (!key || !value) { setError("Both key and value are required"); return; }
    if (!/^[a-z0-9_]+$/.test(key)) { setError("Key must be lowercase letters, numbers, underscores"); return; }

    setSaving(true);
    setError("");
    const res = await fetch(`/api/admin/buildings/${buildingId}/facts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });

    if (res.ok) {
      const data = await res.json();
      setFacts((prev) => {
        const idx = prev.findIndex((f) => f.key === key);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = data.fact;
          return next;
        }
        return [...prev, data.fact].sort((a, b) => a.key.localeCompare(b.key));
      });
      setNewKey("");
      setNewValue("");
      setShowForm(false);
    } else {
      const data = await res.json();
      setError(data.error || "Failed to save");
    }
    setSaving(false);
  };

  const deleteFact = async (key: string) => {
    setDeletingKey(key);
    const res = await fetch(`/api/admin/buildings/${buildingId}/facts?key=${encodeURIComponent(key)}`, { method: "DELETE" });
    if (res.ok) setFacts((prev) => prev.filter((f) => f.key !== key));
    setDeletingKey(null);
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-sm flex items-center gap-1.5">
            <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
            Building Facts
            <span className="text-xs text-muted-foreground font-normal ml-1">· used to ground AI responses</span>
          </h4>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-3 w-3 mr-1" />
            Add Fact
          </Button>
        </div>

        {/* Add form */}
        {showForm && (
          <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground">Key</label>
                <input
                  className="mt-0.5 w-full rounded border px-2 py-1.5 text-xs font-mono bg-background"
                  placeholder="year_built"
                  value={newKey}
                  onChange={(e) => { setNewKey(e.target.value); setError(""); }}
                  list="fact-key-suggestions"
                />
                <datalist id="fact-key-suggestions">
                  {SUGGESTED_KEYS.map((k) => <option key={k} value={k} />)}
                </datalist>
              </div>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground">Value</label>
                <input
                  className="mt-0.5 w-full rounded border px-2 py-1.5 text-xs bg-background"
                  placeholder="2019"
                  value={newValue}
                  onChange={(e) => { setNewValue(e.target.value); setError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && addFact()}
                />
              </div>
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <div className="flex gap-2">
              <Button size="sm" className="h-7 text-xs" onClick={addFact} disabled={saving}>
                {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Save
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setShowForm(false); setError(""); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Facts table */}
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : facts.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">
            No facts yet. Facts like <code className="bg-muted px-1 rounded">year_built</code>, <code className="bg-muted px-1 rounded">floors</code>, and <code className="bg-muted px-1 rounded">transit_score</code> help Stacy answer questions accurately.
          </p>
        ) : (
          <div className="rounded-lg border divide-y text-sm">
            {facts.map((fact) => (
              <div key={fact.key} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/30 group">
                <code className="text-xs text-muted-foreground w-40 shrink-0 font-mono">{fact.key}</code>
                <span className="flex-1 text-xs truncate">{fact.value}</span>
                <button
                  onClick={() => deleteFact(fact.key)}
                  disabled={deletingKey === fact.key}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 transition-all"
                >
                  {deletingKey === fact.key
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Trash2 className="h-3.5 w-3.5" />
                  }
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
