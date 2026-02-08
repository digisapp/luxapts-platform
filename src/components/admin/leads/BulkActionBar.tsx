"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface Agent {
  user_id: string;
  full_name: string | null;
}

interface BulkActionBarProps {
  selectedCount: number;
  selectedIds: string[];
  agents: Agent[];
  onApply: (action: "status" | "assign", value: string) => void;
  onClear: () => void;
}

export function BulkActionBar({ selectedCount, selectedIds, agents, onApply, onClear }: BulkActionBarProps) {
  const [bulkStatus, setBulkStatus] = useState("contacted");
  const [bulkAgent, setBulkAgent] = useState(agents[0]?.user_id || "");

  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur px-6 py-3 shadow-lg">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4">
        <span className="text-sm font-medium">{selectedCount} selected</span>

        <div className="flex items-center gap-2">
          <select
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value)}
            className="rounded-md border px-2 py-1.5 text-sm bg-background"
          >
            <option value="new">New</option>
            <option value="contacted">Contacted</option>
            <option value="touring">Touring</option>
            <option value="applied">Applied</option>
            <option value="leased">Leased</option>
            <option value="lost">Lost</option>
          </select>
          <Button size="sm" onClick={() => onApply("status", bulkStatus)}>
            Update Status
          </Button>
        </div>

        {agents.length > 0 && (
          <div className="flex items-center gap-2">
            <select
              value={bulkAgent}
              onChange={(e) => setBulkAgent(e.target.value)}
              className="rounded-md border px-2 py-1.5 text-sm bg-background"
            >
              {agents.map((a) => (
                <option key={a.user_id} value={a.user_id}>
                  {a.full_name || a.user_id}
                </option>
              ))}
            </select>
            <Button size="sm" onClick={() => onApply("assign", bulkAgent)}>
              Assign Agent
            </Button>
          </div>
        )}

        <Button size="sm" variant="ghost" onClick={onClear}>
          <X className="mr-1 h-3 w-3" />
          Clear
        </Button>
      </div>
    </div>
  );
}
