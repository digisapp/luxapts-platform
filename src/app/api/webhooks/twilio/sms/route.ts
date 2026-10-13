import { createAdminClient } from "@/lib/supabase/server";
import { normalizePhone } from "@/lib/crm/normalize";
import { arrayLiteral } from "@/lib/crm/filters";
import { EMPTY_TWIML, optKeyword } from "@/lib/crm/twilio";
import { readTwilioRequest } from "@/lib/crm/twilio-webhook";

const twiml = (status = 200) =>
  new Response(EMPTY_TWIML, { status, headers: { "Content-Type": "text/xml" } });

/**
 * An incoming text to the brokerage's Twilio number. Logged on the
 * sender's timeline as a reply (which puts them in "Waiting on you"); a
 * number not in the book becomes a new contact. STOP and START follow the
 * carrier keywords: Twilio sends the confirmation itself, this keeps
 * do-not-contact in step.
 */
export async function POST(req: Request) {
  const request = await readTwilioRequest(req);
  if (!request.ok) return new Response(null, { status: request.status });
  const { From, Body = "", MessageSid, NumMedia } = request.params;
  const from = normalizePhone(From);
  if (!from || !MessageSid) return twiml();

  const supabase = createAdminClient();
  const { data: matches, error: findError } = await supabase
    .from("crm_contacts")
    .select("id, first_name, last_name, do_not_contact")
    .contains("phones", arrayLiteral(from))
    .order("last_activity_at", { ascending: false, nullsFirst: false })
    .limit(1);
  if (findError) {
    console.error("Twilio inbound lookup error:", findError);
    return twiml(500); // Twilio retries on 5xx
  }

  let contact = matches?.[0] ?? null;
  if (!contact) {
    const now = new Date().toISOString();
    const { data: created, error } = await supabase
      .from("crm_contacts")
      .insert({ phones: [from], source: "Text message", added_at: now, last_activity_at: now })
      .select("id, first_name, last_name, do_not_contact")
      .single();
    if (error || !created) {
      console.error("Twilio inbound contact create error:", error);
      return twiml(500);
    }
    contact = created;
  }

  const { error: logError } = await supabase.from("crm_activities").insert({
    contact_id: contact.id,
    kind: "text",
    direction: "inbound",
    body: Body.trim() || (Number(NumMedia) > 0 ? "(photo or file)" : null),
    actor: [contact.first_name, contact.last_name].filter(Boolean).join(" ") || null,
    meta: { sid: MessageSid, via: "twilio", ...(Number(NumMedia) > 0 ? { media: Number(NumMedia) } : {}) },
  });
  // 23505: Twilio retried a message already logged.
  if (logError && logError.code !== "23505") {
    console.error("Twilio inbound log error:", logError);
    return twiml(500);
  }

  const keyword = optKeyword(Body);
  if (keyword && (keyword === "stop") !== contact.do_not_contact) {
    await supabase.from("crm_contacts").update({ do_not_contact: keyword === "stop" }).eq("id", contact.id);
    await supabase.from("crm_activities").insert({
      contact_id: contact.id,
      kind: "note",
      body:
        keyword === "stop"
          ? "Texted STOP: marked do not contact. Twilio will not deliver texts to them until they text START."
          : "Texted START again: no longer do not contact.",
    });
  }
  return twiml();
}
