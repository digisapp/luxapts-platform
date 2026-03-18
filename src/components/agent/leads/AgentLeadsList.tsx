"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import {
  Mail, Phone, Calendar, DollarSign, Bed,
  CheckCircle, XCircle, Clock, Filter,
} from "lucide-react";

interface LeadData {
  id: string;
  name: string | null;
  user_email: string | null;
  user_phone: string | null;
  status: string;
  budget_min: number | null;
  budget_max: number | null;
  beds: number | null;
  move_in_date: string | null;
  source: string;
  created_at: string;
  notes: string | null;
  cities: { name: string; slug: string } | { name: string; slug: string }[] | null;
}

interface Assignment {
  id: string;
  status: string;
  assigned_at: string;
  leads: LeadData | LeadData[] | null;
}

interface AgentLeadsListProps {
  assignments: Assignment[];
}

const statusColors: Record<string, string> = {
  new: "bg-green-100 text-green-800",
  contacted: "bg-blue-100 text-blue-800",
  touring: "bg-purple-100 text-purple-800",
  applied: "bg-yellow-100 text-yellow-800",
  leased: "bg-emerald-100 text-emerald-800",
  lost: "bg-gray-100 text-gray-800",
};

const assignmentStatusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  assigned: { label: "Pending", variant: "secondary" },
  accepted: { label: "Accepted", variant: "default" },
  declined: { label: "Declined", variant: "destructive" },
  reassigned: { label: "Reassigned", variant: "outline" },
};

type FilterType = "all" | "pending" | "active" | "closed";

export function AgentLeadsList({ assignments }: AgentLeadsListProps) {
  const [filter, setFilter] = useState<FilterType>("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [localAssignments, setLocalAssignments] = useState(assignments);

  const filtered = localAssignments.filter((a) => {
    const lead = (Array.isArray(a.leads) ? a.leads[0] : a.leads) as LeadData | null;
    if (!lead) return false;

    switch (filter) {
      case "pending":
        return a.status === "assigned";
      case "active":
        return a.status === "accepted" && !["leased", "lost"].includes(lead.status);
      case "closed":
        return ["leased", "lost"].includes(lead.status);
      default:
        return true;
    }
  });

  const counts = {
    all: localAssignments.length,
    pending: localAssignments.filter((a) => a.status === "assigned").length,
    active: localAssignments.filter((a) => {
      const lead = (Array.isArray(a.leads) ? a.leads[0] : a.leads) as LeadData | null;
      return a.status === "accepted" && lead && !["leased", "lost"].includes(lead.status);
    }).length,
    closed: localAssignments.filter((a) => {
      const lead = (Array.isArray(a.leads) ? a.leads[0] : a.leads) as LeadData | null;
      return lead && ["leased", "lost"].includes(lead.status);
    }).length,
  };

  async function handleAssignmentAction(assignmentId: string, action: "accepted" | "declined") {
    setUpdatingId(assignmentId);
    try {
      const res = await fetch(`/api/agent/assignments/${assignmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: action }),
      });

      if (res.ok) {
        setLocalAssignments((prev) =>
          prev.map((a) =>
            a.id === assignmentId ? { ...a, status: action } : a
          )
        );
      }
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Filter Tabs */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        {(["all", "pending", "active", "closed"] as FilterType[]).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f]})
          </Button>
        ))}
      </div>

      {/* Leads List */}
      {filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map((assignment) => {
            const lead = (Array.isArray(assignment.leads) ? assignment.leads[0] : assignment.leads) as LeadData | null;
            if (!lead) return null;

            const city = Array.isArray(lead.cities) ? lead.cities[0] : lead.cities;
            const aConfig = assignmentStatusConfig[assignment.status] || assignmentStatusConfig.assigned;

            return (
              <Card key={assignment.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-4">
                    <Link
                      href={`/agent/leads/${lead.id}`}
                      className="flex-1 min-w-0"
                    >
                      <div className="flex items-center gap-3">
                        <p className="text-lg font-medium truncate">
                          {lead.name || "Unnamed Lead"}
                        </p>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[lead.status] || "bg-gray-100 text-gray-800"}`}>
                          {lead.status}
                        </span>
                        <Badge variant={aConfig.variant}>{aConfig.label}</Badge>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                        {city && <span>{city.name}</span>}
                        {lead.beds !== null && (
                          <span className="flex items-center gap-1">
                            <Bed className="h-3.5 w-3.5" />
                            {lead.beds === 0 ? "Studio" : `${lead.beds} bed`}
                          </span>
                        )}
                        {(lead.budget_min || lead.budget_max) && (
                          <span className="flex items-center gap-1">
                            <DollarSign className="h-3.5 w-3.5" />
                            {lead.budget_min ? `$${lead.budget_min.toLocaleString()}` : "$0"} - {lead.budget_max ? `$${lead.budget_max.toLocaleString()}` : "No max"}
                          </span>
                        )}
                        {lead.move_in_date && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {formatDate(lead.move_in_date)}
                          </span>
                        )}
                      </div>

                      <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
                        {lead.user_email && (
                          <span className="flex items-center gap-1">
                            <Mail className="h-3.5 w-3.5" />
                            {lead.user_email}
                          </span>
                        )}
                        {lead.user_phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3.5 w-3.5" />
                            {lead.user_phone}
                          </span>
                        )}
                      </div>

                      <p className="mt-1 text-xs text-muted-foreground">
                        Assigned {formatDate(assignment.assigned_at)} · Source: {lead.source}
                      </p>
                    </Link>

                    {/* Accept/Decline for pending assignments */}
                    {assignment.status === "assigned" && (
                      <div className="flex shrink-0 gap-2">
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.preventDefault();
                            handleAssignmentAction(assignment.id, "accepted");
                          }}
                          disabled={updatingId === assignment.id}
                        >
                          <CheckCircle className="mr-1 h-4 w-4" />
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.preventDefault();
                            handleAssignmentAction(assignment.id, "declined");
                          }}
                          disabled={updatingId === assignment.id}
                        >
                          <XCircle className="mr-1 h-4 w-4" />
                          Decline
                        </Button>
                      </div>
                    )}

                    {assignment.status === "accepted" && (
                      <Badge variant="outline" className="shrink-0">
                        <Clock className="mr-1 h-3 w-3" />
                        Working
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              {filter === "all"
                ? "No leads assigned yet. Check back soon."
                : `No ${filter} leads found.`}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
