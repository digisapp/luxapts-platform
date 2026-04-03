"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, AlertCircle } from "lucide-react";

type Building = { id: string; name: string };

export function PostLeadDialog({ buildings }: { buildings: Building[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    building_id: "",
    client_name: "",
    client_email: "",
    client_phone: "",
    preferred_date: "",
    preferred_time: "18:00",
    unit_type: "",
    notes: "",
    special_instructions: "",
    expires_hours: "24",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        building_id: form.building_id,
        client_name: form.client_name,
        preferred_date: form.preferred_date,
        preferred_time: form.preferred_time,
      };
      if (form.client_email) body.client_email = form.client_email;
      if (form.client_phone) body.client_phone = form.client_phone;
      if (form.unit_type) body.unit_type = form.unit_type;
      if (form.notes) body.notes = form.notes;
      if (form.special_instructions) body.special_instructions = form.special_instructions;
      if (form.expires_hours) body.expires_hours = parseInt(form.expires_hours);

      const res = await fetch("/api/admin/showing-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to post lead");
        return;
      }

      setOpen(false);
      setForm({
        building_id: "", client_name: "", client_email: "", client_phone: "",
        preferred_date: "", preferred_time: "18:00", unit_type: "",
        notes: "", special_instructions: "", expires_hours: "24",
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Post New Lead
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Post a Showing Lead</DialogTitle>
          <DialogDescription>
            Fill in the client and showing details. Certified Showers for this building
            will see it in their lead feed immediately.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Building *</Label>
            <Select
              value={form.building_id}
              onValueChange={(v) => setForm({ ...form, building_id: v })}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a building..." />
              </SelectTrigger>
              <SelectContent>
                {buildings.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="preferred_date">Date *</Label>
              <Input
                id="preferred_date"
                type="date"
                value={form.preferred_date}
                onChange={(e) => setForm({ ...form, preferred_date: e.target.value })}
                min={new Date().toISOString().split("T")[0]}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="preferred_time">Time *</Label>
              <Input
                id="preferred_time"
                type="time"
                value={form.preferred_time}
                onChange={(e) => setForm({ ...form, preferred_time: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="client_name">Client Name *</Label>
            <Input
              id="client_name"
              placeholder="Jane Smith"
              value={form.client_name}
              onChange={(e) => setForm({ ...form, client_name: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="client_phone">Client Phone</Label>
              <Input
                id="client_phone"
                type="tel"
                placeholder="+1 (305) 555-0100"
                value={form.client_phone}
                onChange={(e) => setForm({ ...form, client_phone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client_email">Client Email</Label>
              <Input
                id="client_email"
                type="email"
                placeholder="jane@example.com"
                value={form.client_email}
                onChange={(e) => setForm({ ...form, client_email: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="unit_type">Unit Type</Label>
              <Select
                value={form.unit_type}
                onValueChange={(v) => setForm({ ...form, unit_type: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Studio">Studio</SelectItem>
                  <SelectItem value="1BR">1 Bedroom</SelectItem>
                  <SelectItem value="2BR">2 Bedroom</SelectItem>
                  <SelectItem value="3BR">3 Bedroom</SelectItem>
                  <SelectItem value="Penthouse">Penthouse</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="expires_hours">Expires After</Label>
              <Select
                value={form.expires_hours}
                onValueChange={(v) => setForm({ ...form, expires_hours: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="6">6 hours</SelectItem>
                  <SelectItem value="12">12 hours</SelectItem>
                  <SelectItem value="24">24 hours</SelectItem>
                  <SelectItem value="48">48 hours</SelectItem>
                  <SelectItem value="72">72 hours</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="special_instructions">Instructions for Shower</Label>
            <Textarea
              id="special_instructions"
              placeholder="e.g. Meet client at lobby, ask for Maria at front desk..."
              value={form.special_instructions}
              onChange={(e) => setForm({ ...form, special_instructions: e.target.value })}
              rows={2}
              maxLength={500}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Private Admin Notes</Label>
            <Textarea
              id="notes"
              placeholder="Internal notes (not shown to Shower)..."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              maxLength={1000}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Posting..." : "Post Lead"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
