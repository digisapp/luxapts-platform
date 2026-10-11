"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { senderIdentityFor } from "@/lib/microsites";
import { firstNameOf } from "@/lib/email/names";
import { sourceLabel } from "./lead-format";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SendEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  leadName: string | null;
  leadEmail: string | null;
  sourceDetail?: string | null;
}

export function SendEmailDialog({
  open,
  onOpenChange,
  leadId,
  leadName,
  leadEmail,
  sourceDetail,
}: SendEmailDialogProps) {
  // Mirrors what the server will actually put in the From header, so the
  // sender is visible before hitting send rather than a surprise afterwards.
  const sender = senderIdentityFor(sourceDetail, "Staycio <hello@staycio.com>");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  // Sent, but the automatic note queued for them could not be pulled back.
  const [warning, setWarning] = useState<string | null>(null);
  const first = firstNameOf(leadName);

  async function handleSend() {
    if (!subject.trim() || !body.trim()) return;
    setSending(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/leads/${leadId}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to send");
      }

      setSuccess(true);
      setSubject("");
      setBody("");
      if (typeof data.warning === "string" && data.warning) {
        // Left open so the warning is read; closing resets it.
        setWarning(data.warning);
        return;
      }
      setTimeout(() => {
        onOpenChange(false);
        setSuccess(false);
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send email");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setSuccess(false);
          setWarning(null);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send Email</DialogTitle>
          <DialogDescription>
            To: {leadName || "Lead"} ({leadEmail})
            <span className="mt-1 block text-xs">
              From: <span className="font-medium text-foreground">{sender.from}</span>
              {sourceDetail && (
                // "phone:<number>" is Stacy's phone line, not a website.
                <span className="text-muted-foreground">
                  {sourceDetail.startsWith("phone:")
                    ? ` — lead from a ${sourceLabel("voice", sourceDetail).toLowerCase()}`
                    : ` — they signed up on ${sourceDetail}`}
                </span>
              )}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="email-subject">Subject</Label>
            <Input
              id="email-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Follow up on your apartment search"
            />
          </div>

          <div>
            <Label htmlFor="email-body">Message</Label>
            <Textarea
              id="email-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your message..."
              rows={6}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {first ? `Starts with “Hi ${first},” automatically. ` : ""}Plain text, line breaks kept. It shows in
              the inbox&apos;s Sent folder and their reply lands in the same conversation.
            </p>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
          {success && <p className="text-sm text-green-400">Email sent successfully!</p>}
          {warning && <p className="text-sm text-amber-300">{warning}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSend}
              disabled={sending || !subject.trim() || !body.trim()}
            >
              {sending ? "Sending..." : "Send Email"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
