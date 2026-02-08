"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Send, AlertCircle } from "lucide-react";
import { CampaignHistory } from "./CampaignHistory";

interface City {
  id: string;
  name: string;
}

interface Campaign {
  id: string;
  subject: string;
  recipients_count: number;
  sent_at: string;
}

interface EmailCampaignsDashboardProps {
  initialCampaigns: Campaign[];
  cities: City[];
  totalLeadsWithEmail: number;
}

export function EmailCampaignsDashboard({
  initialCampaigns,
  cities,
  totalLeadsWithEmail,
}: EmailCampaignsDashboardProps) {
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [filterCity, setFilterCity] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estimatedCount, setEstimatedCount] = useState(totalLeadsWithEmail);
  const [showConfirm, setShowConfirm] = useState(false);

  // Update estimated count when filters change
  useEffect(() => {
    async function fetchEstimate() {
      try {
        const params = new URLSearchParams();
        if (filterStatus) params.set("status", filterStatus);
        if (filterSource) params.set("source", filterSource);
        params.set("limit", "1");

        const res = await fetch(`/api/leads?${params}`);
        const data = await res.json();
        // This is an approximation — the total from the API response
        setEstimatedCount(data.total || 0);
      } catch {
        // Fallback to total
      }
    }

    if (filterStatus || filterSource) {
      fetchEstimate();
    } else {
      setEstimatedCount(totalLeadsWithEmail);
    }
  }, [filterStatus, filterSource, totalLeadsWithEmail]);

  async function handleSend() {
    if (!subject.trim() || !bodyHtml.trim()) return;
    setSending(true);
    setError(null);

    try {
      const filter: Record<string, string> = {};
      if (filterStatus) filter.status = filterStatus;
      if (filterSource) filter.source = filterSource;
      if (filterCity) filter.city_id = filterCity;

      const res = await fetch("/api/admin/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body_html: bodyHtml, filter }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send");
      }

      const data = await res.json();

      // Add to campaigns list
      setCampaigns((prev) => [
        {
          id: data.campaign_id || crypto.randomUUID(),
          subject,
          recipients_count: data.recipients_count,
          sent_at: new Date().toISOString(),
        },
        ...prev,
      ]);

      // Reset form
      setSubject("");
      setBodyHtml("");
      setFilterStatus("");
      setFilterSource("");
      setFilterCity("");
      setShowConfirm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send campaign");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Compose Section */}
      <Card>
        <CardHeader>
          <CardTitle>Compose Campaign</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="campaign-subject">Subject</Label>
            <Input
              id="campaign-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="New luxury listings available..."
            />
          </div>

          <div>
            <Label htmlFor="campaign-body">Email Body (HTML)</Label>
            <Textarea
              id="campaign-body"
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              placeholder="<p>We have exciting new listings...</p>"
              rows={8}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label>Filter by Status</Label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm bg-background"
              >
                <option value="">All Statuses</option>
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="touring">Touring</option>
                <option value="applied">Applied</option>
                <option value="leased">Leased</option>
                <option value="lost">Lost</option>
              </select>
            </div>

            <div>
              <Label>Filter by Source</Label>
              <select
                value={filterSource}
                onChange={(e) => setFilterSource(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm bg-background"
              >
                <option value="">All Sources</option>
                <option value="web_form">Web Form</option>
                <option value="chat">Chat</option>
                <option value="voice">Voice</option>
              </select>
            </div>

            <div>
              <Label>Filter by City</Label>
              <select
                value={filterCity}
                onChange={(e) => setFilterCity(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm bg-background"
              >
                <option value="">All Cities</option>
                {cities.map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border bg-muted/50 p-4">
            <div className="flex items-center gap-2">
              <Badge variant="outline">{estimatedCount} estimated recipients</Badge>
              <span className="text-sm text-muted-foreground">(leads with email addresses)</span>
            </div>

            {!showConfirm ? (
              <Button
                onClick={() => setShowConfirm(true)}
                disabled={!subject.trim() || !bodyHtml.trim() || estimatedCount === 0}
              >
                <Send className="mr-2 h-4 w-4" />
                Send Campaign
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 text-sm text-amber-600">
                  <AlertCircle className="h-4 w-4" />
                  Send to {estimatedCount} recipients?
                </div>
                <Button size="sm" variant="outline" onClick={() => setShowConfirm(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSend} disabled={sending}>
                  {sending ? "Sending..." : "Confirm Send"}
                </Button>
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </CardContent>
      </Card>

      {/* Campaign History */}
      <Card>
        <CardHeader>
          <CardTitle>Campaign History</CardTitle>
        </CardHeader>
        <CardContent>
          <CampaignHistory campaigns={campaigns} />
        </CardContent>
      </Card>
    </div>
  );
}
