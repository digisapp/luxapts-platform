import { htmlToText } from "./branded";
import { isOurInboundAddress, parseEmailAddress } from "./inbound-address";
import { extractPhone, formatPhone } from "./phone-capture";

/**
 * Renter inquiries from listing sites, read out of the email the site sends.
 *
 * Apartments.com (CoStar) emails each renter lead to team@staycio.com. The
 * Resend webhook stores it in the admin inbox like any other mail, then hands
 * it here; leads/listing-lead.ts turns the result into a lead.
 *
 * - Detection is by the sender's domain, subdomains included. The sites also
 *   send account mail from those domains ("Welcome to the Apartments.com
 *   Network", invoices, reports), so only an inquiry-like subject, or a
 *   Reply-To that is the renter's own address, makes an email a lead. The
 *   rest stays an ordinary inbox email.
 * - Fields come from "Label: value" lines in the text part and in the HTML,
 *   where a table row's two cells read as "Label: value".
 * - The renter's address is never the site's own: Apartments.com relays
 *   replies through reply.email.apartments.com. It is a Reply-To off the
 *   sites' domains, else an "Email:" line.
 * - An inquiry with no renter email or phone is still returned, with
 *   reviewReasons set and the raw subject and body kept, so a format change
 *   never loses a lead.
 *
 * Adding Zillow, Rent.com or ApartmentList is one LISTING_SITES entry (their
 * sources are already allowed by migration 038) and a sample email in
 * parse-listing-lead.test.ts.
 *
 * Pure, so unit tested.
 */

export interface ListingSite {
  /** leads.source for its leads. */
  source: string;
  /** How the admin UI names it. */
  label: string;
  /** Sender domains; subdomains match too (email.apartments.com). */
  domains: string[];
  /** A subject that announces a renter inquiry. */
  inquirySubject: RegExp;
}

export const LISTING_SITES: ListingSite[] = [
  {
    source: "apartments.com",
    label: "Apartments.com",
    // CoStar runs the Apartments.com network and sends from both.
    domains: ["apartments.com", "costar.com"],
    inquirySubject: /\b(leads?|inquir(?:y|ies)|interested|message|question|tours?|contact(?:ed)?|requests?|renter|prospect)\b/i,
  },
];

/** Account mail the sites send from the same domains: never a lead on its subject. */
const ACCOUNT_SUBJECT = /\b(welcome|invoice|receipt|billing|payment|password|verif(?:y|ication)|reports?|newsletter|webinar|survey)\b/i;

export interface ListingEmail {
  from: string;
  fromName?: string | null;
  replyTo?: string | null;
  subject: string;
  text?: string | null;
  html?: string | null;
}

export interface ParsedListingLead {
  /** leads.source, e.g. "apartments.com". */
  source: string;
  sourceLabel: string;
  name: string | null;
  email: string | null;
  /** "(305) 555-0142"; other countries in E.164. */
  phone: string | null;
  message: string | null;
  propertyName: string | null;
  propertyAddress: string | null;
  /** Unit number or floor plan, as the site wrote it. */
  unit: string | null;
  beds: number | null;
  /** Move-in as written ("ASAP", "11/15/2026"). */
  moveIn: string | null;
  /** YYYY-MM-DD when the move-in is a full date. */
  moveInDate: string | null;
  needsReview: boolean;
  /** Why someone should read the original email; empty when the parse is complete. */
  reviewReasons: string[];
  subject: string;
  /** The email body as plain text, kept for a lead that needs review. */
  rawBody: string;
}

type Field =
  | "name"
  | "firstName"
  | "lastName"
  | "email"
  | "phone"
  | "message"
  | "property"
  | "address"
  | "unit"
  | "beds"
  | "moveIn";

