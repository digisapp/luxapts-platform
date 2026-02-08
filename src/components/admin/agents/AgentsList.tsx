"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export interface AgentData {
  user_id: string;
  full_name: string | null;
  phone: string | null;
  city_name: string | null;
  status: "active" | "paused";
  commission_rate: number | null;
  assigned_count: number;
  converted_count: number;
}

interface AgentsListProps {
  agents: AgentData[];
}

export function AgentsList({ agents: initialAgents }: AgentsListProps) {
  const [agents, setAgents] = useState(initialAgents);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const totalAgents = agents.length;
  const activeAgents = agents.filter((a) => a.status === "active").length;
  const pausedAgents = agents.filter((a) => a.status === "paused").length;

  async function toggleStatus(agentId: string, currentStatus: string) {
    const newStatus = currentStatus === "active" ? "paused" : "active";
    setTogglingId(agentId);

    try {
      const res = await fetch(`/api/admin/agents/${agentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.ok) {
        setAgents((prev) =>
          prev.map((a) =>
            a.user_id === agentId
              ? { ...a, status: newStatus as "active" | "paused" }
              : a
          )
        );
      }
    } catch {
      // Silently fail — toggle stays at old state
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{totalAgents}</p>
            <p className="text-xs text-muted-foreground">Total Agents</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-400">{activeAgents}</p>
            <p className="text-xs text-muted-foreground">Active</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-muted-foreground">{pausedAgents}</p>
            <p className="text-xs text-muted-foreground">Paused</p>
          </CardContent>
        </Card>
      </div>

      {/* Agent Cards */}
      {agents.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">No agents registered yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {agents.map((agent) => (
            <Card key={agent.user_id}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-4">
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold",
                      agent.status === "active"
                        ? "bg-green-500/20 text-green-400"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {(agent.full_name || "?")[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium">
                      {agent.full_name || "Unnamed Agent"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {agent.phone || "No phone"}{" "}
                      {agent.city_name && `\u00B7 ${agent.city_name}`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  {/* Stats */}
                  <div className="hidden text-right sm:block">
                    <p className="text-sm">
                      <span className="font-medium">{agent.assigned_count}</span>{" "}
                      <span className="text-muted-foreground">assigned</span>
                    </p>
                    <p className="text-sm">
                      <span className="font-medium">{agent.converted_count}</span>{" "}
                      <span className="text-muted-foreground">converted</span>
                    </p>
                  </div>

                  {/* Commission */}
                  {agent.commission_rate !== null && (
                    <Badge variant="outline" className="hidden md:inline-flex">
                      {agent.commission_rate}%
                    </Badge>
                  )}

                  {/* Status Badge */}
                  <Badge
                    variant={agent.status === "active" ? "success" : "secondary"}
                  >
                    {agent.status}
                  </Badge>

                  {/* Toggle */}
                  <Switch
                    checked={agent.status === "active"}
                    disabled={togglingId === agent.user_id}
                    onCheckedChange={() =>
                      toggleStatus(agent.user_id, agent.status)
                    }
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
