// Request bodies for the /api/admin/nyc routes.

import { z } from "zod";
import { normalizeEmail, normalizePhone, uniqueValues } from "./normalize";
import { crmFiltersSchema } from "./filters";

export const CONTACT_KINDS = ["renter", "buyer", "broker"] as const;

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable();

const emailList = z
  .array(z.string().max(254))
  .max(10)
  .transform((list, ctx) => {
    const out = list.filter((v) => v.trim() !== "").map((v) => normalizeEmail(v));
    if (out.some((v) => v === null)) {
      ctx.addIssue({ code: "custom", message: "One of the emails is not valid." });
      return z.NEVER;
    }
    return uniqueValues(out);
  });

const phoneList = z
  .array(z.string().max(40))
  .max(10)
  .transform((list, ctx) => {
    const out = list.filter((v) => v.trim() !== "").map((v) => normalizePhone(v));
    if (out.some((v) => v === null)) {
      ctx.addIssue({ code: "custom", message: "One of the phone numbers is not valid." });
      return z.NEVER;
    }
    return uniqueValues(out);
  });

const tagList = z
  .array(z.string().trim().min(1).max(60))
  .max(50)
  .transform((v) => uniqueValues(v));

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");

export const contactPatchSchema = z
  .object({
    first_name: text(80),
    last_name: text(80),
    emails: emailList,
    phones: phoneList,
    stage: z.string().trim().min(1).max(80),
    source: text(80),
    kind: z.enum(CONTACT_KINDS),
    tags: tagList,
    price: z.number().int().min(0).max(100_000_000).nullable(),
    beds: z.number().int().min(0).max(20).nullable(),
    move_in: text(80),
    property_address: text(200),
    property_city: text(80),
    property_state: text(40),
    property_link: text(500),
    neighborhood: text(80),
    background: text(10_000),
    do_not_contact: z.boolean(),
  })
  .partial()
  .strict();

export type ContactPatch = z.infer<typeof contactPatchSchema>;

export const contactCreateSchema = z.object({
  first_name: text(80).optional(),
  last_name: text(80).optional(),
  emails: emailList.optional(),
  phones: phoneList.optional(),
  stage: z.string().trim().min(1).max(80).optional(),
  source: text(80).optional(),
  tags: tagList.optional(),
  note: z.string().trim().max(5000).optional(),
});

export const activityCreateSchema = z
  .object({
    kind: z.enum(["note", "call", "text", "email", "whatsapp"]),
    direction: z.enum(["inbound", "outbound"]).optional(),
    outcome: z.enum(["talked", "voicemail", "no_answer", "bad_number"]).optional(),
    body: z.string().trim().max(5000).optional(),
  })
  .refine((a) => a.kind !== "note" || !!a.body, { message: "A note needs text." })
  .refine((a) => a.kind === "call" || !a.outcome, { message: "Only calls have an outcome." });

export const taskCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  kind: z.enum(["call", "text", "email", "showing", "other"]).default("call"),
  due_on: dateKey,
});

export const taskPatchSchema = z
  .object({
    completed: z.boolean(),
    due_on: dateKey,
    title: z.string().trim().min(1).max(200),
  })
  .partial()
  .strict();

export const bulkSchema = z
  .object({
    ids: z.array(z.uuid()).max(50_000).optional(),
    filters: crmFiltersSchema.optional(),
    action: z.enum(["stage", "add_tag", "remove_tag", "kind", "delete"]),
    value: z.string().trim().max(80).optional(),
  })
  .refine((b) => !!b.ids !== !!b.filters, { message: "Send ids or filters, not both." })
  .refine((b) => b.action === "delete" || !!b.value, { message: "This action needs a value." })
  .refine((b) => b.action !== "kind" || (CONTACT_KINDS as readonly string[]).includes(b.value ?? ""), {
    message: "Type must be renter, buyer or broker.",
  });

export const smartListCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  filters: crmFiltersSchema,
});

const historyEntry = z.object({
  kind: z.enum(["note", "call", "text", "email", "whatsapp", "inquiry"]),
  direction: z.enum(["inbound", "outbound"]).nullable(),
  outcome: z.enum(["talked", "voicemail", "no_answer", "bad_number"]).nullable(),
  occurred_at: z.iso.datetime({ offset: true }),
  actor: z.string().max(120).nullable(),
  body: z.string().max(5000).nullable(),
  meta: z.record(z.string(), z.union([z.string().max(500), z.number()])),
  import_key: z.string().min(1).max(200),
});

const importContact = z.object({
  external_id: z.string().max(80).nullable(),
  first_name: z.string().max(80).nullable(),
  last_name: z.string().max(80).nullable(),
  emails: z.array(z.string().max(254)).max(10),
  phones: z.array(z.string().max(16)).max(10),
  stage: z.string().min(1).max(80),
  source: z.string().max(80).nullable(),
  previous_agent: z.string().max(80).nullable(),
  kind: z.enum(CONTACT_KINDS),
  tags: z.array(z.string().max(60)).max(50),
  price: z.number().int().nullable(),
  beds: z.number().int().nullable(),
  move_in: z.string().max(80).nullable(),
  property_address: z.string().max(200).nullable(),
  property_city: z.string().max(80).nullable(),
  property_state: z.string().max(40).nullable(),
  property_link: z.string().max(500).nullable(),
  neighborhood: z.string().max(80).nullable(),
  background: z.string().max(10_000).nullable(),
  added_at: z.iso.datetime({ offset: true }).nullable(),
  do_not_contact: z.boolean(),
  contacted: z.boolean(),
  last_contacted_at: z.iso.datetime({ offset: true }).nullable(),
  last_inbound_at: z.iso.datetime({ offset: true }).nullable(),
  last_activity_at: z.iso.datetime({ offset: true }).nullable(),
  extra: z.record(z.string().max(200), z.string().max(2000)),
  activities: z.array(historyEntry).max(500),
});

export const importBatchSchema = z.object({
  batch: z.string().trim().min(1).max(120),
  contacts: z.array(importContact).min(1).max(500),
});

export const templateSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    channel: z.enum(["text", "email"]),
    subject: z.string().trim().max(200).optional().nullable(),
    body: z.string().trim().min(1).max(2000),
  })
  .transform((t) => ({ ...t, subject: t.channel === "email" ? t.subject || null : null }));

export const senderSchema = z.object({
  name: z.string().trim().max(60),
  company: z.string().trim().max(80),
});

/** One text to send through Twilio. 1,600 characters is Twilio's limit. */
export const smsSchema = z.object({
  body: z.string().trim().min(1, "Write a message first.").max(1600),
});
