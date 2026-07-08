"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  MapPin, Clock, Building2, Phone, Mail,
  CheckCircle, AlertCircle, FileText,
} from "lucide-react";

type Building = { id: string; name: string; address?: string };

type OpenLead = {
  id: string;
  preferred_date: string;
  preferred_time: string;
  unit_type?: string;
  notes?: string;
  created_at: string;
  buildings: Building;
};

type ClaimedLead = {
  id: string;
  claimed_at: string;
  status: string;
  showing_leads: {
    id: string;
    client_name: string;
    client_email?: string;
    client_phone?: string;
    preferred_date: string;
    preferred_time: string;
    unit_type?: string;
    special_instructions?: string;
    status: string;
    buildings: Building;
  };
};

type DebriefForm = {
  client_showed_up: boolean | null;
  interest_level: number;
  application_likelihood: string;
  units_of_interest: string;
  client_objections: string;
  broker_notes: string;
};

export default function LeadFeedPage() {
  const [openLeads, setOpenLeads] = useState<OpenLead[]>([]);
  const [claimedLeads, setClaimedLeads] = useState<ClaimedLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Debrief dialog state
  const [debriefLeadId, setDebriefLeadId] = useState<string | null>(null);
  const [debriefForm, setDebriefForm] = useState<DebriefForm>({
    client_showed_up: null,
    interest_level: 3,
    application_likelihood: "medium",
    units_of_interest: "",
    client_objections: "",
    broker_notes: "",
  });
  const [submittingDebrief, setSubmittingDebrief] = useState(false);

  async function loadLeads() {
    setLoading(true);
    try {
      const res = await fetch("/api/shower/leads");
      const data = await res.json();
      if (res.ok) {
        setOpenLeads(data.open_leads || []);
        setClaimedLeads(data.claimed_leads || []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLeads();
  }, []);

  async function claimLead(leadId: string) {
    setClaiming(leadId);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(`/api/shower/leads/${leadId}/claim`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to claim lead");
        return;
      }
      setSuccessMsg(`Lead claimed! Client: ${data.lead.client_name} — ${data.lead.preferred_date} at ${data.lead.preferred_time?.slice(0, 5)}`);
      await loadLeads();
    } catch (err) {
      console.error("Claim lead error:", err);
      setError("Failed to claim lead. Please try again.");
    } finally {
      setClaiming(null);
    }
  }

  async function submitDebrief() {
    if (!debriefLeadId || debriefForm.client_showed_up === null) return;
    setSubmittingDebrief(true);
    try {
      const body: Record<string, unknown> = {
        client_showed_up: debriefForm.client_showed_up,
      };
      if (debriefForm.client_showed_up) {
        body.interest_level = debriefForm.interest_level;
        body.application_likelihood = debriefForm.application_likelihood;
        if (debriefForm.units_of_interest) body.units_of_interest = debriefForm.units_of_interest;
        if (debriefForm.client_objections) body.client_objections = debriefForm.client_objections;
        if (debriefForm.broker_notes) body.broker_notes = debriefForm.broker_notes;
      }

      const res = await fetch(`/api/shower/leads/${debriefLeadId}/debrief`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to submit debrief");
        return;
      }
      setSuccessMsg(data.message || "Debrief submitted.");
      setDebriefLeadId(null);
      await loadLeads();
    } catch (err) {
      console.error("Submit debrief error:", err);
      setError("Failed to submit debrief. Please try again.");
    } finally {
      setSubmittingDebrief(false);
    }
  }

  function formatTime(time: string) {
    const [h, m] = time.split(":");
    const hour = parseInt(h);
    const ampm = hour >= 12 ? "PM" : "AM";
    const display = hour > 12 ? hour - 12 : hour || 12;
    return `${display}:${m} ${ampm}`;
  }

  function formatDate(date: string) {
    return new Date(date + "T00:00:00").toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric",
    });
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Lead Feed</h1>
        <p className="text-muted-foreground">
          Open showings for buildings you are certified for. Claim one to see client details.
        </p>
      </div>

      {/* Messages */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-xs underline">dismiss</button>
        </div>
      )}
      {successMsg && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-700">
          <CheckCircle className="h-4 w-4 shrink-0" />
          {successMsg}
          <button onClick={() => setSuccessMsg(null)} className="ml-auto text-xs underline">dismiss</button>
        </div>
      )}

      {/* Active Claim */}
      {claimedLeads.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Your Active Showing</h2>
          {claimedLeads.map((claim) => {
            const lead = claim.showing_leads;
            return (
              <Card key={claim.id} className="border-blue-200 bg-blue-50/40">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{lead.buildings.name}</CardTitle>
                    <Badge className="bg-blue-100 text-blue-700">Active</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      {formatDate(lead.preferred_date)} at {formatTime(lead.preferred_time)}
                    </div>
                    {lead.unit_type && (
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        {lead.unit_type}
                      </div>
                    )}
                  </div>

                  {/* Client info (revealed after claiming) */}
                  <div className="rounded-lg bg-white border p-4 space-y-2">
                    <p className="font-medium text-sm">Client Details</p>
                    <p className="text-sm flex items-center gap-2">
                      <span className="text-muted-foreground">Name:</span>
                      {lead.client_name}
                    </p>
                    {lead.client_phone && (
                      <a href={`tel:${lead.client_phone}`} className="text-sm flex items-center gap-2 text-primary hover:underline">
                        <Phone className="h-3.5 w-3.5" />
                        {lead.client_phone}
                      </a>
                    )}
                    {lead.client_email && (
                      <a href={`mailto:${lead.client_email}`} className="text-sm flex items-center gap-2 text-primary hover:underline">
                        <Mail className="h-3.5 w-3.5" />
                        {lead.client_email}
                      </a>
                    )}
                    {lead.special_instructions && (
                      <div className="pt-2 border-t">
                        <p className="text-xs text-muted-foreground font-medium">Special Instructions</p>
                        <p className="text-sm mt-1">{lead.special_instructions}</p>
                      </div>
                    )}
                  </div>

                  <Button
                    className="w-full"
                    onClick={() => setDebriefLeadId(lead.id)}
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Submit Debrief
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Open Leads Feed */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">
          Open Leads
          {openLeads.length > 0 && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {openLeads.length} available
            </span>
          )}
        </h2>

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="h-36 pt-6 bg-muted/20 rounded" />
              </Card>
            ))}
          </div>
        ) : openLeads.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center space-y-3">
              <MapPin className="h-10 w-10 text-muted-foreground/40" />
              <p className="font-medium">No open leads right now</p>
              <p className="text-sm text-muted-foreground max-w-sm">
                Open leads for your certified buildings will appear here.
                Get certified for more buildings to see more leads.
              </p>
              <Button variant="outline" asChild>
                <a href="/shower/certifications">View Certifications</a>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {openLeads.map((lead) => (
              <Card key={lead.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{lead.buildings.name}</CardTitle>
                      {lead.buildings.address && (
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {lead.buildings.address}
                        </p>
                      )}
                    </div>
                    <Badge variant="secondary">{lead.unit_type || "Any"}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Clock className="h-4 w-4 text-primary" />
                    {formatDate(lead.preferred_date)} at {formatTime(lead.preferred_time)}
                  </div>

                  {/* Client info is hidden until claimed */}
                  <div className="rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                    Client info revealed after claiming
                  </div>

                  <Button
                    className="w-full"
                    disabled={claiming === lead.id || claimedLeads.length > 0}
                    onClick={() => claimLead(lead.id)}
                  >
                    {claiming === lead.id ? "Claiming..." : "Claim This Showing"}
                  </Button>
                  {claimedLeads.length > 0 && (
                    <p className="text-xs text-center text-muted-foreground">
                      Complete your active showing before claiming another
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Debrief Dialog */}
      <Dialog open={!!debriefLeadId} onOpenChange={(open) => !open && setDebriefLeadId(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Submit Showing Debrief</DialogTitle>
            <DialogDescription>
              Complete within 30 minutes of finishing the tour. Your $150 showing fee
              will be released after admin review.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {/* Did client show up? */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Did the client show up?</Label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: true, label: "Yes — toured the building", color: "border-green-500 bg-green-50" },
                  { value: false, label: "No — client no-show", color: "border-red-300 bg-red-50" },
                ].map((opt) => (
                  <button
                    key={String(opt.value)}
                    type="button"
                    onClick={() => setDebriefForm({ ...debriefForm, client_showed_up: opt.value })}
                    className={`rounded-lg border-2 p-3 text-sm text-left transition-all ${
                      debriefForm.client_showed_up === opt.value
                        ? opt.color + " font-medium"
                        : "border-muted hover:border-muted-foreground"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tour details (only shown if client showed up) */}
            {debriefForm.client_showed_up === true && (
              <>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Client Interest Level</Label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setDebriefForm({ ...debriefForm, interest_level: n })}
                        className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-medium transition-all ${
                          debriefForm.interest_level === n
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted hover:border-primary"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                    <span className="ml-2 self-center text-xs text-muted-foreground">
                      {["", "Not interested", "Lukewarm", "Interested", "Very interested", "Ready to apply"][debriefForm.interest_level]}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Likelihood to Apply</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: "already_interested", label: "Already Interested" },
                      { value: "high", label: "High" },
                      { value: "medium", label: "Medium" },
                      { value: "low", label: "Low" },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setDebriefForm({ ...debriefForm, application_likelihood: opt.value })}
                        className={`rounded-lg border p-2 text-sm transition-all ${
                          debriefForm.application_likelihood === opt.value
                            ? "border-primary bg-primary/10 font-medium"
                            : "border-muted hover:border-primary"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="units_interest" className="text-sm font-medium">
                    Units / Layouts They Responded To
                  </Label>
                  <Textarea
                    id="units_interest"
                    placeholder="e.g. 1BR on higher floors, corner units..."
                    value={debriefForm.units_of_interest}
                    onChange={(e) => setDebriefForm({ ...debriefForm, units_of_interest: e.target.value })}
                    rows={2}
                    maxLength={500}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="objections" className="text-sm font-medium">
                    Client Objections or Concerns
                    <span className="ml-1 font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <Textarea
                    id="objections"
                    placeholder="e.g. Price is a bit high, concerned about noise..."
                    value={debriefForm.client_objections}
                    onChange={(e) => setDebriefForm({ ...debriefForm, client_objections: e.target.value })}
                    rows={2}
                    maxLength={1000}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="broker_notes" className="text-sm font-medium">
                    Notes for the Broker
                  </Label>
                  <Textarea
                    id="broker_notes"
                    placeholder="Any other context the broker should know before following up..."
                    value={debriefForm.broker_notes}
                    onChange={(e) => setDebriefForm({ ...debriefForm, broker_notes: e.target.value })}
                    rows={3}
                    maxLength={1000}
                  />
                </div>
              </>
            )}

            {debriefForm.client_showed_up === false && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800 space-y-1">
                <div className="flex items-center gap-2 font-medium">
                  <AlertCircle className="h-4 w-4" />
                  No-Show Notice
                </div>
                <p>
                  Client no-shows will be recorded. The $150 showing fee will not be issued
                  for no-show appointments. A showing may be re-posted by admin.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDebriefLeadId(null)}>
              Cancel
            </Button>
            <Button
              onClick={submitDebrief}
              disabled={submittingDebrief || debriefForm.client_showed_up === null}
            >
              {submittingDebrief ? "Submitting..." : "Submit Debrief"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
