"use client";

import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogDescription,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, CheckCircle } from "lucide-react";

type City = { id: string; name: string; slug: string };

type BuildingFormData = {
  name: string;
  address_1: string;
  address_2: string;
  city_id: string;
  zip: string;
  status: string;
  description: string;
  website_url: string;
  leasing_phone: string;
  leasing_email: string;
  year_built: string;
  stories: string;
  pet_policy: string;
  parking_policy: string;
  deposit_policy: string;
};

const empty: BuildingFormData = {
  name: "", address_1: "", address_2: "", city_id: "", zip: "",
  status: "active", description: "", website_url: "",
  leasing_phone: "", leasing_email: "",
  year_built: "", stories: "",
  pet_policy: "", parking_policy: "", deposit_policy: "",
};

interface BuildingFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cities: City[];
  // If provided, we're editing; otherwise creating
  buildingId?: string;
  initialData?: Partial<BuildingFormData> & { name?: string };
  onSaved: (building: Record<string, unknown>) => void;
}

export function BuildingFormDialog({
  open,
  onOpenChange,
  cities,
  buildingId,
  initialData,
  onSaved,
}: BuildingFormDialogProps) {
  const isEdit = !!buildingId;
  const [form, setForm] = useState<BuildingFormData>(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Populate form when editing
  useEffect(() => {
    if (open) {
      if (initialData) {
        setForm({ ...empty, ...initialData });
      } else {
        setForm(empty);
      }
      setError(null);
      setSaved(false);
    }
  }, [open, initialData]);

  function set(field: keyof BuildingFormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Building name is required"); return; }
    if (!form.address_1.trim()) { setError("Address is required"); return; }
    if (!isEdit && !form.city_id) { setError("Please select a city"); return; }

    setSaving(true);
    setError(null);

    const body: Record<string, unknown> = {
      name: form.name.trim(),
      address_1: form.address_1.trim(),
      status: form.status,
    };
    if (form.address_2.trim()) body.address_2 = form.address_2.trim();
    if (!isEdit) body.city_id = form.city_id;
    else if (form.city_id) body.city_id = form.city_id;
    if (form.zip.trim()) body.zip = form.zip.trim();
    if (form.description.trim()) body.description = form.description.trim();
    if (form.website_url.trim()) body.website_url = form.website_url.trim();
    if (form.leasing_phone.trim()) body.leasing_phone = form.leasing_phone.trim();
    if (form.leasing_email.trim()) body.leasing_email = form.leasing_email.trim();
    if (form.year_built) body.year_built = parseInt(form.year_built);
    if (form.stories) body.stories = parseInt(form.stories);
    if (form.pet_policy.trim()) body.pet_policy = form.pet_policy.trim();
    if (form.parking_policy.trim()) body.parking_policy = form.parking_policy.trim();
    if (form.deposit_policy.trim()) body.deposit_policy = form.deposit_policy.trim();

    try {
      const res = await fetch(
        isEdit ? `/api/admin/buildings/${buildingId}` : "/api/admin/buildings",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save building");
        return;
      }
      setSaved(true);
      onSaved(data.building);
      if (!isEdit) {
        setTimeout(() => {
          onOpenChange(false);
          setSaved(false);
        }, 800);
      } else {
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${initialData?.name || "Building"}` : "Add New Building"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update building details. Changes save immediately."
              : "Fill in the details to add a new building to the platform."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-0">
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="w-full mb-4">
              <TabsTrigger value="basic" className="flex-1">Basic Info</TabsTrigger>
              <TabsTrigger value="contact" className="flex-1">Contact & Details</TabsTrigger>
              <TabsTrigger value="policies" className="flex-1">Policies</TabsTrigger>
            </TabsList>

            {/* ── TAB 1: Basic Info ── */}
            <TabsContent value="basic" className="space-y-4 mt-0">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="name">Building Name *</Label>
                  <Input
                    id="name"
                    placeholder="The Grand Brickell"
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                    required
                  />
                </div>

                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="address_1">Street Address *</Label>
                  <Input
                    id="address_1"
                    placeholder="1000 Brickell Ave"
                    value={form.address_1}
                    onChange={(e) => set("address_1", e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="address_2">Suite / Unit (optional)</Label>
                  <Input
                    id="address_2"
                    placeholder="Suite 100"
                    value={form.address_2}
                    onChange={(e) => set("address_2", e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="zip">ZIP Code</Label>
                  <Input
                    id="zip"
                    placeholder="33131"
                    value={form.zip}
                    onChange={(e) => set("zip", e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="city_id">City *</Label>
                  <Select value={form.city_id} onValueChange={(v) => set("city_id", v)}>
                    <SelectTrigger id="city_id">
                      <SelectValue placeholder="Select city..." />
                    </SelectTrigger>
                    <SelectContent>
                      {cities.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="status">Status</Label>
                  <Select value={form.status} onValueChange={(v) => set("status", v)}>
                    <SelectTrigger id="status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="coming_soon">Coming Soon</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="year_built">Year Built</Label>
                  <Input
                    id="year_built"
                    type="number"
                    placeholder="2020"
                    min={1800}
                    max={new Date().getFullYear() + 5}
                    value={form.year_built}
                    onChange={(e) => set("year_built", e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="stories">Number of Stories</Label>
                  <Input
                    id="stories"
                    type="number"
                    placeholder="35"
                    min={1}
                    max={200}
                    value={form.stories}
                    onChange={(e) => set("stories", e.target.value)}
                  />
                </div>

                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Luxury high-rise in the heart of Brickell with stunning bay views..."
                    value={form.description}
                    onChange={(e) => set("description", e.target.value)}
                    rows={4}
                    maxLength={5000}
                  />
                  <p className="text-xs text-muted-foreground">{form.description.length}/5000</p>
                </div>
              </div>
            </TabsContent>

            {/* ── TAB 2: Contact & Details ── */}
            <TabsContent value="contact" className="space-y-4 mt-0">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="website_url">Website URL</Label>
                  <Input
                    id="website_url"
                    type="url"
                    placeholder="https://grandbrickell.com"
                    value={form.website_url}
                    onChange={(e) => set("website_url", e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="leasing_phone">Leasing Phone</Label>
                  <Input
                    id="leasing_phone"
                    type="tel"
                    placeholder="+1 (305) 555-0100"
                    value={form.leasing_phone}
                    onChange={(e) => set("leasing_phone", e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="leasing_email">Leasing Email</Label>
                  <Input
                    id="leasing_email"
                    type="email"
                    placeholder="leasing@grandbrickell.com"
                    value={form.leasing_email}
                    onChange={(e) => set("leasing_email", e.target.value)}
                  />
                </div>
              </div>
            </TabsContent>

            {/* ── TAB 3: Policies ── */}
            <TabsContent value="policies" className="space-y-4 mt-0">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="pet_policy">Pet Policy</Label>
                  <Textarea
                    id="pet_policy"
                    placeholder="Pets allowed. Max 2 pets, up to 50lbs each. $500 pet deposit + $50/month pet rent..."
                    value={form.pet_policy}
                    onChange={(e) => set("pet_policy", e.target.value)}
                    rows={3}
                    maxLength={1000}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="parking_policy">Parking Policy</Label>
                  <Textarea
                    id="parking_policy"
                    placeholder="1 assigned parking space included. Additional spaces $150/month. Valet available..."
                    value={form.parking_policy}
                    onChange={(e) => set("parking_policy", e.target.value)}
                    rows={3}
                    maxLength={1000}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="deposit_policy">Deposit Policy</Label>
                  <Textarea
                    id="deposit_policy"
                    placeholder="Security deposit equal to 1 month's rent. Refundable within 30 days of move-out..."
                    value={form.deposit_policy}
                    onChange={(e) => set("deposit_policy", e.target.value)}
                    rows={3}
                    maxLength={1000}
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {/* Error / success */}
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive mt-4">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {isEdit ? "Close" : "Cancel"}
            </Button>
            <div className="flex items-center gap-3">
              {saved && (
                <span className="flex items-center gap-1.5 text-sm text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  {isEdit ? "Saved" : "Building created!"}
                </span>
              )}
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Building"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
