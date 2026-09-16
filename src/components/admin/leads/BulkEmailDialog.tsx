"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface BulkEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadIds: string[];
  onSent?: () => void;
}

type Preview = {
  recipients: number;
  skipped_no_email: number;
  senders: { from: string; count: number }[];
  sample: { to: string; from: string; subject: string; body: string } | null;
};

export function BulkEmailDialog({ open, onOpenChange, leadIds, onSent }: BulkEmailDialogProps) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null);

  function reset() {
    setSubject("");
    setBody("");
    setPreview(null);
    setError(null);
    setResult(null);
  }

  async function call(dryRun: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/leads/bulk-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_ids: leadIds, subject, body, dry_run: dryRun }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      if (dryRun) setPreview(data as Preview);
      else {
        setResult({ sent: data.sent, failed: data.failed });
        onSent?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Email {leadIds.length} leads</DialogTitle>
          <DialogDescription>
            Each person gets their own email, addressed to them alone and sent from the building
            they signed up on. Use <code>{"{{name}}"}</code> for their first name and{" "}
            <code>{"{{building}}"}</code> for the building.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-2 py-4">
            <p className="text-lg font-semibold">Sent to {result.sent} leads.</p>
            {result.failed > 0 && (
              <p className="text-sm text-amber-700">{result.failed} failed to send.</p>
            )}
            <p className="text-sm text-muted-foreground">
              Those leads moved from New to Contacted.
            </p>
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label htmlFor="bulk-subject">Subject</Label>
              <Input
                id="bulk-subject"
                value={subject}
                onChange={(e) => {
                  setSubject(e.target.value);
                  setPreview(null);
                }}
                placeholder="Downtown 6 pricing is out"
              />
            </div>
            <div>
              <Label htmlFor="bulk-body">Message</Label>
              <Textarea
                id="bulk-body"
                rows={9}
                value={body}
                onChange={(e) => {
                  setBody(e.target.value);
                  setPreview(null);
                }}
                placeholder={"You joined the {{building}} list a few weeks ago…"}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Basic HTML is allowed. Line breaks need &lt;br&gt; or &lt;p&gt; tags.
              </p>
            </div>

            {preview && (
              <div className="rounded-lg border bg-muted/40 p-4 text-sm">
                <p className="font-medium">
                  {preview.recipients} will receive this
                  {preview.skipped_no_email > 0 &&
                    ` · ${preview.skipped_no_email} skipped with no email address`}
                </p>
                <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  {preview.senders.map((s) => (
                    <li key={s.from}>
                      {s.count} from <span className="font-medium">{s.from}</span>
                    </li>
                  ))}
                </ul>
                {preview.sample && (
                  <div className="mt-3 rounded border bg-background p-3">
                    <p className="text-xs text-muted-foreground">
                      Example — what {preview.sample.to} will see:
                    </p>
                    <p className="mt-1 text-xs">
                      <span className="text-muted-foreground">From:</span> {preview.sample.from}
                    </p>
                    <p className="text-xs">
                      <span className="text-muted-foreground">Subject:</span>{" "}
                      {preview.sample.subject}
                    </p>
                    <div
                      className="mt-2 border-t pt-2 text-xs"
                      dangerouslySetInnerHTML={{ __html: preview.sample.body }}
                    />
                  </div>
                )}
              </div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                Cancel
              </Button>
              {/* Preview first — a send cannot be taken back. */}
              <Button
                variant="secondary"
                onClick={() => call(true)}
                disabled={busy || !subject.trim() || !body.trim()}
              >
                {busy && !preview ? "Checking…" : "Preview"}
              </Button>
              <Button onClick={() => call(false)} disabled={busy || !preview}>
                {busy ? "Sending…" : `Send to ${preview?.recipients ?? leadIds.length}`}
              </Button>
            </div>
            {!preview && (
              <p className="text-right text-xs text-muted-foreground">
                Preview before the send button unlocks.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
