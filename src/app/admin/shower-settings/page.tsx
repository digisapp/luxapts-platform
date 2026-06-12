"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  DollarSign, Award, AlertTriangle, Clock,
  CheckCircle, AlertCircle, Info, RefreshCw,
} from "lucide-react";

type Settings = {
  showing_fee: number;
  placement_bonus_pct: number;
  mentorship_bonus: number;
  tier_premier: { min_showings: number; min_rating: number };
  tier_elite: { min_showings: number; min_rating: number };
  strike_policy: { max_strikes: number; window_days: number; late_cancel_hours: number };
  payout_timelines: { showing_fee_days: number; commission_dispute_days: number; placement_bonus_buffer_days: number };
  lead_feed: { default_expiry_hours: number; debrief_window_minutes: number; lease_attribution_days: number };
};

type SaveState = "idle" | "saving" | "saved" | "error";

// Self-contained number input that only updates parent on blur
function NumberField({
  label,
  description,
  value,
  onChange,
  min,
  max,
  step = 1,
  prefix,
  suffix,
}: {
  label: string;
  description?: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  prefix?: string;
  suffix?: string;
}) {
  const [local, setLocal] = useState(String(value));
  // Re-sync the draft input when the canonical value changes (e.g. after load)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setLocal(String(value)), [value]);

  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      <div className="flex items-center gap-2">
        {prefix && <span className="text-sm text-muted-foreground w-4">{prefix}</span>}
        <Input
          type="number"
          className="w-32"
          value={local}
          min={min}
          max={max}
          step={step}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={() => {
            const n = parseFloat(local);
            if (!isNaN(n)) {
              const clamped = min !== undefined && n < min ? min : max !== undefined && n > max ? max : n;
              onChange(clamped);
              setLocal(String(clamped));
            } else {
              setLocal(String(value));
            }
          }}
        />
        {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}

export default function ShowerSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/shower-settings");
      const data = await res.json();
      if (res.ok) setSettings(data.settings);
      else setLoadError(data.error || "Failed to load settings");
    } catch {
      setLoadError("Failed to load settings — please try again");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  async function handleSave() {
    if (!settings) return;
    setSaveState("saving");
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    try {
      const res = await fetch("/api/admin/shower-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (res.ok) {
        setSettings(data.settings);
        setSaveState("saved");
        saveTimeoutRef.current = setTimeout(() => setSaveState("idle"), 3000);
      } else {
        console.error(data.error);
        setSaveState("error");
        saveTimeoutRef.current = setTimeout(() => setSaveState("idle"), 4000);
      }
    } catch {
      setSaveState("error");
      saveTimeoutRef.current = setTimeout(() => setSaveState("idle"), 4000);
    }
  }

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((prev) => prev ? { ...prev, [key]: value } : prev);
  }

  function updateNested<K extends keyof Settings>(
    key: K,
    field: string,
    value: number
  ) {
    setSettings((prev) => {
      if (!prev) return prev;
      return { ...prev, [key]: { ...(prev[key] as object), [field]: value } };
    });
  }

  // Live preview calculations
  const exampleRents = [2500, 3000, 4000, 5000, 6000];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loadError || !settings) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3">
        <span className="flex items-center gap-1.5 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" /> {loadError || "Failed to load settings"}
        </span>
        <Button variant="outline" onClick={load}>
          <RefreshCw className="h-4 w-4 mr-2" /> Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">Shower Program Settings</h1>
          <p className="text-muted-foreground mt-1">
            All payout rules, tier thresholds, and policies. Changes take effect immediately.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saveState === "saved" && (
            <span className="flex items-center gap-1.5 text-sm text-green-600">
              <CheckCircle className="h-4 w-4" /> Saved
            </span>
          )}
          {saveState === "error" && (
            <span className="flex items-center gap-1.5 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" /> Failed to save
            </span>
          )}
          <Button onClick={handleSave} disabled={saveState === "saving"}>
            {saveState === "saving" ? "Saving..." : "Save All Changes"}
          </Button>
        </div>
      </div>

      {/* ── PAYOUT RULES ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="h-4 w-4 text-green-600" />
            Payout Rules
          </CardTitle>
          <CardDescription>
            How much Showers earn per showing and per closed deal.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid md:grid-cols-3 gap-6">
            <NumberField
              label="Showing Fee"
              description="Flat fee per approved showing debrief"
              value={settings.showing_fee}
              onChange={(v) => update("showing_fee", v)}
              min={0}
              max={10000}
              step={25}
              prefix="$"
            />
            <NumberField
              label="Placement Bonus"
              description="% of brokerage commission paid to the Shower when lease closes"
              value={settings.placement_bonus_pct}
              onChange={(v) => update("placement_bonus_pct", v)}
              min={0}
              max={100}
              step={1}
              suffix="%"
            />
            <NumberField
              label="Mentorship Bonus"
              description="Flat bonus for certified Showers who lead a shadow session"
              value={settings.mentorship_bonus}
              onChange={(v) => update("mentorship_bonus", v)}
              min={0}
              max={500}
              step={5}
              prefix="$"
            />
          </div>

          <Separator />

          {/* Live Payout Calculator */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-medium">Live Payout Preview</p>
            </div>
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Monthly Rent</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Commission to Brokerage</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Showing Fee</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Placement Bonus</th>
                    <th className="text-right px-4 py-2.5 font-medium text-green-600">Total if Lease Closes</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {exampleRents.map((rent) => {
                    const commission = rent / 2;
                    const bonus = commission * (settings.placement_bonus_pct / 100);
                    const total = settings.showing_fee + bonus;
                    return (
                      <tr key={rent} className="hover:bg-muted/20">
                        <td className="px-4 py-2.5">${rent.toLocaleString()}/mo</td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground">${commission.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right">${settings.showing_fee}</td>
                        <td className="px-4 py-2.5 text-right">${bonus.toFixed(0)}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-green-600">${total.toFixed(0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── PAYOUT TIMELINES ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4 text-blue-600" />
            Payout Timelines
          </CardTitle>
          <CardDescription>
            How long before each payment type is released.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-6">
          <NumberField
            label="Showing Fee Release"
            description="Days after debrief approval before showing fee is paid"
            value={settings.payout_timelines.showing_fee_days}
            onChange={(v) => updateNested("payout_timelines", "showing_fee_days", v)}
            min={1}
            max={30}
            suffix="days"
          />
          <NumberField
            label="Commission Dispute Window"
            description="Days after commission is logged before placement bonuses release"
            value={settings.payout_timelines.commission_dispute_days}
            onChange={(v) => updateNested("payout_timelines", "commission_dispute_days", v)}
            min={1}
            max={30}
            suffix="days"
          />
          <NumberField
            label="Placement Bonus Buffer"
            description="Days after lease signing used to estimate when placement bonus is paid (accounts for 60–90 day commission lag)"
            value={settings.payout_timelines.placement_bonus_buffer_days}
            onChange={(v) => updateNested("payout_timelines", "placement_bonus_buffer_days", v)}
            min={1}
            max={180}
            suffix="days"
          />
        </CardContent>
      </Card>

      {/* ── TIER THRESHOLDS ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Award className="h-4 w-4 text-amber-500" />
            Tier Thresholds
          </CardTitle>
          <CardDescription>
            Requirements for Showers to advance from Rookie to Premier to Elite.
            Elite also requires an admin invite.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Visual tier ladder */}
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { tier: "Rookie", color: "bg-gray-100 border-gray-300 text-gray-700", desc: "Default — all approved Showers start here", req: "Approved account" },
              { tier: "Premier", color: "bg-blue-100 border-blue-300 text-blue-700", desc: "+60 second priority claim window, +15% payout", req: `${settings.tier_premier.min_showings} showings + ${settings.tier_premier.min_rating}★` },
              { tier: "Elite", color: "bg-amber-100 border-amber-300 text-amber-700", desc: "First access to all leads, +60% payout, can certify Showers", req: `${settings.tier_elite.min_showings} showings + ${settings.tier_elite.min_rating}★ + invite` },
            ].map((t) => (
              <div key={t.tier} className={`rounded-lg border-2 p-4 ${t.color}`}>
                <p className="font-bold">{t.tier}</p>
                <p className="text-xs mt-1 opacity-80">{t.req}</p>
                <p className="text-xs mt-2 opacity-70">{t.desc}</p>
              </div>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Premier */}
            <div className="space-y-4">
              <p className="text-sm font-semibold text-blue-700 flex items-center gap-1.5">
                <Award className="h-3.5 w-3.5" /> Premier Requirements
              </p>
              <NumberField
                label="Minimum Showings"
                value={settings.tier_premier.min_showings}
                onChange={(v) => updateNested("tier_premier", "min_showings", v)}
                min={1}
                max={settings.tier_elite.min_showings - 1}
                suffix="showings"
              />
              <NumberField
                label="Minimum Rating"
                value={settings.tier_premier.min_rating}
                onChange={(v) => updateNested("tier_premier", "min_rating", v)}
                min={1}
                max={5}
                step={0.1}
                suffix="★ avg"
              />
            </div>

            {/* Elite */}
            <div className="space-y-4">
              <p className="text-sm font-semibold text-amber-700 flex items-center gap-1.5">
                <Award className="h-3.5 w-3.5" /> Elite Requirements
              </p>
              <NumberField
                label="Minimum Showings"
                value={settings.tier_elite.min_showings}
                onChange={(v) => updateNested("tier_elite", "min_showings", v)}
                min={settings.tier_premier.min_showings + 1}
                max={500}
                suffix="showings"
              />
              <NumberField
                label="Minimum Rating"
                value={settings.tier_elite.min_rating}
                onChange={(v) => updateNested("tier_elite", "min_rating", v)}
                min={settings.tier_premier.min_rating}
                max={5}
                step={0.1}
                suffix="★ avg"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── STRIKE POLICY ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            Strike Policy
          </CardTitle>
          <CardDescription>
            Rules for no-shows and late cancellations. Exceeding the strike limit auto-suspends the Shower.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid md:grid-cols-3 gap-6">
            <NumberField
              label="Max Strikes"
              description="Strikes before automatic suspension"
              value={settings.strike_policy.max_strikes}
              onChange={(v) => updateNested("strike_policy", "max_strikes", v)}
              min={1}
              max={20}
              suffix="strikes"
            />
            <NumberField
              label="Strike Window"
              description="Rolling window for counting strikes"
              value={settings.strike_policy.window_days}
              onChange={(v) => updateNested("strike_policy", "window_days", v)}
              min={1}
              max={365}
              suffix="days"
            />
            <NumberField
              label="Late Cancel Threshold"
              description="Cancellations with less notice than this count as a late cancel strike"
              value={settings.strike_policy.late_cancel_hours}
              onChange={(v) => updateNested("strike_policy", "late_cancel_hours", v)}
              min={0}
              max={48}
              suffix="hrs notice"
            />
          </div>

          <div className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Current Policy Summary</p>
            <p>
              A Shower is automatically suspended if they accumulate{" "}
              <strong>{settings.strike_policy.max_strikes} or more strikes</strong> within{" "}
              <strong>{settings.strike_policy.window_days} days</strong>.
              Cancelling with less than <strong>{settings.strike_policy.late_cancel_hours} hours</strong> notice
              counts as a late-cancel strike. No-shows always count as a strike.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── LEAD FEED RULES ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="h-4 w-4 text-purple-600" />
            Lead Feed Rules
          </CardTitle>
          <CardDescription>
            How the lead feed and showing workflow behaves.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-6">
          <NumberField
            label="Default Lead Expiry"
            description="Unclaimed leads auto-expire after this many hours (can be overridden per lead)"
            value={settings.lead_feed.default_expiry_hours}
            onChange={(v) => updateNested("lead_feed", "default_expiry_hours", v)}
            min={1}
            max={168}
            suffix="hours"
          />
          <NumberField
            label="Debrief Window"
            description="Minutes after showing time before a debrief reminder is sent"
            value={settings.lead_feed.debrief_window_minutes}
            onChange={(v) => updateNested("lead_feed", "debrief_window_minutes", v)}
            min={5}
            max={240}
            suffix="min"
          />
          <NumberField
            label="Lease Attribution Window"
            description="Days after showing within which a lease can be attributed to that Shower for the placement bonus"
            value={settings.lead_feed.lease_attribution_days}
            onChange={(v) => updateNested("lead_feed", "lease_attribution_days", v)}
            min={1}
            max={90}
            suffix="days"
          />
        </CardContent>
      </Card>

      {/* Save footer */}
      <div className="flex items-center justify-end gap-3 pb-8">
        {saveState === "saved" && (
          <span className="flex items-center gap-1.5 text-sm text-green-600">
            <CheckCircle className="h-4 w-4" /> All changes saved
          </span>
        )}
        {saveState === "error" && (
          <span className="flex items-center gap-1.5 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" /> Failed to save — try again
          </span>
        )}
        <Button onClick={handleSave} size="lg" disabled={saveState === "saving"}>
          {saveState === "saving" ? "Saving..." : "Save All Changes"}
        </Button>
      </div>
    </div>
  );
}
