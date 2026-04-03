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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MoreHorizontal, CheckCircle, DollarSign, AlertCircle } from "lucide-react";

type LeadInfo = {
  id: string;
  status: string;
  hasDebrief: boolean;
  debriefApproved: boolean;
  clientShowedUp: boolean | null;
  leaseSigned: boolean;
  showerId: string | null;
  showerName: string | null;
};

export function LeadPipelineActions({ lead }: { lead: LeadInfo }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [dialog, setDialog] = useState<"approve" | "commission" | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [commissionForm, setCommissionForm] = useState({
    monthly_rent: "",
    attribution_pct: "100",
    notes: "",
  });
  const [error, setError] = useState<string | null>(null);

  async function approveDebrief() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/showing-leads/${lead.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin_notes: adminNotes || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to approve");
        return;
      }
      setDialog(null);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function recordCommission() {
    if (!lead.showerId) return;
    setLoading(true);
    setError(null);
    try {
      const pct = parseFloat(commissionForm.attribution_pct);
      const res = await fetch(`/api/admin/showing-leads/${lead.id}/commission`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthly_rent: parseFloat(commissionForm.monthly_rent),
          attribution: { [lead.showerId]: pct },
          notes: commissionForm.notes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to record commission");
        return;
      }
      if (data.data?.bonuses_created === false) {
        setError(`Commission saved, but placement bonuses failed to create. Please add them manually.`);
        router.refresh();
        return;
      }
      setDialog(null);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  const canApproveDebrief = lead.hasDebrief && !lead.debriefApproved && lead.clientShowedUp === true;
  const canRecordCommission = lead.status === "completed" && !lead.leaseSigned && lead.showerId;

  if (!canApproveDebrief && !canRecordCommission) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canApproveDebrief && (
            <DropdownMenuItem
              className="text-green-600"
              onClick={() => setDialog("approve")}
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              Approve Debrief ($150)
            </DropdownMenuItem>
          )}
          {canApproveDebrief && canRecordCommission && <DropdownMenuSeparator />}
          {canRecordCommission && (
            <DropdownMenuItem
              className="text-blue-600"
              onClick={() => setDialog("commission")}
            >
              <DollarSign className="mr-2 h-4 w-4" />
              Record Commission
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Approve Debrief Dialog */}
      <Dialog open={dialog === "approve"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Debrief</DialogTitle>
            <DialogDescription>
              Approving will release a $150 showing fee to {lead.showerName || "the shower"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="admin_notes">Admin Notes (optional)</Label>
            <Textarea
              id="admin_notes"
              placeholder="Any notes for this approval..."
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              rows={2}
              maxLength={500}
            />
          </div>
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" /> {error}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={approveDebrief} disabled={loading}>
              {loading ? "Approving..." : "Approve & Release $150"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Commission Dialog */}
      <Dialog open={dialog === "commission"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Commission Received</DialogTitle>
            <DialogDescription>
              Enter the monthly rent. The system will calculate the 25% placement bonus
              for {lead.showerName || "the shower"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="monthly_rent">Monthly Rent ($)</Label>
              <Input
                id="monthly_rent"
                type="number"
                placeholder="3000"
                min="1"
                step="0.01"
                value={commissionForm.monthly_rent}
                onChange={(e) => setCommissionForm({ ...commissionForm, monthly_rent: e.target.value })}
              />
              {commissionForm.monthly_rent && (
                <p className="text-xs text-muted-foreground">
                  Commission: ${(parseFloat(commissionForm.monthly_rent) / 2).toFixed(2)} ·{" "}
                  Placement bonus: ${(parseFloat(commissionForm.monthly_rent) / 2 * 0.25).toFixed(2)}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                placeholder="e.g. Commission received from building management..."
                value={commissionForm.notes}
                onChange={(e) => setCommissionForm({ ...commissionForm, notes: e.target.value })}
                rows={2}
                maxLength={500}
              />
            </div>
          </div>
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" /> {error}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button
              onClick={recordCommission}
              disabled={loading || !commissionForm.monthly_rent}
            >
              {loading ? "Recording..." : "Record & Release Bonus"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
