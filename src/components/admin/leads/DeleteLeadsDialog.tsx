"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Trash2 } from "lucide-react";

interface DeleteLeadsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadIds: string[];
  /** Shown when deleting a single lead, so the confirm names who goes. */
  leadName?: string | null;
  onDeleted: (deletedCount: number) => void;
}

export function DeleteLeadsDialog({
  open,
  onOpenChange,
  leadIds,
  leadName,
  onDeleted,
}: DeleteLeadsDialogProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const count = leadIds.length;
  const subject =
    count === 1 ? (leadName ? `“${leadName}”` : "this lead") : `these ${count} leads`;

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/leads/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_ids: leadIds, action: "delete" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `Could not delete (${res.status}).`);
        return;
      }
      onOpenChange(false);
      onDeleted(typeof data.deleted === "number" ? data.deleted : count);
    } catch {
      setError("Could not reach the server. Check your connection and retry.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (deleting) return;
        if (!next) setError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Delete {count === 1 ? "lead" : `${count} leads`}?
          </DialogTitle>
          <DialogDescription>
            This permanently deletes {subject} along with notes, history and
            agent assignments. It cannot be undone. Emails already exchanged
            stay in the inbox.
          </DialogDescription>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          For a real renter who stopped responding, set the status to{" "}
          <span className="font-medium text-foreground">Lost</span> instead so
          the record is kept.
        </p>

        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleting || count === 0}>
            <Trash2 className="h-4 w-4" />
            {deleting ? "Deleting..." : count === 1 ? "Delete lead" : `Delete ${count} leads`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
