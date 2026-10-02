# Admin email inbox (`/admin/email`)

The only email channel for Staycio. Mail to the reply address lands in the
admin dashboard next to every new-lead alert; admins read and answer it
there; everything goes through Resend. No Google Workspace mailbox is
involved — staycio.com has no MX record.

## How it works

```
sender ──► replies@inbound.staycio.com  (or any @staycio.com / *.staycio.com address)
             │  (MX → Resend receiving)
             ▼
   Resend fires `email.received` ──► POST https://staycio.com/api/webhooks/resend
             │  svix signature, then GET /emails/receiving/{id} for body + headers
             ▼
       emails (direction=inbound) ──► /admin/email
             │  after(): Grok classifies + drafts (XAI_API_KEY); auto-sends only
             │  if platform_settings.ai_auto_reply_enabled = true
             ▼
   admin replies ──► Resend send, From the building for a microsite lead
                     ("Downtown 6" <downtown6miami@staycio.com>, via
                     senderIdentityFor) or "Staycio <hello@staycio.com>",
                     Reply-To replies+<threadId>@inbound.staycio.com
                     (the plus tag threads the answer when it comes back)

   new lead (web form / microsite / chat) ──► recordInternalLeadAlert()
             ──► emails (direction=inbound, metadata.kind=lead_alert) ──► /admin/email
```

Code: `src/lib/email/admin-inbox.ts` (service), `inbound-address.ts` (pure
addressing helpers, unit tested), `inbox-status.ts` (readiness check),
`branded.ts` (the plain email shell: white, system font, paragraphs, no
header or footer — every reply reads like Stacy wrote it), `src/lib/ai-email.ts` (classifier +
auto-reply), `src/app/api/webhooks/resend/route.ts` (webhook),
`src/app/api/admin/inbox/*` (admin API), `src/hooks/useAdminInbox.ts` +
`src/components/admin/inbox/*` (UI). Table: `emails` (migration 010, extended
by 029).

Threading: `emails.thread_id` is the id of the thread's first email. A
thread's first message is inserted with `thread_id = id`; every later message
copies it. Replies are matched, in order, by the plus-address tag, by
In-Reply-To against a stored Message-ID, and finally by stripped subject +
counterpart address.

## Environment (Vercel → Production)

| Var | Purpose |
| --- | --- |
| `RESEND_API_KEY` | Sending + fetching received mail. Full-access key (not send-only). |
| `RESEND_WEBHOOK_SECRET` | Svix signing secret of the Resend webhook. Every call is rejected without it. |
| `FROM_EMAIL` | From on admin replies to non-microsite leads; default `Staycio <hello@staycio.com>`. Microsite leads are answered as their building (see `senderIdentityFor`). Must be on a verified sending domain. |
| `REPLY_TO_EMAIL` | The receiving mailbox. Default `replies@inbound.staycio.com`. Its **domain** is what must receive in Resend. |
| `XAI_API_KEY` | Optional. AI summary + suggested reply. Mail still arrives without it. |

## Migration 029

`supabase/migrations/029_admin_inbox.sql` drops the self-referencing FK on
`thread_id` (it made every new thread fail to insert), backfills
`thread_id = id` on the existing lead-alert rows, adds `is_spam` and the
folder indexes. The code runs against a pre-029 database: it probes for
`is_spam` once per process and keeps the Spam folder off (spam is dropped at
the webhook, as before) until the column exists. Apply it with the usual
Supabase SQL editor / Management API flow.

## Is it working? (check this first, not the UI)

`/admin/email` shows a yellow **"This inbox can't receive mail yet"** card
until everything below is true. The same data is at
`GET /api/admin/inbox/status` and from `npx tsx scripts/check-admin-inbox.ts`.
"Inbox is empty" with a green bar at the top means there is genuinely no mail.

Ready means all of:

1. Resend domain for `REPLY_TO_EMAIL`'s domain (`inbound.staycio.com`) is
   **verified** with **receiving enabled**.
