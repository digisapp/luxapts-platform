"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { Eye, Mail, Phone, Send } from "lucide-react";

export interface LeadRowData {
  id: string;
  created_at: string;
  status: string;
  name: string | null;
  user_email: string | null;
  user_phone: string | null;
  budget_min: number | null;
  budget_max: number | null;
  beds: number | null;
  move_in_date: string | null;
  source: string;
  notes: string | null;
  cities: { name: string; slug: string } | { name: string; slug: string }[] | null;
}

const statusColors: Record<string, string> = {
  new: "bg-green-100 text-green-800",
  contacted: "bg-blue-100 text-blue-800",
  touring: "bg-purple-100 text-purple-800",
  applied: "bg-yellow-100 text-yellow-800",
  leased: "bg-emerald-100 text-emerald-800",
  lost: "bg-gray-100 text-gray-800",
};

const sourceLabels: Record<string, string> = {
  web_form: "Web Form",
  chat: "Chat",
  voice: "Voice",
};

interface LeadRowProps {
  lead: LeadRowData;
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onStatusChange: (id: string, status: string) => void;
  onEmail: (lead: LeadRowData) => void;
}

export function LeadRow({ lead, selected, onSelect, onStatusChange, onEmail }: LeadRowProps) {
  const city = Array.isArray(lead.cities) ? lead.cities[0] : lead.cities;

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border p-4 hover:bg-muted/50 transition-colors">
      <input
        type="checkbox"
        checked={selected}
        onChange={(e) => onSelect(lead.id, e.target.checked)}
        className="h-4 w-4 rounded border-gray-300"
      />

      <div className="flex-1 min-w-[200px]">
        <div className="flex items-center gap-2">
          <p className="font-medium">{lead.name || "Unnamed Lead"}</p>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[lead.status] || statusColors.new}`}
          >
            {lead.status}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          {lead.user_email && (
            <span className="flex items-center gap-1">
              <Mail className="h-3 w-3" />
              {lead.user_email}
            </span>
          )}
          {lead.user_phone && (
            <span className="flex items-center gap-1">
              <Phone className="h-3 w-3" />
              {lead.user_phone}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {city?.name && <Badge variant="outline">{city.name}</Badge>}
        <Badge variant="secondary">{sourceLabels[lead.source] || lead.source}</Badge>
      </div>

      <div className="flex items-center gap-1">
        <select
          value={lead.status}
          onChange={(e) => onStatusChange(lead.id, e.target.value)}
          className="rounded-md border px-2 py-1 text-xs bg-background"
        >
          <option value="new">New</option>
          <option value="contacted">Contacted</option>
          <option value="touring">Touring</option>
          <option value="applied">Applied</option>
          <option value="leased">Leased</option>
          <option value="lost">Lost</option>
        </select>

        {lead.user_email && (
          <Button size="sm" variant="ghost" onClick={() => onEmail(lead)} title="Send email">
            <Send className="h-3 w-3" />
          </Button>
        )}

        <Button size="sm" variant="outline" asChild>
          <Link href={`/admin/leads/${lead.id}`}>
            <Eye className="mr-1 h-3 w-3" />
            View
          </Link>
        </Button>
      </div>

      <span className="text-xs text-muted-foreground">{formatDate(lead.created_at)}</span>
    </div>
  );
}
