"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Mail, Trash2, X } from "lucide-react";

interface Agent {
  user_id: string;
  full_name: string | null;
}

interface BulkActionBarProps {
  selectedCount: number;
  selectedIds: string[];
  agents: Agent[];
  onApply: (action: "status" | "assign", value: string) => void;
  onEmail: () => void;
  onDelete: () => void;
  onClear: () => void;
}

export function BulkActionBar({
  selectedCount,
  agents,
  onApply,
  onEmail,
  onDelete,
  onClear,
}: BulkActionBarProps) {
  const [bulkStatus, setBulkStatus] = useState("contacted");
  const [bulkAgent, setBulkAgent] = useState(agents[0]?.user_id || "");

  if (selectedCount === 0) return null;

  return (
    // lg:left-64 keeps the bar clear of the PortalShell sidebar on desktop.
    <div
      role="region"
      aria-label="Bulk actions"
      className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lg backdrop-blur sm:px-6 lg:left-64"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-sm font-medium">{selectedCount} selected</span>

        <Button size="sm" onClick={onEmail}>
          <Mail className="mr-1 h-3 w-3" />
          Email {selectedCount}
        </Button>

        <div className="flex items-center gap-2">
          <select
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value)}
            aria-label="New status for selected leads"
            className="h-10 rounded-md border px-2 text-base md:text-sm md:pointer-fine:h-8 bg-background"
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
              aria-label="Agent to assign to selected leads"
              className="h-10 rounded-md border px-2 text-base md:text-sm md:pointer-fine:h-8 bg-background"
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

        <Button
          size="sm"
          variant="outline"
          onClick={onDelete}
          className="border-red-500/40 text-red-300 hover:border-red-500/60 hover:bg-red-500/10"
        >
          <Trash2 className="mr-1 h-3 w-3" />
          Delete
        </Button>

        <Button size="sm" variant="ghost" onClick={onClear}>
          <X className="mr-1 h-3 w-3" />
          Clear
        </Button>
      </div>
    </div>
  );
}
