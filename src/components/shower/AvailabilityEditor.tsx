"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Loader2, CheckCircle2 } from "lucide-react";

// Weekly availability editor: one window per day for now (the table and API
// support multiple windows per day if we ever need split shifts).

const DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// Selectable hours, 7 AM through 9 PM
const HOUR_OPTIONS = Array.from({ length: 15 }, (_, i) => {
  const h = i + 7;
  const value = `${String(h).padStart(2, "0")}:00`;
  const label =
    h === 12 ? "12:00 PM" : h > 12 ? `${h - 12}:00 PM` : `${h}:00 AM`;
  return { value, label };
});

interface DayState {
  enabled: boolean;
  start: string;
  end: string;
}

const DEFAULT_DAY: DayState = { enabled: false, start: "09:00", end: "17:00" };

export function AvailabilityEditor() {
  const [days, setDays] = useState<DayState[]>(
    Array.from({ length: 7 }, () => ({ ...DEFAULT_DAY }))
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/shower/availability")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed to load"))))
      .then((data: { windows: { day_of_week: number; start_time: string; end_time: string }[] }) => {
        if (cancelled) return;
        setDays((prev) => {
          const next = prev.map((d) => ({ ...d }));
          for (const w of data.windows) {
            next[w.day_of_week] = {
              enabled: true,
              start: w.start_time.slice(0, 5),
              end: w.end_time.slice(0, 5),
            };
          }
          return next;
        });
      })
      .catch(() => {
        if (!cancelled) setError("Could not load your schedule. Refresh to try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function updateDay(index: number, patch: Partial<DayState>) {
    setDays((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const windows = days
        .map((d, i) => ({ day_of_week: i, start_time: d.start, end_time: d.end, enabled: d.enabled }))
        .filter((d) => d.enabled)
        .map(({ day_of_week, start_time, end_time }) => ({ day_of_week, start_time, end_time }));

      for (const w of windows) {
        if (w.end_time <= w.start_time) {
          throw new Error(`${DAY_LABELS[w.day_of_week]}: end time must be after start time`);
        }
      }

      const res = await fetch("/api/shower/availability", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ windows }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save");
      }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading your schedule…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 divide-y">
          {days.map((day, i) => (
            <div key={DAY_LABELS[i]} className="flex items-center gap-4 py-3">
              <Switch
                checked={day.enabled}
                onCheckedChange={(checked) => updateDay(i, { enabled: checked })}
                aria-label={`Available on ${DAY_LABELS[i]}`}
              />
              <span className="w-28 text-sm font-medium">{DAY_LABELS[i]}</span>
              {day.enabled ? (
                <div className="flex items-center gap-2">
                  <select
                    value={day.start}
                    onChange={(e) => updateDay(i, { start: e.target.value })}
                    aria-label={`${DAY_LABELS[i]} start time`}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {HOUR_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <span className="text-sm text-muted-foreground">to</span>
                  <select
                    value={day.end}
                    onChange={(e) => updateDay(i, { end: e.target.value })}
                    aria-label={`${DAY_LABELS[i]} end time`}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {HOUR_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Unavailable</span>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {saving ? "Saving…" : "Save Schedule"}
        </Button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-green-600">
            <CheckCircle2 className="h-4 w-4" /> Saved
          </span>
        )}
      </div>
    </div>
  );
}
