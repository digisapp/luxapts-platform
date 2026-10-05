"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Paperclip, Send, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { COMPOSE_MAX_BYTES, type ComposeState } from "@/hooks/useAdminInbox";
import { formatBytes } from "./types";

interface ComposeModalProps {
  compose: ComposeState;
  from: string;
  sending: boolean;
  onField: (_field: "to" | "subject" | "bodyText", _value: string) => void;
  onSend: () => void;
  onClose: () => void;
  onDiscard: () => void;
  onAddFiles: (_files: FileList | File[]) => void;
  onRemoveFile: (_index: number) => void;
}

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.gif,.webp,.heic,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt";

export function ComposeModal({ compose, from, sending, onField, onSend, onClose, onDiscard, onAddFiles, onRemoveFile }: ComposeModalProps) {
  const [showQuoted, setShowQuoted] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const isReply = !!compose.replyToEmailId;
  const canSend = !!(compose.to.trim() && compose.subject.trim() && compose.bodyText.trim()) && !sending;
  const files = compose.attachments ?? [];
  const totalBytes = files.reduce((n, f) => n + f.size, 0);

  // A reply opens greeted and signed ("Hi Chris, … Best, Stacy"): put the
  // caret on the empty line between, ready to type.
  useEffect(() => {
    if (!compose.open || !isReply) return;
    const t = setTimeout(() => {
      const el = bodyRef.current;
      if (!el) return;
      const gap = el.value.indexOf("\n\n");
      const at = gap >= 0 && /\n\nBest,\nStacy$/.test(el.value) ? gap + 2 : el.value.length;
      el.focus();
      el.setSelectionRange(at, at);
    }, 0);
    return () => clearTimeout(t);
    // Only when the window opens for a new reply, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compose.open, compose.replyToEmailId]);

  return (
    <Dialog open={compose.open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{isReply ? "Reply" : "New email"}</DialogTitle>
          <DialogDescription>
            From <span className="font-medium text-foreground">{from}</span>. Replies come back to this inbox.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSend) onSend();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="compose-to">To</Label>
            <Input
              id="compose-to"
              type="email"
              autoComplete="off"
              value={compose.to}
              onChange={(e) => onField("to", e.target.value)}
              placeholder="name@example.com"
              readOnly={isReply}
              className={isReply ? "opacity-70" : ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="compose-subject">Subject</Label>
            <Input id="compose-subject" value={compose.subject} onChange={(e) => onField("subject", e.target.value)} placeholder="Subject" maxLength={200} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="compose-body">Message</Label>
            <Textarea
              id="compose-body"
              ref={bodyRef}
              value={compose.bodyText}
              onChange={(e) => onField("bodyText", e.target.value)}
              placeholder="Write your message…"
              rows={10}
              // 16px on phones: iOS Safari zooms into any field smaller than that.
              className="min-h-[160px] resize-y text-base leading-relaxed sm:text-[15px]"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canSend) {
                  e.preventDefault();
                  onSend();
                }
              }}
            />
            <p className="text-xs text-muted-foreground">Sent as plain paragraphs, line breaks kept. ⌘/Ctrl+Enter sends.</p>
          </div>

          <div className="space-y-2">
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => {
                if (e.target.files) onAddFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
                <Paperclip className="h-3.5 w-3.5" /> Attach files
              </Button>
              <span className="text-xs text-muted-foreground">
                {files.length > 0
                  ? `${formatBytes(totalBytes)} of ${formatBytes(COMPOSE_MAX_BYTES)}`
                  : "Floor plans, photos, PDFs. Up to 3 MB in total."}
              </span>
            </div>
            {files.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {files.map((f, i) => (
                  <li key={`${f.filename}-${i}`} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] py-1 pl-2.5 pr-1 text-xs text-foreground/90">
                    <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="max-w-[200px] truncate">{f.filename}</span>
                    <span className="text-muted-foreground">{formatBytes(f.size)}</span>
                    <button type="button" onClick={() => onRemoveFile(i)} className="rounded p-1 text-muted-foreground hover:text-foreground" aria-label={`Remove ${f.filename}`}>
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {compose.quotedText && (
            <div>
              <button
                type="button"
                onClick={() => setShowQuoted((v) => !v)}
                className="mb-1.5 flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {showQuoted ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {showQuoted ? "Hide" : "Show"} quoted message
              </button>
              {showQuoted && (
                <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 font-sans text-xs leading-relaxed text-muted-foreground">
                  {compose.quotedText}
                </pre>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-1">
            <button type="button" onClick={onDiscard} className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-red-300">
              <X className="h-4 w-4" /> Discard
            </button>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Close</Button>
              <Button type="submit" disabled={!canSend}>
                <Send className="h-4 w-4" /> {sending ? "Sending…" : "Send"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
