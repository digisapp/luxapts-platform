"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Building2, CheckCircle, AlertCircle } from "lucide-react";

export default function ShowerProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const [form, setForm] = useState({
    display_name: "",
    phone: "",
    bio: "",
    agreement_accepted: false,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.agreement_accepted) {
      setError("You must accept the Independent Contractor Agreement to continue.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/showers/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, agreement_accepted: true }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }

      setSubmitted(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-10 pb-8 space-y-4">
            <div className="flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
            </div>
            <h2 className="text-2xl font-bold">Application Submitted</h2>
            <p className="text-muted-foreground">
              Your Shower application is under review. You will be notified once approved.
              Approval typically takes 1–2 business days.
            </p>
            <Button variant="outline" onClick={() => router.push("/")}>
              Back to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6 bg-muted/20">
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <Building2 className="h-7 w-7 text-primary" />
            </div>
          </div>
          <h1 className="text-3xl font-bold">Become a Shower</h1>
          <p className="text-muted-foreground max-w-sm mx-auto">
            Join LuxApts as an independent Shower. Get certified for buildings,
            claim showing leads, and earn $150 per showing + placement bonuses.
          </p>
        </div>

        {/* How it works */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">How it works</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="flex gap-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">1</span>
              <p>Apply and get approved by admin (1–2 business days)</p>
            </div>
            <div className="flex gap-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">2</span>
              <p>Get certified for buildings by completing study materials + shadow showings</p>
            </div>
            <div className="flex gap-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">3</span>
              <p>Claim leads in your area, meet clients, and conduct tours</p>
            </div>
            <div className="flex gap-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">4</span>
              <p>Submit your debrief and earn $150 showing fee + 25% placement bonus if they lease</p>
            </div>
          </CardContent>
        </Card>

        {/* Registration form */}
        <Card>
          <CardHeader>
            <CardTitle>Your Application</CardTitle>
            <CardDescription>
              All fields are required. Your application will be reviewed by our team.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="display_name">Full Name</Label>
                <Input
                  id="display_name"
                  placeholder="Maria Garcia"
                  value={form.display_name}
                  onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                  required
                  minLength={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+1 (305) 555-0100"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bio">
                  Brief Bio <span className="text-muted-foreground text-xs">(optional)</span>
                </Label>
                <Textarea
                  id="bio"
                  placeholder="Tell us about yourself and your familiarity with Miami neighborhoods..."
                  value={form.bio}
                  onChange={(e) => setForm({ ...form, bio: e.target.value })}
                  maxLength={500}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">{form.bio.length}/500</p>
              </div>

              {/* Contractor Agreement */}
              <div className="rounded-lg border p-4 space-y-3">
                <h3 className="font-medium text-sm">Independent Contractor Agreement</h3>
                <div className="text-xs text-muted-foreground space-y-2 max-h-36 overflow-y-auto leading-relaxed">
                  <p>By checking this box, you agree to the following terms:</p>
                  <p>
                    <strong>Compensation:</strong> You will receive a Showing Fee of $150.00 per completed and approved showing,
                    paid within 5–7 business days after debrief approval. You may also receive a Placement Bonus equal to
                    25% of the brokerage commission when a lease is executed within 45 days of your showing and attribution
                    is confirmed by admin.
                  </p>
                  <p>
                    <strong>Independent Contractor Status:</strong> You are an independent contractor, not an employee.
                    You are responsible for all federal, state, and local taxes. A Form 1099 will be issued at year-end when required.
                  </p>
                  <p>
                    <strong>No-Show Policy:</strong> Claiming a lead and failing to appear without 2+ hours notice constitutes
                    a late cancel strike. Three strikes within 90 days results in account suspension.
                  </p>
                  <p>
                    <strong>Quality Standards:</strong> You agree to conduct showings professionally, represent the LuxApts brand,
                    and submit an honest debrief within 30 minutes of completing each tour.
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="agreement"
                    checked={form.agreement_accepted}
                    onCheckedChange={(checked) =>
                      setForm({ ...form, agreement_accepted: Boolean(checked) })
                    }
                  />
                  <Label htmlFor="agreement" className="text-sm leading-snug cursor-pointer">
                    I have read and agree to the Independent Contractor Agreement
                  </Label>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading || !form.agreement_accepted}>
                {loading ? "Submitting..." : "Submit Application"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
