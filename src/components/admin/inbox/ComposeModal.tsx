"use client";

import { useState, useEffect } from "react";
import DOMPurify from "isomorphic-dompurify";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2 } from "lucide-react";

interface ComposeModalProps {
  open: boolean;
  onClose: () => void;
  onSent: () => void;
  replyTo?: {
    threadId: string;
    to: string;
    subject: string;
    leadId?: string;
    quotedHtml?: string;
  };
}

export function ComposeModal({ open, onClose, onSent, replyTo }: ComposeModalProps) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset fields when modal opens with new data
  useEffect(() => {
    if (open) {
      setTo(replyTo?.to || "");
      setSubject(
        replyTo?.subject
          ? replyTo.subject.startsWith("Re:")
            ? replyTo.subject
            : `Re: ${replyTo.subject}`
          : ""
      );
      setBody("");
      setError(null);
    }
  }, [open, replyTo]);

  async function handleSend() {
    if (!to || !subject || !body) {
      setError("All fields are required");
      return;
    }

    setSending(true);
    setError(null);

    // Build HTML with quoted original if replying
    let fullHtml = body.replace(/\n/g, "<br>");
    if (replyTo?.quotedHtml) {
      fullHtml += `
        <br><br>
        <div style="border-left: 2px solid #ccc; padding-left: 12px; margin-top: 16px; color: #666;">
          ${replyTo.quotedHtml}
        </div>
      `;
    }

    try {
      const res = await fetch("/api/admin/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          subject,
          bodyHtml: fullHtml,
          threadId: replyTo?.threadId,
          leadId: replyTo?.leadId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send");
      }

      onSent();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send email");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{replyTo ? "Reply" : "Compose Email"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="to">To</Label>
            <Input
              id="to"
              type="email"
              placeholder="recipient@example.com"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              disabled={!!replyTo}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              placeholder="Email subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="body">Message</Label>
            <Textarea
              id="body"
              placeholder="Write your message..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              className="resize-none"
            />
          </div>

          {/* Quoted original preview */}
          {replyTo?.quotedHtml && (
            <div className="rounded border border-border/50 bg-muted/30 p-3 max-h-32 overflow-y-auto">
              <p className="text-xs text-muted-foreground mb-1 font-medium">Quoted original:</p>
              <div
                className="text-xs text-muted-foreground prose prose-sm prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(replyTo.quotedHtml) }}
              />
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={sending}>
              Cancel
            </Button>
            <Button onClick={handleSend} disabled={sending}>
              {sending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Send
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
