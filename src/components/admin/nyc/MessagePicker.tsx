"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Send } from "lucide-react";
import { cn, whatsappHref } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  mailtoHref,
  mergeValues,
  missingSenderFields,
  renderTemplate,
  smsHref,
  whatsappTextHref,
} from "@/lib/crm/templates";
import type { CrmContact, CrmSender, CrmTemplate } from "@/lib/crm/types";
import { errorOf } from "./NycDialogs";

export type MessageChannel = "text" | "whatsapp" | "email";

interface MessagePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channel: MessageChannel;
  contact: CrmContact;
  firstName: string;
  templates: CrmTemplate[];
  sender: CrmSender;
  onSenderSaved: (sender: CrmSender) => void;
  today: string;
  /** Texts can go out from the brokerage's Twilio number. */
  twilioReady: boolean;
  /** The phone/mail app was opened with this message: ask how it went. */
  onOpenedApp: (channel: MessageChannel, body: string) => void;
  /** Sent through Twilio (already logged). */
  onSent: () => void;
}

/** GSM-7 texts split at 153 characters a part; anything else (emoji, curly quotes) at 67. */
function smsParts(text: string): number {
  if (!text) return 0;
  const gsm = /^[\x20-\x7E\n\r£¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ¤¡ÄÖÑÜ§¿äöñüà€]*$/.test(text);
  const single = gsm ? 160 : 70;
  const multi = gsm ? 153 : 67;
  return text.length <= single ? 1 : Math.ceil(text.length / multi);
}

