// Row shapes for the NYC contacts book (migration 034).

export type ContactKind = "renter" | "buyer" | "broker";

export interface CrmContact {
  id: string;
  created_at: string;
  updated_at: string;
  first_name: string | null;
  last_name: string | null;
  emails: string[];
  phones: string[];
  stage: string;
  source: string | null;
  /** Unused while the admin works the book alone (migration 035). */
  assigned_to: string | null;
  /** FUB's "Assigned To": who worked them before; history, not ownership. */
  previous_agent: string | null;
  kind: ContactKind;
  /** Brokers: their firm, from their work email (migration 037). */
  company: string | null;
  /** Brokers: where they are in recruiting to Staycio. */
  partner_status: string | null;
  tags: string[];
  price: number | null;
  beds: number | null;
  move_in: string | null;
  property_address: string | null;
  property_city: string | null;
  property_state: string | null;
  property_link: string | null;
  neighborhood: string | null;
  background: string | null;
  do_not_contact: boolean;
  has_real_email: boolean;
  cycle_month: number | null;
  contacted: boolean;
  last_contacted_at: string | null;
  last_inbound_at: string | null;
  last_activity_at: string | null;
  /** Their last message came after ours (generated column). */
  awaiting_reply: boolean;
  next_task_on: string | null;
  external_id: string | null;
  added_at: string | null;
  import_batch: string | null;
  extra: Record<string, string>;
  /** In "Recently deleted" since then (migration 036). */
  deleted_at: string | null;
  /** Merged into this contact: hidden, its history shown there. */
  merged_into: string | null;
  merged_at: string | null;
  /** Neither deleted nor merged (generated). */
  is_active: boolean;
}

/** What the list shows per row. */
export const CONTACT_LIST_COLUMNS =
  "id, first_name, last_name, emails, phones, stage, source, previous_agent, kind, company, partner_status, tags, price, beds, property_address, neighborhood, do_not_contact, has_real_email, contacted, last_contacted_at, last_inbound_at, last_activity_at, awaiting_reply, next_task_on, added_at, deleted_at, extra";

export type CrmContactListRow = Pick<
  CrmContact,
  | "id"
  | "first_name"
  | "last_name"
  | "emails"
  | "phones"
  | "stage"
  | "source"
  | "previous_agent"
  | "kind"
  | "company"
  | "partner_status"
  | "extra"
  | "tags"
  | "price"
  | "beds"
  | "property_address"
  | "neighborhood"
  | "do_not_contact"
  | "has_real_email"
  | "contacted"
  | "last_contacted_at"
  | "last_inbound_at"
  | "last_activity_at"
  | "awaiting_reply"
  | "next_task_on"
  | "added_at"
  | "deleted_at"
>;

export type ActivityKind = "note" | "call" | "text" | "email" | "whatsapp" | "inquiry" | "stage" | "task";
export type ActivityDirection = "inbound" | "outbound";
export type CallOutcome = "talked" | "voicemail" | "no_answer" | "bad_number";

export interface CrmActivity {
  id: string;
  contact_id: string;
  created_at: string;
  occurred_at: string;
  kind: ActivityKind;
  direction: ActivityDirection | null;
  outcome: CallOutcome | null;
  body: string | null;
  actor: string | null;
  meta: Record<string, unknown>;
  import_key: string | null;
}

export type TaskKind = "call" | "text" | "email" | "showing" | "other";

export interface CrmTask {
  id: string;
  contact_id: string;
  created_at: string;
  title: string;
  kind: TaskKind;
  due_on: string;
  completed_at: string | null;
}

export interface Facet {
  value: string;
  count: number;
}

export interface CrmFacets {
  stages: Facet[];
  sources: Facet[];
  /** Previous agents. */
  agents: Facet[];
  tags: Facet[];
  neighborhoods: Facet[];
  /** Brokers' firms. */
  companies: Facet[];
  /** Brokers per recruiting status. */
  partner: Facet[];
  /** Neighborhoods brokers asked about. */
  broker_neighborhoods: Facet[];
}

export interface CrmTemplate {
  id: string;
  name: string;
  channel: "text" | "email";
  subject: string | null;
  body: string;
  position: number;
}

/** Sender details the templates fill in ({my_name}, {company}). */
export interface CrmSender {
  name: string;
  company: string;
}

/** One side of a suggested duplicate pair. */
export interface DuplicateSide {
  id: string;
  first_name: string | null;
  last_name: string | null;
  emails: string[];
  phones: string[];
  stage: string;
  kind: ContactKind;
  source: string | null;
  previous_agent: string | null;
  added_at: string | null;
  property_address: string | null;
  neighborhood: string | null;
  price: number | null;
  beds: number | null;
  do_not_contact: boolean;
  last_activity_at: string | null;
  last_inbound_at: string | null;
  external_id: string | null;
  history: number;
  open_tasks: number;
}

export interface DuplicatePair {
  a: DuplicateSide;
  b: DuplicateSide;
  /** The emails/phones they share. */
  shared: string[];
  /** First names agree (or one is missing): very likely the same person. */
  names_agree: boolean;
}

export interface CrmSmartList {
  id: string;
  name: string;
  filters: Record<string, unknown>;
  position: number;
}