const LABELS: Record<Field, string[]> = {
  name: ["name", "full name", "renter name", "renter", "prospect name", "prospect", "lead name", "contact name"],
  firstName: ["first name"],
  lastName: ["last name"],
  email: ["email", "e-mail", "email address", "renter email", "prospect email", "contact email"],
  phone: ["phone", "phone number", "telephone", "mobile", "mobile phone", "cell", "cell phone", "renter phone", "contact phone"],
  message: ["message", "comments", "comment", "renter message", "questions", "question", "inquiry"],
  property: ["property", "property name", "community", "listing", "building", "apartment community"],
  address: ["address", "property address", "listing address"],
  unit: ["floor plan", "floorplan", "unit", "unit number", "unit #", "unit type", "apartment", "layout"],
  beds: ["beds", "bedrooms", "bedroom"],
  moveIn: [
    "move-in date",
    "move in date",
    "move-in",
    "move in",
    "desired move-in",
    "desired move-in date",
    "preferred move-in date",
    "target move-in date",
    "move date",
    "lease start date",
  ],
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// "Label", "Label:" or "Label: value" filling the whole line.
const LABEL_RES = (Object.entries(LABELS) as [Field, string[]][]).map(([field, names]) => ({
  field,
  re: new RegExp(
    `^(?:${[...names].sort((a, b) => b.length - a.length).map(escapeRe).join("|")})\\s*(?::+\\s*(.*))?$`,
    "i"
  ),
}));

/** Where the fields end: the site's footer. */
const FOOTER =
  /^(?:reply to this|to respond|respond (?:to|directly)|this (?:lead|message|email|inquiry) (?:was|is) (?:sent|from)|you(?:'re| are)? receiv|©|\(c\)|copyright|unsubscribe|privacy|terms of|manage (?:your )?(?:email|notification|lead)|view (?:this |the )?(?:lead|message)|log ?in to|sent (?:by|from|via|through)|apartments\.com,? (?:llc|inc)|costar)/i;

const MESSAGE_MAX = 2000;
const RAW_BODY_MAX = 4000;
const EMAIL_RE = /[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function domainOf(address: string | null | undefined): string {
  const { email } = parseEmailAddress(address);
  const at = email.lastIndexOf("@");
  return at < 0 ? "" : email.slice(at + 1);
}

const onDomains = (domain: string, domains: string[]) =>
  domains.some((d) => domain === d || domain.endsWith(`.${d}`));

/** The listing site an email comes from, by its sender's domain. */
export function detectListingSite(from: string | null | undefined): ListingSite | null {
  const domain = domainOf(from);
  return (domain && LISTING_SITES.find((s) => onDomains(domain, s.domains))) || null;
}

/** A renter's own address in `raw`: not a listing site's (its relays), not ours. */
function renterAddress(raw: string | null | undefined): string | null {
  const email = raw?.match(EMAIL_RE)?.[0]?.toLowerCase();
  if (!email) return null;
  const domain = email.slice(email.lastIndexOf("@") + 1);
  if (LISTING_SITES.some((s) => onDomains(domain, s.domains)) || isOurInboundAddress(email)) return null;
  return email;
}

function toLines(body: string): string[] {
  return body
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")
    .split("\n")
    .map((l) => l.replace(/^[\s:|•>]+/, "").replace(/\s+/g, " ").trim());
}

function matchLabel(line: string): { field: Field; value: string } | null {
  for (const { field, re } of LABEL_RES) {
    const m = line.match(re);
    if (m) return { field, value: (m[1] ?? "").trim() };
  }
  return null;
}

const isStreetLine = (line: string | undefined) => !!line && /^\d{1,6}\s+\S/.test(line) && !matchLabel(line);
const isCityLine = (line: string | undefined) => !!line && /^[a-z .'-]+,\s*[a-z]{2}\s+\d{5}\b/i.test(line);

function readFields(body: string): Partial<Record<Field, string>> {
  const lines = toLines(body);
  const found: Partial<Record<Field, string>> = {};
  const nextFilled = (from: number) => {
    for (let j = from + 1; j < lines.length; j++) if (lines[j]) return j;
    return -1;
  };

  for (let i = 0; i < lines.length; i++) {
    const hit = matchLabel(lines[i]);
    if (!hit || found[hit.field]) continue;
    let value = hit.value;
    let end = i;
    if (!value) {
      // Label and value stacked on two lines.
      const next = nextFilled(i);
      if (next < 0 || matchLabel(lines[next]) || FOOTER.test(lines[next])) continue;
      value = lines[next];
      end = next;
    }
    if (hit.field === "message") {
      // A message runs on, paragraphs included, to the next label or the footer.
      const parts = [value];
      let j = end + 1;
      for (; j < lines.length && !matchLabel(lines[j]) && !FOOTER.test(lines[j]); j++) parts.push(lines[j]);
      value = parts.join("\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, MESSAGE_MAX);
      end = j - 1;
    }
    if (hit.field === "property" && !found.address && isStreetLine(lines[end + 1])) {
      // The address printed under the property name, on one line or two.
      const street = lines[end + 1];
      const city = lines[end + 2];
      found.address = !street.includes(",") && isCityLine(city) ? `${street}, ${city}` : street;
      end += street.includes(",") || !isCityLine(city) ? 1 : 2;
    }
    found[hit.field] = value;
    i = end;
  }
  return found;
}

/** Table rows "<td>Name</td><td>Jane</td>" read as "Name: Jane". */
const cellsAsLabels = (html: string) => html.replace(/<\/t[dh]>\s*<t[dh]\b[^>]*>/gi, ": ");

function clean(value: string | null | undefined, max = 200): string | null {
  const v = (value ?? "").trim();
  return v ? v.slice(0, max) : null;
}

/** "Jane Doe via Apartments.com" → "Jane Doe". */
function nameFromSender(fromName: string | null | undefined, site: ListingSite): string | null {
  const m = (fromName ?? "").match(/^(.+?)\s+(?:via|from|through)\s+(.+)$/i);
  if (!m || !site.domains.some((d) => m[2].toLowerCase().includes(d.split(".")[0]))) return null;
  return m[1].replace(/^"|"$/g, "").trim() || null;
}

function validName(value: string | null): string | null {
  return value && !value.includes("@") && /\p{L}/u.test(value) ? value.slice(0, 120) : null;
}

/** "New Lead from Apartments.com for Hamilton House" → "Hamilton House". */
function propertyFromSubject(subject: string, site: ListingSite): string | null {
  const m = subject.replace(/^((re|fwd?)\s*:\s*)+/i, "").match(/\b(?:for|interested in|about)\s+(.+)$/i);
  if (!m) return null;
  const name = m[1]
    .split(/\s+(?:from|on|via)\s+|\s+[-–—|]\s+|\s*\(/i)[0]
    .trim()
    .replace(/[.!]+$/, "");
  if (name.length < 3 || /^(you|your)\b/i.test(name) || name.toLowerCase().includes(site.label.toLowerCase())) return null;
  return name.slice(0, 120);
}

function parseBeds(beds: string | undefined, unit: string | undefined): number | null {
  const clamp = (n: number) => (n >= 0 && n <= 10 ? n : null);
  if (beds) {
    if (/studio/i.test(beds)) return 0;
    const n = beds.match(/\d+/);
    if (n) return clamp(Number(n[0]));
  }
  if (unit) {
    if (/\bstudio\b/i.test(unit)) return 0;
    const n = unit.match(/(\d+)\s*-?\s*(?:bed|br\b|bd\b)/i);
    if (n) return clamp(Number(n[1]));
  }
  return null;
}

/** "11/15/2026", "2026-11-15", "Nov 15, 2026", "Sunday, November 15th 2026" → "2026-11-15". */
export function toIsoDate(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  const ymd = (): [number, number, number] | null => {
    let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\b/);
    if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
    m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\b/);
    if (m) return [m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]), Number(m[1]), Number(m[2])];
    m = v.match(/^(?:[a-z]{3,9},?\s+)?([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i);
    const month = m ? MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) : -1;
    if (m && month >= 0) return [Number(m[3]), month + 1, Number(m[2])];
    return null;
  };
  const parts = ymd();
  if (!parts) return null;
  const [y, mo, d] = parts;
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * The renter inquiry in a listing-site email, or null when the email is not
 * from a listing site or is the site's account mail.
 */
export function parseListingLeadEmail(email: ListingEmail): ParsedListingLead | null {
  const site = detectListingSite(email.from);
  if (!site) return null;

  const subject = email.subject.trim();
  const replyToRenter = renterAddress(email.replyTo);
  const inquiry =
    (site.inquirySubject.test(subject) && !ACCOUNT_SUBJECT.test(subject) && !/^re\s*:/i.test(subject)) ||
    !!replyToRenter;
  if (!inquiry) return null;

  const text = email.text?.trim() ?? "";
  const html = email.html?.trim() ?? "";
  const fromText = text ? readFields(text) : {};
  const fromHtml = html ? readFields(htmlToText(cellsAsLabels(html))) : {};
  // The text part wins; the HTML fills in what it lacks.
  const f: Partial<Record<Field, string>> = { ...fromHtml, ...fromText };

  const e164 = f.phone ? extractPhone(f.phone) : null;
  const phone = e164 ? formatPhone(e164) : null;
  const renterEmail = replyToRenter ?? renterAddress(f.email);
  const fullName = [f.firstName, f.lastName].filter(Boolean).join(" ");
  const unit = clean(f.unit, 120);
  const moveIn = clean(f.moveIn, 60);

  const reviewReasons: string[] = [];
  if (!renterEmail && !phone) reviewReasons.push("no renter email or phone number found in the email");

  return {
    source: site.source,
    sourceLabel: site.label,
    name: validName(clean(f.name) ?? clean(fullName) ?? nameFromSender(email.fromName, site)),
    email: renterEmail,
    phone,
    message: clean(f.message, MESSAGE_MAX),
    propertyName: clean(f.property, 120) ?? propertyFromSubject(subject, site),
    propertyAddress: clean(f.address),
    unit,
    beds: parseBeds(f.beds, f.unit),
    moveIn,
    moveInDate: toIsoDate(moveIn),
    needsReview: reviewReasons.length > 0,
    reviewReasons,
    subject,
    rawBody: text || htmlToText(html),
  };
}

/**
 * leads.notes for a listing lead. One that needs review leads with why, and
 * carries the raw subject and body so it can be worked without the inbox.
 * "Unit:" and "Move-in:" are the labels lead-context.ts reads back.
 */
export function listingLeadNotes(lead: ParsedListingLead, reviewReasons: string[] = lead.reviewReasons): string {
  const where = [lead.propertyName, lead.propertyAddress].filter(Boolean).join(", ");
  const prefs = [lead.unit && `Unit: ${lead.unit}`, lead.moveIn && `Move-in: ${lead.moveIn}`].filter(Boolean).join(" · ");
  const summary = [`${lead.sourceLabel}${where ? ` · ${where}` : ""}`, prefs, lead.message && `Message: ${lead.message}`]
    .filter(Boolean)
    .join("\n");
  if (reviewReasons.length === 0) return summary;
  const body =
    lead.rawBody.length > RAW_BODY_MAX ? `${lead.rawBody.slice(0, RAW_BODY_MAX)}\n[… cut; the full email is in the admin inbox]` : lead.rawBody;
  return [
    `Needs review: ${reviewReasons.join("; ")}.`,
    summary,
    "",
    `Subject: ${lead.subject}`,
    "",
    body || "(empty body)",
  ].join("\n");
}