export function MessagePicker({
  open,
  onOpenChange,
  channel,
  contact,
  firstName,
  templates,
  sender,
  onSenderSaved,
  today,
  twilioReady,
  onOpenedApp,
  onSent,
}: MessagePickerProps) {
  const choices = templates.filter((t) => t.channel === (channel === "email" ? "email" : "text"));
  const [chosen, setChosen] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");
  const [senderDraft, setSenderDraft] = useState(sender.name);
  const [savingSender, setSavingSender] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const values = useMemo(() => mergeValues(contact, sender, today), [contact, sender, today]);
  const template = choices.find((t) => t.id === chosen);
  const needsSender = template ? missingSenderFields(`${template.subject ?? ""} ${template.body}`, sender).includes("my_name") : false;

  function pick(t: CrmTemplate | null) {
    setChosen(t?.id ?? null);
    setBody(t ? renderTemplate(t.body, values) : "");
    setSubject(t?.subject ? renderTemplate(t.subject, values) : "");
    setError(null);
  }

  async function saveSender() {
    setSavingSender(true);
    const res = await fetch("/api/admin/nyc/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: senderDraft, company: sender.company }),
    }).catch(() => null);
    setSavingSender(false);
    if (!res) return setError("Could not reach the server.");
    const err = await errorOf(res);
    if (err) return setError(err);
    const next = { ...sender, name: senderDraft.trim() };
    onSenderSaved(next);
    if (template) {
      const v = mergeValues(contact, next, today);
      setBody(renderTemplate(template.body, v));
      if (template.subject) setSubject(renderTemplate(template.subject, v));
    }
  }

  async function sendViaTwilio() {
    setSending(true);
    setError(null);
    const res = await fetch(`/api/admin/nyc/contacts/${contact.id}/sms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    }).catch(() => null);
    setSending(false);
    if (!res) return setError("Could not reach the server. The text was not sent.");
    const err = await errorOf(res);
    if (err) return setError(err);
    onOpenChange(false);
    onSent();
  }

  const phone = contact.phones[0];
  const email = contact.emails[0];
  const appHref =
    channel === "email"
      ? email && mailtoHref(email, subject, body)
      : channel === "whatsapp"
        ? phone && whatsappTextHref(whatsappHref(phone), body)
        : phone && smsHref(phone, body);
  const appLabel = channel === "email" ? "Open in Mail" : channel === "whatsapp" ? "Open WhatsApp" : "Open in Messages";
  const title = channel === "email" ? `Email ${firstName}` : channel === "whatsapp" ? `WhatsApp ${firstName}` : `Text ${firstName}`;
  const parts = channel === "text" ? smsParts(body) : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (sending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Pick a template or write your own. {channel === "text" && twilioReady
              ? "Send it from the brokerage's number, or open it on your phone."
              : `It opens in your ${channel === "email" ? "mail app" : channel === "whatsapp" ? "WhatsApp" : "phone's Messages app"} ready to send.`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Templates">
          <button
            type="button"
            onClick={() => pick(null)}
            aria-pressed={chosen === null}
            className={cn(
              "h-9 rounded-lg border px-3 text-sm",
              chosen === null ? "border-sky-400/40 bg-sky-400/15 text-sky-100" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.07]"
            )}
          >
            Blank
          </button>
          {choices.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => pick(t)}
              aria-pressed={chosen === t.id}
              className={cn(
                "h-9 rounded-lg border px-3 text-sm",
                chosen === t.id ? "border-sky-400/40 bg-sky-400/15 text-sky-100" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.07]"
              )}
            >
              {t.name}
            </button>
          ))}
          <Link href="/admin/nyc/templates" className="inline-flex h-9 items-center px-2 text-sm text-sky-300 hover:text-sky-200">
            Edit templates
          </Link>
        </div>

        {needsSender && (
          <div className="flex flex-wrap items-end gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3">
            <div className="min-w-0 flex-1 basis-48">
              <label htmlFor="sender-name" className="mb-1 block text-xs font-medium text-amber-100">
                Your name, as it should appear in messages
              </label>
              <Input id="sender-name" value={senderDraft} onChange={(e) => setSenderDraft(e.target.value)} maxLength={60} placeholder="e.g. Nathan" />
            </div>
            <button
              type="button"
              onClick={saveSender}
              disabled={savingSender || !senderDraft.trim()}
              className="h-11 rounded-lg bg-white px-4 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-50 md:h-10"
            >
              {savingSender ? "Saving..." : "Save"}
            </button>
          </div>
        )}

        {channel === "email" && (
          <div>
            <label htmlFor="msg-subject" className="mb-1 block text-xs font-medium text-muted-foreground">Subject</label>
            <Input id="msg-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
          </div>
        )}
        <div>
          <label htmlFor="msg-body" className="mb-1 block text-xs font-medium text-muted-foreground">Message</label>
          <Textarea id="msg-body" value={body} onChange={(e) => setBody(e.target.value)} rows={channel === "email" ? 8 : 5} maxLength={channel === "email" ? 5000 : 1600} />
          {channel === "text" && body && (
            <p className="mt-1 text-xs text-muted-foreground">
              {body.length} characters{parts > 1 ? ` · sends as ${parts} texts` : ""}
            </p>
          )}
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {appHref && needsSender && (
            <button type="button" disabled className="inline-flex h-11 items-center justify-center rounded-lg bg-white/20 px-4 text-sm font-medium text-white/60 md:h-10">
              Add your name above first
            </button>
          )}
          {appHref && !needsSender && (
            <a
              href={appHref}
              target={channel === "whatsapp" ? "_blank" : undefined}
              rel={channel === "whatsapp" ? "noopener noreferrer" : undefined}
              onClick={() => {
                onOpenChange(false);
                onOpenedApp(channel, body.trim());
              }}
              className={cn(
                "inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium md:h-10",
                channel === "text" && twilioReady
                  ? "border border-white/10 bg-white/[0.04] hover:bg-white/[0.08]"
                  : "bg-white text-black hover:bg-white/90"
              )}
            >
              {appLabel}
            </a>
          )}
          {channel === "text" && twilioReady && (
            <button
              type="button"
              onClick={sendViaTwilio}
              disabled={sending || !body.trim() || needsSender}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-black hover:bg-white/90 disabled:opacity-50 md:h-10"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
              Send text
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
