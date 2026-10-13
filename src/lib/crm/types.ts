// Row shapes for the NYC contacts book (migration 034).

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
  assigned_to: string | null;
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
  next_task_on: string | null;
  external_id: string | null;
  added_at: string | null;
  import_batch: string | null;
  extra: Record<string, string>;
}

/** What the list shows per row. */
export const CONTACT_LIST_COLUMNS =
  "id, first_name, last_name, emails, phones, stage, source, assigned_to, tags, price, beds, property_address, neighborhood, do_not_contact, contacted, last_contacted_at, last_inbound_at, last_activity_at, next_task_on, added_at";

export type CrmContactListRow = Pick<
  CrmContact,
  | "id"
  | "first_name"
  | "last_name"
  | "emails"
  | "phones"
  | "stage"
  | "source"
  | "assigned_to"
  | "tags"
  | "price"
  | "beds"
  | "property_address"
  | "neighborhood"
  | "do_not_contact"
  | "contacted"
  | "last_contacted_at"
  | "last_inbound_at"
  | "last_activity_at"
  | "next_task_on"
  | "added_at"
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
  assigned: Facet[];
  tags: Facet[];
  neighborhoods: Facet[];
}

export interface CrmSmartList {
  id: string;
  name: string;
  filters: Record<string, unknown>;
  position: number;
}
