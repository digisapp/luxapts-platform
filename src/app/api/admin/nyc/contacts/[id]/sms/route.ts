import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { apiError } from "@/lib/api-helpers";
import { isValidUUID } from "@/lib/utils";
import { actorName } from "@/lib/crm/service";
import { smsSchema } from "@/lib/crm/validation";
import { sendSms, twilioConfig, TwilioError, TWILIO_OPTED_OUT } from "@/lib/crm/twilio";

type Context = { params: Promise<{ id: string }> };

/**
 * Text a contact from the brokerage's Twilio number and log it. Refuses
 * anyone marked do-not-contact; a carrier opt-out (21610) marks them so.
 */
export async function POST(req: Request, { params }: Context) {
  const auth = await checkAdminAuth();
  if (!auth.isAdmin) return apiError(auth.error, auth.status);
  const { id } = await params;
  if (!isValidUUID(id)) return apiError("Invalid contact id.");

  const config = twilioConfig();
  if (!config) return apiError("Texting from Staycio is not set up yet (Twilio keys missing).", 503);

  const parsed = smsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "Invalid message.");

  const supabase = createAdminClient();
  const { data: contact, error: readError } = await supabase
    .from("crm_contacts")
    .select("id, phones, do_not_contact")
    .eq("id", id)
    .maybeSingle();
  if (readError) return apiError("Could not load the contact.", 500);
  if (!contact) return apiError("Contact not found.", 404);
  if (contact.do_not_contact) return apiError("This person is marked do not contact.", 409);
  const to = (contact.phones as string[])[0];
  if (!to) return apiError("No phone number on file.");

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://staycio.com").replace(/\/$/, "");
  let sent: { sid: string; status: string };
  try {
    sent = await sendSms(config, to, parsed.data.body, `${appUrl}/api/webhooks/twilio/status`);
  } catch (err) {
    if (err instanceof TwilioError && err.code === TWILIO_OPTED_OUT) {
      await supabase.from("crm_contacts").update({ do_not_contact: true }).eq("id", id);
      return apiError("They have opted out of texts (replied STOP). Marked do not contact.", 409);
    }
    console.error("Twilio send error:", err);
    return apiError(err instanceof Error ? `Text not sent: ${err.message}` : "Text not sent.", 502);
  }

  const { data: activity, error } = await supabase
    .from("crm_activities")
    .insert({
      contact_id: id,
      kind: "text",
      direction: "outbound",
      body: parsed.data.body,
      actor: await actorName(supabase, auth.userId),
      created_by: auth.userId,
      meta: { sid: sent.sid, status: sent.status, via: "twilio" },
    })
    .select("*")
    .single();
  if (error) console.error("NYC sent-text log error (text was sent):", error);
  return NextResponse.json({ activity, sid: sent.sid }, { status: 201 });
}
