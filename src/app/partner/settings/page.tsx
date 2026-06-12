"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Settings, Save, Loader2, CheckCircle } from "lucide-react";

interface PartnerSettings {
  company_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: string;
  created_at: string;
}

export default function PartnerSettingsPage() {
  const [settings, setSettings] = useState<PartnerSettings | null>(null);
  const [form, setForm] = useState({
    company_name: "",
    contact_name: "",
    contact_email: "",
    contact_phone: "",
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/partner/settings")
      .then(async (r) => {
        if (!r.ok) throw new Error("Failed to load settings");
        const data = await r.json();
        setSettings(data);
        setForm({
          company_name: data.company_name || "",
          contact_name: data.contact_name || "",
          contact_email: data.contact_email || "",
          contact_phone: data.contact_phone || "",
        });
      })
      .catch(() => setLoadError("Failed to load settings — please refresh the page to try again."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    return () => {
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    };
  }, []);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setSaveError("");
    try {
      const res = await fetch("/api/partner/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: form.company_name || null,
          contact_name: form.contact_name || null,
          contact_email: form.contact_email || null,
          contact_phone: form.contact_phone || null,
        }),
      });
      if (res.ok) {
        setSaved(true);
        if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
        savedTimeoutRef.current = setTimeout(() => setSaved(false), 3000);
      } else {
        setSaveError("Failed to save changes — please try again.");
      }
    } catch {
      setSaveError("Network error — please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-sm text-red-500">{loadError}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your partner profile</p>
      </div>

      {/* Account status */}
      {settings && (
        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Account Status</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Partner since {new Date(settings.created_at).toLocaleDateString("en-US", {
                    month: "long", year: "numeric",
                  })}
                </p>
              </div>
              <Badge
                variant={settings.status === "active" ? "default" : "secondary"}
                className="capitalize"
              >
                {settings.status}
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Profile form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="h-4 w-4" /> Partner Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-sm font-medium">Company Name</label>
              <input
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                value={form.company_name}
                onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
                placeholder="Acme Properties LLC"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Contact Name</label>
              <input
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                value={form.contact_name}
                onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))}
                placeholder="Jane Smith"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Contact Phone</label>
              <input
                type="tel"
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                value={form.contact_phone}
                onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))}
                placeholder="+1 (555) 000-0000"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-sm font-medium">Contact Email</label>
              <input
                type="email"
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                value={form.contact_email}
                onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))}
                placeholder="contact@yourcompany.com"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button onClick={save} disabled={saving}>
              {saving
                ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                : <Save className="h-4 w-4 mr-2" />
              }
              Save Changes
            </Button>
            {saved && (
              <span className="flex items-center gap-1.5 text-sm text-green-600">
                <CheckCircle className="h-4 w-4" /> Saved
              </span>
            )}
            {saveError && <span className="text-sm text-red-500">{saveError}</span>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
