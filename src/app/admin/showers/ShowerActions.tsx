"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { MoreHorizontal, CheckCircle, PauseCircle, XCircle, AlertCircle } from "lucide-react";

type Action = "approve" | "suspend" | "terminate";

export function ShowerActions({
  showerId,
  currentStatus,
}: {
  showerId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [dialogAction, setDialogAction] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function executeAction(action: Action) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/showers/${showerId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: reason || undefined }),
      });
      if (res.ok) {
        setDialogAction(null);
        setReason("");
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Action failed. Please try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {currentStatus !== "approved" && (
            <DropdownMenuItem
              className="text-green-600"
              onClick={() => executeAction("approve")}
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              Approve
            </DropdownMenuItem>
          )}
          {currentStatus === "approved" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-amber-600"
                onClick={() => setDialogAction("suspend")}
              >
                <PauseCircle className="mr-2 h-4 w-4" />
                Suspend
              </DropdownMenuItem>
            </>
          )}
          {currentStatus !== "terminated" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-red-600"
                onClick={() => setDialogAction("terminate")}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Terminate
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Reason dialog for suspend/terminate */}
      <Dialog open={!!dialogAction} onOpenChange={(open) => { if (!open) { setDialogAction(null); setError(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogAction === "suspend" ? "Suspend Shower" : "Terminate Shower"}
            </DialogTitle>
            <DialogDescription>
              {dialogAction === "suspend"
                ? "The shower will be unable to claim leads until reinstated."
                : "This action is serious. The shower will lose access to the platform."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reason">Reason (required)</Label>
            <Textarea
              id="reason"
              placeholder="Explain the reason for this action..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
            />
          </div>
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogAction(null); setError(null); }}>
              Cancel
            </Button>
            <Button
              variant={dialogAction === "terminate" ? "destructive" : "default"}
              disabled={loading || !reason.trim()}
              onClick={() => dialogAction && executeAction(dialogAction)}
            >
              {loading ? "Processing..." : `Confirm ${dialogAction === "suspend" ? "Suspension" : "Termination"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
