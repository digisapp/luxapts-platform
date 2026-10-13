import { createAdminClient } from "@/lib/supabase/server";
import { TWILIO_OPTED_OUT } from "@/lib/crm/twilio";
import { readTwilioRequest } from "@/lib/crm/twilio-webhook";

/** Delivery updates for texts sent from the contact page (queued → delivered / failed). */
export async function POST(req: Request) {
  const request = await readTwilioRequest(req);
  if (!request.ok) return new Response(null, { status: request.status });
  const { MessageSid, MessageStatus, ErrorCode } = request.params;
  if (!MessageSid || !MessageStatus) return new Response(null, { status: 204 });

  const supabase = createAdminClient();
  const { data: activity } = await supabase
    .from("crm_activities")
    .select("id, contact_id, meta")
    .eq("meta->>sid", MessageSid)
    .maybeSingle();
  if (!activity) return new Response(null, { status: 204 });

  const meta: Record<string, unknown> = { ...(activity.meta as Record<string, unknown>), status: MessageStatus };
  if (ErrorCode) meta.error_code = Number(ErrorCode);
  await supabase.from("crm_activities").update({ meta }).eq("id", activity.id);
  if (Number(ErrorCode) === TWILIO_OPTED_OUT) {
    await supabase.from("crm_contacts").update({ do_not_contact: true }).eq("id", activity.contact_id);
  }
  return new Response(null, { status: 204 });
}
