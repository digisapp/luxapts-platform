"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Building2, CheckCircle, AlertCircle, Award, Clock,
  Loader2, Star, User,
} from "lucide-react";

type ShowerProfile = {
  id: string;
  status: string;
  tier: string | null;
  display_name: string;
  total_showings: number | null;
  avg_rating: number | null;
  created_at: string;
};

const statusConfig: Record<string, { label: string; color: string; note: string }> = {
  pending: {
    label: "Pending Review",
    color: "bg-yellow-100 text-yellow-700",
    note: "Your application is under review. Approval typically takes 1–2 business days.",
  },
  approved: {
    label: "Approved",
    color: "bg-green-100 text-green-700",
    note: "You're active. Get certified for buildings to unlock their leads.",
  },
  suspended: {
    label: "Suspended",
    color: "bg-red-100 text-red-700",
    note: "Your account is suspended. Contact your manager for next steps.",
  },
  rejected: {
    label: "Not Approved",
    color: "bg-gray-100 text-gray-600",
    note: "Your application wasn't approved. Contact your manager for next steps.",
  },
};

export default function ShowerProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Registered showers must never see the registration form — submitting it
  // again just 409s. Resolve the current user's profile first.
  const [checking, setChecking] = useState(true);
  const [profile, setProfile] = useState<ShowerProfile | null>(null);

  const [form, setForm] = useState({
    display_name: "",
    phone: "",
    bio: "",
    agreement_accepted: false,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      try {
        const res = await fetch("/api/showers/register");
        if (res.status === 401) {
          router.replace("/auth/login?redirect=/shower/profile");
          return;
        }
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && data.registered && data.shower) {
          setProfile(data.shower as ShowerProfile);
        }
      } catch {
        // Offline or a transient failure — fall through to the form, which
        // surfaces the 409 if a profile does in fact exist.
      } finally {
        if (!cancelled) setChecking(false);
      }
    }

    loadProfile();
    return () => {
      cancelled = true;
    };
  }, [router]);

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

  if (checking) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Already registered: read-only status view instead of the signup form.
  if (profile && !submitted) {
    const status = statusConfig[profile.status] || {
      label: profile.status,
      color: "bg-gray-100 text-gray-600",
      note: "",
    };

    // Rendered inside the /shower sidebar shell, so match the dashboard pages
    // instead of the standalone centered registration form below.
    return (
      <div className="max-w-2xl space-y-8">
        <div className="space-y-8">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <User className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">My Profile</h1>
              <p className="text-muted-foreground">Your Shower account details</p>
            </div>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">{profile.display_name}</CardTitle>
                  <CardDescription className="mt-0.5">
                    Shower since{" "}
                    {new Date(profile.created_at).toLocaleDateString("en-US", {
                      month: "long",
                      year: "numeric",
                    })}
                  </CardDescription>
                </div>
                <Badge className={status.color}>{status.label}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {status.note && (
                <div className="flex gap-2 rounded-md bg-muted/60 p-3 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{status.note}</span>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Tier</p>
                  <p className="font-medium capitalize mt-0.5">{profile.tier || "—"}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Showings</p>
                  <p className="font-medium mt-0.5">{profile.total_showings ?? 0}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Rating</p>
                  <p className="font-medium mt-0.5 flex items-center justify-center gap-1">
                    {profile.avg_rating != null && profile.avg_rating > 0 ? (
                      <>
                        <Star className="h-3.5 w-3.5 text-yellow-500" />
                        {profile.avg_rating.toFixed(1)}
                      </>
                    ) : (
                      "—"
                    )}
                  </p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Need to change your name, phone, or bio? Contact your manager —
                profile details are updated by admin.
              </p>

              {profile.status === "approved" && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button className="w-full" asChild>
                    <Link href="/shower/certifications">
                      <Award className="mr-2 h-4 w-4" />
                      My Certifications
                    </Link>
                  </Button>
                  <Button variant="outline" className="w-full" asChild>
                    <Link href="/shower">Back to Dashboard</Link>
                  </Button>
                </div>
              )}
              {profile.status !== "approved" && (
                <Button variant="outline" className="w-full" asChild>
                  <Link href="/">Back to Home</Link>
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
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
            Join Staycio as an independent Shower. Get certified for buildings,
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
                    <strong>Quality Standards:</strong> You agree to conduct showings professionally, represent the Staycio brand,
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
