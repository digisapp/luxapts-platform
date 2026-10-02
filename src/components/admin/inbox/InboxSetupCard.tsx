"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, RefreshCw, Send, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ToneBadge } from "./ToneBadge";
import type { InboxStatus } from "./types";

interface Props {
  status: InboxStatus;
  loading: boolean;
  onRecheck: () => void;
  onSendTest: () => void;
  sendingTest: boolean;
}

function RecordStatus({ s }: { s: string }) {
  if (s === "verified") return <ToneBadge tone="green">Verified</ToneBadge>;
  if (s === "pending") return <ToneBadge tone="amber">Pending</ToneBadge>;
  return <ToneBadge tone="red">{s === "missing" ? "Missing" : s === "not_started" ? "Not added" : "Failed"}</ToneBadge>;
}

function CopyValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard
          ?.writeText(value)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          })
          .catch(() => {});
      }}
      title="Copy"
      className="group inline-flex max-w-full items-center gap-1 text-left font-mono text-xs text-foreground/90 hover:text-violet-200"
    >
      <span className="break-all">{value}</span>
      <Copy className={cn("h-3 w-3 shrink-0", copied ? "text-emerald-400" : "text-muted-foreground/50 group-hover:text-violet-300")} />
    </button>
  );
}

/**
 * Shown while mail can't reach the inbox. Lists what is missing in fix
 * order plus the exact DNS records Resend wants, so the admin can finish
 * the setup at the registrar without opening Resend.
 */
export function InboxSetupCard({ status, loading, onRecheck, onSendTest, sendingTest }: Props) {
  const [open, setOpen] = useState(true);
  const sendingWorks = status.env.resendApiKey;

  if (status.ready) {
    return (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2.5">
        <p className="flex items-center gap-2 text-sm text-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>
            Receiving is on for <span className="font-mono">{status.inboundDomain}</span>. Replies go out as {status.from}.
          </span>
        </p>
        <Button size="sm" variant="outline" onClick={onSendTest} disabled={sendingTest}>
          <Send className="h-3.5 w-3.5" /> {sendingTest ? "Sending…" : "Send me a test"}
        </Button>
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <span className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <span>
            <span className="block text-sm font-semibold text-amber-100">This inbox can&apos;t receive mail yet</span>
            <span className="block text-xs text-amber-200/80">
              {sendingWorks ? "Sending works; incoming" : "Incoming"} mail to <span className="font-mono">{status.inboundAddress}</span> has nowhere to land until
              the steps below are done.
            </span>
          </span>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-amber-300 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="space-y-4 border-t border-amber-500/20 px-4 py-4">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-amber-100">
            {status.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ol>

          {status.domain.found && status.domain.records.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-200">DNS records for staycio.com (at GoDaddy — Host is relative to staycio.com)</p>
              <div className="overflow-x-auto rounded-xl border border-white/10 bg-background/60">
                <table className="w-full text-left text-xs">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Purpose</th>
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 font-medium">Host</th>
                      <th className="px-3 py-2 font-medium">Value</th>
                      <th className="px-3 py-2 font-medium">Priority</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {status.domain.records.map((r) => (
                      <tr key={`${r.record}-${r.type}-${r.host}`} className="align-top">
                        <td className="px-3 py-2 text-foreground/90">{r.record}</td>
                        <td className="px-3 py-2 font-mono text-foreground/90">{r.type}</td>
                        <td className="px-3 py-2"><CopyValue value={r.host} /></td>
                        <td className="max-w-[360px] px-3 py-2"><CopyValue value={r.value} /></td>
                        <td className="px-3 py-2 font-mono text-foreground/90">{r.priority ?? "—"}</td>
                        <td className="px-3 py-2"><RecordStatus s={r.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
            <div className="rounded-lg border border-white/10 bg-background/60 px-3 py-2">
              <dt className="text-muted-foreground">Resend domain</dt>
              <dd className="mt-0.5 flex flex-wrap items-center gap-1.5 text-foreground/90">
                <span className="font-mono">{status.inboundDomain}</span>
                {status.domain.found ? (
                  <>
                    <RecordStatus s={status.domain.status ?? "failed"} />
                    <ToneBadge tone={status.domain.receiving === "enabled" ? "green" : "red"}>receiving {status.domain.receiving ?? "off"}</ToneBadge>
                  </>
                ) : (
                  <ToneBadge tone="red">Not in Resend</ToneBadge>
                )}
              </dd>
            </div>
            <div className="rounded-lg border border-white/10 bg-background/60 px-3 py-2">
              <dt className="text-muted-foreground">Resend webhook</dt>
              <dd className="mt-0.5 flex flex-wrap items-center gap-1.5 text-foreground/90">
                <span className="break-all font-mono">{status.webhook.endpoint ?? "none"}</span>
                {status.webhook.found ? (
                  <ToneBadge tone={status.webhook.canonical && status.webhook.status === "enabled" ? "green" : "red"}>
                    {status.webhook.canonical ? status.webhook.status : "wrong host"}
                  </ToneBadge>
                ) : (
                  <ToneBadge tone="red">Missing</ToneBadge>
                )}
              </dd>
            </div>
          </dl>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={onRecheck} disabled={loading}>
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Re-check
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onSendTest}
              disabled={sendingTest || !sendingWorks}
              title={sendingWorks ? "Sends a test email to your admin address" : "RESEND_API_KEY is missing"}
            >
              <Send className="h-3.5 w-3.5" /> {sendingTest ? "Sending…" : "Send me a test"}
            </Button>
            <span className="text-xs text-amber-200/80">Checked {new Date(status.checkedAt).toLocaleTimeString("en-US")}</span>
          </div>
        </div>
      )}
    </div>
  );
}
