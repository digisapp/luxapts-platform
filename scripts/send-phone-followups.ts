/**
 * Follow up with microsite leads who signed up before the forms started
 * replying automatically (2026-10-02) and have never been written to.
 *
 * Default (first wave, sent 2026-10-05): leads who left an email but no phone
 * number. The forms only started asking for a phone in September, so these
 * can't be texted or called. Each gets Stacy's short note
 * (micrositeFollowUpEmail) asking for a move-in date and a number to text.
 * When they answer with a number, the Resend webhook saves it to the lead
 * (phone-capture.ts).
 *
 * --has-phone (second wave, 2026-10-06): the remaining leads, who did leave a
 * number. Same note, except the last line offers to text them at that number
 * instead of asking for one.
 *
 * Either way the note is sent as their building through the admin inbox, so
 * it is the first message of a thread in Sent and the reply lands under it.
 *
 *   npx tsx --env-file=.env.local scripts/send-phone-followups.ts                 # dry run: list who would get it
 *   npx tsx --env-file=.env.local scripts/send-phone-followups.ts --preview you@x  # one real rendering to you, nothing stored
 *   npx tsx --env-file=.env.local scripts/send-phone-followups.ts --send          # send, one every ~60s
 *   npx tsx --env-file=.env.local scripts/send-phone-followups.ts --has-phone ... # same three forms, for the leads with a number
 *
 * Options: --limit N, --delay-sec S (default 60, randomised ±25%).
 *
 * Safe to rerun: anyone who has ever been emailed from the inbox is skipped,
 * and every lead that gets the note is moved from "new" to "contacted".
 */
import { createAdminClient } from "@/lib/supabase/server";
import { getAdminInboxService } from "@/lib/email/admin-inbox";
import { micrositeFollowUpEmail, micrositeInquirySubject } from "@/lib/email/templates";
import { unsubscribeUrl } from "@/lib/email/unsubscribe";
import { MICROSITE_BUILDINGS, senderIdentityFor } from "@/lib/microsites";
import { getResendClient, getFromEmail } from "@/lib/resend/client";
import { getReplyToAddress } from "@/lib/email/recipients";
import { extractPhone, formatPhone } from "@/lib/email/phone-capture";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const SEND = flag("send");
const HAS_PHONE = flag("has-phone");
const PREVIEW_TO = opt("preview");
const LIMIT = Number(opt("limit") ?? Infinity);
const DELAY_SEC = Number(opt("delay-sec") ?? 60);

// Never mail these: the owner's own test signups.
const TEST_ADDRESSES = new Set(["nathan@examodels.com", "maria.test@examodels.com"]);
const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

interface Lead {
  id: string;
  created_at: string;
  status: string;
  source_detail: string | null;
  name: string | null;
  user_email: string | null;
  user_phone: string | null;
  unsubscribed_at: string | null;
  notes: string | null;
  city: { name: string } | null;
}

interface Recipient {
  lead: Lead;
  email: string;
  building: string;
  city: string;
  unitType: string | null;
  /** "(786) 315-6324": the number they left, only in --has-phone mode. */
  phone: string | null;
}

/** "[downtown6miami.com] Downtown 6 — Unit: 2 Bedroom · Move-in: Q4 2026" -> "2 Bedroom". */
function unitTypeFromNotes(notes: string | null): string | null {
  const m = (notes ?? "").match(/Unit:\s*([^·\n]+)/);
  return m ? m[1].trim() : null;
}