2. Resend webhook endpoint is exactly `https://staycio.com/api/webhooks/resend`
   (www.staycio.com 308s to the apex and Svix treats 3xx as failure),
   enabled, subscribed to `email.received` (+ `email.delivered`,
   `email.bounced`, `email.complained`, `email.failed` for status).
3. `RESEND_WEBHOOK_SECRET` set in prod and equal to the webhook's signing secret.

Resend webhooks are **account-wide**: every receiving domain on the account
(Digis, EXA, Mayells, Cannes Swim Week…) fires at this endpoint too. The
webhook keeps only mail with a recipient on staycio.com / *.staycio.com and
acknowledges the rest with `ignored: "not our domain"` before fetching the
body.

## DNS at GoDaddy (staycio.com zone)

Hosts are typed **relative to staycio.com** — that relative-vs-FQDN
distinction is the usual reason these fail. The setup card lists them with
copy buttons and live status; `scripts/check-inbound-dns.ts` checks them
independently of Resend.

| Type | Host | Value | Priority |
| --- | --- | --- | --- |
| MX | `inbound` | `inbound-smtp.us-east-1.amazonaws.com` | 10 |
| TXT | `resend._domainkey.inbound` | (DKIM value from the card / Resend) | |
| MX | `send.inbound` | `feedback-smtp.us-east-1.amazonses.com` | 10 |
| TXT | `send.inbound` | `v=spf1 include:amazonses.com ~all` | |
| CNAME | `rsend.inbound` | `send.forge.rmta.net` | |

If every record is live but Resend still says `pending` /
`partially_failed`, press **Verify** on the domain in Resend (or
`POST /domains/{id}/verify`) — it checks too early and sits there.

## Testing the loop

1. `/admin/email` → **Send me a test** (or `POST /api/admin/inbox/test`). It
   emails the signed-in admin through the normal reply path (hello@ From,
   per-thread Reply-To) and shows in **Sent** with a "Test" badge.
2. Reply to it from that mailbox. Within a minute the reply must appear in
   **Inbox**, inside the same thread. If it doesn't, receiving is the broken
   half — see the setup card.
3. Reply from the inbox; check the sender's client groups it in the thread.

Webhook deliveries and their responses are visible in Resend → Webhooks → the
staycio.com endpoint. A 401 there means `RESEND_WEBHOOK_SECRET` doesn't match
the webhook's signing secret (editing the endpoint URL keeps the secret;
creating a new webhook rotates it). Resend disables an endpoint after
repeated failures — fix the cause, then re-enable it.

## AI auto-reply

`platform_settings.ai_auto_reply_enabled` (JSON boolean; the toggle on the
page, with confirmation). With it off the AI still summarises and drafts;
nothing is sent without an admin. With it on, auto-sends only for
tour_request / lease_inquiry / pricing_inquiry / application_status /
move_in_question / amenity_question / scheduling / general_inquiry at ≥ 85 %
confidence, never twice in 24 h per thread, never to automated senders
(no-reply, mailer-daemon, list mail, Auto-Submitted) or our own domain.
Drafts are sanitized to a minimal formatting allowlist before sending —
they are influenced by attacker-controlled inbound content.

## Related

- Lead alerts: `recordInternalLeadAlert()` in `src/lib/email/recipients.ts`
  writes every captured lead into this inbox directly (no SMTP in the path).
  They show with a green **Lead** badge; Reply goes to the lead's address.
- Renter-facing mail (tour confirmations, alerts) sets Reply-To to the inbox
  address via `getReplyToAddress()`, so "just reply to this email" lands here.
- Bulk lead campaigns (`/api/admin/email/send`, `/api/admin/leads/bulk-email`)
  are a separate feature and do not write to this inbox.

## Microsite signups

The first note to a microsite signup (`micrositeInquiryEmail`, five plain
paragraphs signed Stacy) is sent through `sendNewEmail` too, so it is the
thread's first message in the Sent folder, goes out as the building, and
carries the plus-addressed Reply-To. When the person answers, the reply
threads under it on `/admin/email` and the AI draft is written as Stacy.
