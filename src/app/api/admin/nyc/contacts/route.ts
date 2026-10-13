import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { apiError } from "@/lib/api-helpers";
import { safeParseInt } from "@/lib/utils";
import { filtersFromParams, sortFromParam } from "@/lib/crm/filters";
import { actorName, listContacts, listContext } from "@/lib/crm/service";
import { contactCreateSchema } from "@/lib/crm/validation";
import { findMatch } from "@/lib/crm/merge";
import { DEFAULT_STAGE } from "@/lib/crm/stages";

/** One page of the NYC book under the given filters. */
export async function GET(req: Request) {
  const auth = await checkAdminAuth();
  if (!auth.isAdmin) return apiError(auth.error, auth.status);

  const params = new URL(req.url).searchParams;
  try {
    const { rows, total } = await listContacts(
      createAdminClient(),
      filtersFromParams(params),
      sortFromParam(params.get("sort")),
      safeParseInt(params.get("offset"), 0, 0, 1_000_000),
      listContext()
    );
    return NextResponse.json({ contacts: rows, total });
  } catch (err) {
    console.error("NYC contacts list error:", err);
    return apiError("Could not load contacts.", 500);
  }
}

/** Add one person by hand. 409 with the existing id if they are already here. */
export async function POST(req: Request) {
  const auth = await checkAdminAuth();
  if (!auth.isAdmin) return apiError(auth.error, auth.status);

  const parsed = contactCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "Invalid contact.");
  const input = parsed.data;
  const emails = input.emails ?? [];
  const phones = input.phones ?? [];
  if (!input.first_name && !input.last_name && emails.length === 0 && phones.length === 0) {
    return apiError("Give at least a name, an email or a phone number.");
  }

  const supabase = createAdminClient();
  const { data: candidates, error: matchError } = await supabase.rpc("crm_match_contacts", {
    p_external_ids: [],
    p_emails: emails,
    p_phones: phones,
  });
  if (matchError) {
    console.error("NYC contact match error:", matchError);
    return apiError("Could not check for duplicates.", 500);
  }
  const existing = findMatch(
    { external_id: null, first_name: input.first_name ?? null, emails, phones },
    (candidates ?? []) as {
      id: string;
      external_id: string | null;
      first_name: string | null;
      emails: string[];
      phones: string[];
      merged_into: string | null;
      deleted_at: string | null;
    }[]
  );
  if (existing) {
    // A merged record lives on in the contact it was merged into.
    const id = existing.merged_into ?? existing.id;
    const message = existing.deleted_at
      ? "This person is in Recently deleted. Open them to restore."
      : "Already in the book.";
    return NextResponse.json({ error: message, existing_id: id }, { status: 409 });
  }

  const now = new Date().toISOString();
  const { data: contact, error } = await supabase
    .from("crm_contacts")
    .insert({
      first_name: input.first_name ?? null,
      last_name: input.last_name ?? null,
      emails,
      phones,
      stage: input.stage ?? DEFAULT_STAGE,
      source: input.source ?? "Added by hand",
      tags: input.tags ?? [],
      added_at: now,
      last_activity_at: now,
    })
    .select("id")
    .single();
  if (error || !contact) {
    console.error("NYC contact create error:", error);
    return apiError("Could not add the contact.", 500);
  }

  if (input.note) {
    await supabase.from("crm_activities").insert({
      contact_id: contact.id,
      kind: "note",
      body: input.note,
      actor: await actorName(supabase, auth.userId),
      created_by: auth.userId,
    });
  }

  return NextResponse.json({ id: contact.id }, { status: 201 });
}