async function buildRecipients(): Promise<{ recipients: Recipient[]; skipped: Record<string, number> }> {
  const supabase = createAdminClient();
  const { data: leads, error } = await supabase
    .from("leads")
    .select("id, created_at, status, source_detail, name, user_email, user_phone, unsubscribed_at, notes, city:city_id(name)")
    .not("source_detail", "is", null)
    .order("created_at", { ascending: true })
    .limit(5000);
  if (error) throw new Error(`leads query failed: ${error.message}`);
  const all = (leads ?? []) as unknown as Lead[];

  const { data: sent, error: sentError } = await supabase
    .from("emails")
    .select("to_email, status")
    .eq("direction", "outbound")
    .limit(10000);
  if (sentError) throw new Error(`emails query failed: ${sentError.message}`);
  const everEmailed = new Set((sent ?? []).map((r) => String(r.to_email).toLowerCase()));

  const hasPhone = new Set(
    all.filter((l) => (l.user_phone ?? "").trim()).map((l) => (l.user_email ?? "").trim().toLowerCase())
  );

  const skipped: Record<string, number> = {};
  const skip = (why: string) => (skipped[why] = (skipped[why] ?? 0) + 1);
  // One note per person: keyed by email, and also by full name + building,
  // since some people signed up twice with two different addresses.
  const byEmail = new Map<string, Recipient>();
  const personKey = (lead: Lead, building: string) => {
    const name = (lead.name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
    return name.split(" ").length >= 2 ? `${name}|${building}` : null; // "Jordan" alone is not unique
  };

  // A person already written to under one address must not get the note again
  // at their other address (Natashalee Dunn signed up twice).
  const contactedPeople = new Set<string>();
  for (const lead of all) {
    const building = lead.source_detail ? MICROSITE_BUILDINGS[lead.source_detail] : undefined;
    const key = building ? personKey(lead, building) : null;
    if (key && everEmailed.has((lead.user_email ?? "").trim().toLowerCase())) contactedPeople.add(key);
  }

  for (const lead of all) {
    const building = lead.source_detail ? MICROSITE_BUILDINGS[lead.source_detail] : undefined;
    if (!building) continue; // not a microsite lead (phone line, main site)
    const key = personKey(lead, building);
    if (key && contactedPeople.has(key) && !everEmailed.has((lead.user_email ?? "").trim().toLowerCase())) {
      skip("already emailed at another address");
      continue;
    }
    const rawPhone = (lead.user_phone ?? "").trim();
    if (!HAS_PHONE && rawPhone) continue; // first wave: has a number, not this wave
    if (HAS_PHONE && !rawPhone) continue; // second wave: no number, first wave already covered them
    const email = (lead.user_email ?? "").trim().toLowerCase();
    if (!email) continue; // phone-only (voice line): nothing to email
    // Numbers were typed free-form ("(305) 9759050", "13056094719"); show a
    // clean one or none, never the raw string.
    const e164 = HAS_PHONE ? extractPhone(rawPhone) : null;
    if (HAS_PHONE && !e164) { skip("unreadable phone number"); continue; }
    if (TEST_ADDRESSES.has(email)) { skip("owner test signup"); continue; }
    if (!EMAIL_RE.test(email)) { skip("invalid email"); continue; }
    if (lead.unsubscribed_at) { skip("unsubscribed"); continue; }
    if (lead.status !== "new") { skip(`status ${lead.status}`); continue; }
    if (!HAS_PHONE && hasPhone.has(email)) { skip("same person has a phone on another lead"); continue; }
    if (everEmailed.has(email)) { skip("already emailed from the inbox"); continue; }
    if (byEmail.has(email)) skip("duplicate signup (newest kept)");
    byEmail.set(email, {
      lead,
      email,
      building,
      city: lead.city?.name || "Miami",
      unitType: unitTypeFromNotes(lead.notes),
      phone: e164 ? formatPhone(e164) : null,
    });
  }

  // Same person under two addresses: keep the newest signup.
  const byPerson = new Map<string, Recipient>();
  const result: Recipient[] = [];
  for (const r of [...byEmail.values()].sort((a, b) => a.lead.created_at.localeCompare(b.lead.created_at))) {
    const key = personKey(r.lead, r.building);
    if (!key) { result.push(r); continue; }
    if (byPerson.has(key)) skip("same name, second address (newest kept)");
    byPerson.set(key, r);
  }
  result.push(...byPerson.values());
  result.sort((a, b) => a.lead.created_at.localeCompare(b.lead.created_at));
  return { recipients: result, skipped };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { recipients, skipped } = await buildRecipients();
  const batch = recipients.slice(0, Number.isFinite(LIMIT) ? LIMIT : undefined);

  console.log(`${HAS_PHONE ? "Microsite leads with a phone number" : "Email-only microsite leads"} to follow up: ${recipients.length}`);
  console.log(`Skipped: ${JSON.stringify(skipped)}`);

  if (PREVIEW_TO) {
    const r = batch[0];
    if (!r) return console.log("Nobody to preview.");
    const note = micrositeFollowUpEmail({ name: r.lead.name, buildingName: r.building, city: r.city, unitType: r.unitType, phone: r.phone });
    const subject = micrositeInquirySubject(r.building, r.city, r.unitType);
    const { data, error } = await getResendClient().emails.send({
      from: senderIdentityFor(r.lead.source_detail, getFromEmail()).from,
      to: [PREVIEW_TO],
      replyTo: getReplyToAddress(),
      subject: `[Preview] ${subject}`,
      html: note.html,
      text: note.text,
    });
    if (error) throw new Error(error.message);
    console.log(`Preview of ${r.lead.name} (${r.building}) sent to ${PREVIEW_TO}: ${data?.id}`);
    console.log(`Subject: ${subject}\n---\n${note.text}`);
    return;
  }

  for (const r of batch) {
    console.log(`  ${r.lead.created_at.slice(0, 10)}  ${(r.lead.name ?? "").padEnd(24).slice(0, 24)}  ${r.building.padEnd(18)}  ${(r.unitType ?? "-").padEnd(10)}  ${r.email.padEnd(34)}  ${r.phone ?? ""}`);
  }
  if (!SEND) {
    console.log(`\nDry run. Nothing sent. Add --send to send ${batch.length} emails, one every ~${DELAY_SEC}s.`);
    return;
  }

  const inbox = getAdminInboxService();
  const supabase = createAdminClient();
  let ok = 0;
  let failed = 0;
  for (const [i, r] of batch.entries()) {
    const note = micrositeFollowUpEmail({ name: r.lead.name, buildingName: r.building, city: r.city, unitType: r.unitType, phone: r.phone });
    const unsubscribe = unsubscribeUrl(r.lead.id);
    const result = await inbox.sendNewEmail({
      to: r.email,
      subject: micrositeInquirySubject(r.building, r.city, r.unitType),
      bodyHtml: note.bodyHtml,
      bodyText: note.text,
      leadId: r.lead.id,
      ...(unsubscribe
        ? { extraHeaders: { "List-Unsubscribe": `<${unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } }
        : {}),
    });
    if (result.success) {
      ok++;
      await supabase.from("leads").update({ status: "contacted" }).eq("id", r.lead.id).eq("status", "new");
      console.log(`[${i + 1}/${batch.length}] sent  ${r.email}  (${r.building})`);
    } else {
      failed++;
      console.log(`[${i + 1}/${batch.length}] FAILED ${r.email}: ${result.error}`);
    }
    if (i < batch.length - 1) await sleep(DELAY_SEC * 1000 * (0.75 + Math.random() * 0.5));
  }
  console.log(`\nDone. Sent ${ok}, failed ${failed}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
