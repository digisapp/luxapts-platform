/**
 * Centralized email HTML templates.
 * All templates use the same dark luxury brand design.
 * Call escHtml() on any user-supplied data before interpolating.
 */
import { telHref } from "@/lib/utils";
import { buildEmailShell } from "@/lib/email/branded";
import { firstNameOf } from "@/lib/email/names";

export { firstNameOf };

/**
 * The header is the wordmark as plain text, deliberately: no image. Remote
 * images and inline attachments both count against a sender in spam scoring.
 * The stack is the same system-font stack the site uses (SF Pro on Apple,
 * Segoe UI on Windows, Roboto on Android), so email and site match.
 */
const WORDMARK_FONT =
  "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, 'Helvetica Neue', Helvetica, Arial, sans-serif";

// Text colours on the #141414 card. Each clears WCAG AA (4.5:1) on it; the
// earlier #777 / #555 greys did not, and dark-mode clients lowered them further.
const INK = "#ffffff";
const MUTED = "#9a9a9a";
const FINE = "#8a8a8a";

export function escHtml(str: string | null | undefined): string {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}


// ─── Shared layout wrapper ────────────────────────────────────────────────────

interface LayoutOptions {
  /**
   * Footer links. Defaults suit account holders; transactional mail to
   * non-members passes its own, and an empty array drops the footer entirely
   * (for mail whose card already carries its own fine print).
   */
  footerLinks?: { label: string; href: string }[];
}

function layout(content: string, preheader = "", options: LayoutOptions = {}): string {
  const links = options.footerLinks ?? [
    { label: "Manage preferences", href: "https://staycio.com/account" },
    { label: "Visit site", href: "https://staycio.com" },
  ];
  const footerLinks = links
    .map(
      (l) =>
        `<a href="${escHtml(l.href)}" style="color:${FINE};text-decoration:underline;">${escHtml(l.label)}</a>`
    )
    .join("\n            &nbsp;&middot;&nbsp;\n            ");

  return `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="dark" />
<meta name="supported-color-schemes" content="dark" />
<title>Staycio</title>
<style>
  :root { color-scheme: dark; supported-color-schemes: dark; }
  a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
  @media only screen and (max-width: 620px) {
    .card { padding: 28px 20px 24px 20px !important; }
    .h1 { font-size: 22px !important; }
  }
</style>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<![endif]-->
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#0a0a0a;">${escHtml(preheader)}${"&zwnj;&nbsp;".repeat(40)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0a0a0a;padding:40px 16px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

      <!-- Header -->
      <tr>
        <td style="padding:0 0 28px 0;text-align:center;">
          <a href="https://staycio.com" style="text-decoration:none;display:inline-block;font-family:${WORDMARK_FONT};font-size:24px;font-weight:700;color:${INK};letter-spacing:-0.6px;line-height:32px;">Staycio</a>
        </td>
      </tr>

      <!-- Card -->
      <tr>
        <td class="card" style="background:#141414;border:1px solid #2a2a2a;border-radius:16px;padding:40px 40px 32px 40px;">
          ${content}
        </td>
      </tr>

${links.length > 0 ? `
      <!-- Footer -->
      <tr>
        <td style="padding:24px 0 0 0;text-align:center;color:${FINE};font-size:12px;line-height:1.6;">
          <p style="margin:0 0 8px 0;">Staycio &middot; Independent apartment search for Miami</p>
          <p style="margin:0;">
            ${footerLinks}
          </p>
        </td>
      </tr>` : ""}

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function badge(text: string, color = "#262626", textColor = INK): string {
  return `<span style="display:inline-block;background:${color};color:${textColor};font-size:11px;font-weight:600;padding:4px 10px;border-radius:99px;letter-spacing:0.6px;text-transform:uppercase;line-height:1.4;">${escHtml(text)}</span>`;
}

/**
 * Table-wrapped button. Outlook on Windows drops padding on a styled anchor,
 * so the colour and size live on the cell and the VML block draws the pill.
 */
function primaryButton(label: string, href: string): string {
  const safeHref = escHtml(href);
  const safeLabel = escHtml(label);
  return `<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeHref}" style="height:44px;v-text-anchor:middle;width:260px;" arcsize="50%" strokecolor="#ffffff" fillcolor="#ffffff">
<w:anchorlock/>
<center style="color:#000000;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;">${safeLabel}</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-table;">
  <tr>
    <td align="center" style="background:#ffffff;border-radius:99px;mso-padding-alt:0;">
      <a href="${safeHref}" style="display:inline-block;background:#ffffff;color:#000000;font-size:14px;font-weight:600;text-decoration:none;padding:13px 28px;border-radius:99px;line-height:18px;">${safeLabel}</a>
    </td>
  </tr>
</table>
<!--<![endif]-->`;
}

function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:7px 0;color:${MUTED};font-size:13px;width:120px;vertical-align:top;">${escHtml(label)}</td>
    <td style="padding:7px 0;color:#e8e8e8;font-size:13px;">${value}</td>
  </tr>`;
}

function divider(): string {
  return `<tr><td colspan="2"><div style="border-top:1px solid #2a2a2a;margin:16px 0;"></div></td></tr>`;
}

// ─── Templates ────────────────────────────────────────────────────────────────

/** New lead notification to admin/team */
export function newLeadEmail(data: {
  leadId: string;
  city: string;
  source: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
  beds?: number | null;
  moveInDate?: string | null;
  notes?: string | null;
  buildingName?: string | null;
  assignedAgentName?: string | null;
}): string {
  const budgetStr =
    data.budgetMin || data.budgetMax
      ? [data.budgetMin ? `$${data.budgetMin.toLocaleString()}` : null, data.budgetMax ? `$${data.budgetMax.toLocaleString()}` : null]
          .filter(Boolean)
          .join(" – ")
      : null;

  const content = `
    <div style="margin-bottom:24px;">
      ${badge("New Lead", "#1a1a2e", "#818cf8")}
      <h2 style="color:#ffffff;font-size:24px;font-weight:700;margin:16px 0 4px 0;letter-spacing:-0.3px;">
        ${data.name ? escHtml(data.name) : "Anonymous Inquiry"}
      </h2>
      <p style="color:#777;font-size:14px;margin:0;">${escHtml(data.city)} · via ${escHtml(data.source)}</p>
    </div>

    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      ${data.email ? row("Email", `<a href="mailto:${escHtml(data.email)}" style="color:#60a5fa;">${escHtml(data.email)}</a>`) : ""}
      ${data.phone ? row("Phone", `<a href="tel:${escHtml(telHref(data.phone))}" style="color:#60a5fa;">${escHtml(data.phone)}</a>`) : ""}
      ${divider()}
      ${data.beds !== null && data.beds !== undefined ? row("Bedrooms", data.beds === 0 ? "Studio" : String(data.beds)) : ""}
      ${budgetStr ? row("Budget", escHtml(budgetStr) + "/mo") : ""}
      ${data.moveInDate ? row("Move-in", escHtml(data.moveInDate)) : ""}
      ${data.buildingName ? row("Building", escHtml(data.buildingName)) : ""}
      ${data.notes ? row("Notes", `<span style="white-space:pre-wrap;">${escHtml(data.notes)}</span>`) : ""}
      ${data.assignedAgentName ? (divider() + row("Assigned to", escHtml(data.assignedAgentName))) : ""}
    </table>

    <div style="margin-top:32px;">
      ${primaryButton("View in Admin →", `https://staycio.com/admin/leads`)}
    </div>

    <p style="color:#555;font-size:11px;margin-top:24px 0 0 0;">Lead ID: ${escHtml(data.leadId)}</p>
  `;

  return layout(content, `New lead from ${data.name || "anonymous"} in ${data.city}`);
}

/** Tour request confirmation to the renter */
export function tourConfirmationEmail(data: {
  name: string;
  buildingName: string;
  buildingAddress: string;
  preferredDate?: string | null;
  preferredTime?: string | null;
  leasingPhone?: string | null;
  leasingEmail?: string | null;
  buildingId: string;
}): string {
  const content = `
    <div style="margin-bottom:24px;">
      ${badge("Tour Requested", "#1a2a1a", "#4ade80")}
      <h2 style="color:#ffffff;font-size:24px;font-weight:700;margin:16px 0 4px 0;">
        You&rsquo;re on the list, ${escHtml(data.name)}!
      </h2>
      <p style="color:#777;font-size:14px;margin:0;">Your tour request at ${escHtml(data.buildingName)} has been received.</p>
    </div>

    <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;padding:20px 24px;margin:24px 0;">
      <p style="color:#aaa;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;margin:0 0 12px 0;">Tour Details</p>
      <table width="100%" cellpadding="0" cellspacing="0">
        ${row("Building", escHtml(data.buildingName))}
        ${row("Address", escHtml(data.buildingAddress))}
        ${data.preferredDate ? row("Preferred date", escHtml(data.preferredDate)) : ""}
        ${data.preferredTime ? row("Preferred time", escHtml(data.preferredTime)) : ""}
      </table>
    </div>

    <p style="color:#aaa;font-size:14px;line-height:1.6;margin:0 0 24px 0;">
      The leasing team will reach out within 24 hours to confirm your appointment.
      ${data.leasingPhone ? ` You can also call them directly at <a href="tel:${escHtml(data.leasingPhone)}" style="color:#60a5fa;">${escHtml(data.leasingPhone)}</a>.` : ""}
    </p>

    ${primaryButton("View Building →", `https://staycio.com/buildings/${escHtml(data.buildingId)}`)}
  `;

  return layout(content, `Tour request confirmed for ${data.buildingName}`);
}

/** Saved search alert digest */
export function savedSearchAlertEmail(data: {
  recipientName?: string | null;
  searches: Array<{
    name: string;
    url: string;
    resultCount: number;
    topBuildings: Array<{ name: string; address: string; minPrice?: number }>;
  }>;
}): string {
  const greeting = data.recipientName ? `Hey ${escHtml(data.recipientName)},` : "Hey there,";

  const searchSections = data.searches
    .map(
      (s) => `
      <div style="margin-bottom:28px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <span style="color:#e5e5e5;font-size:15px;font-weight:600;">${escHtml(s.name)}</span>
          <span style="color:#777;font-size:12px;">${s.resultCount} match${s.resultCount !== 1 ? "es" : ""}</span>
        </div>
        ${s.topBuildings
          .map(
            (b) => `
          <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;padding:14px 18px;margin-bottom:8px;">
            <div style="color:#ffffff;font-size:14px;font-weight:600;margin-bottom:2px;">${escHtml(b.name)}</div>
            <div style="color:#777;font-size:12px;">${escHtml(b.address)}</div>
            ${b.minPrice ? `<div style="color:#4ade80;font-size:13px;font-weight:600;margin-top:4px;">From $${b.minPrice.toLocaleString()}/mo</div>` : ""}
          </div>`
          )
          .join("")}
        <a href="${escHtml(s.url)}" style="color:#60a5fa;font-size:13px;text-decoration:none;">View all results →</a>
      </div>`
    )
    .join(`<div style="border-top:1px solid #2a2a2a;margin:20px 0;"></div>`);

  const content = `
    <h2 style="color:#ffffff;font-size:22px;font-weight:700;margin:0 0 4px 0;">${greeting}</h2>
    <p style="color:#777;font-size:14px;margin:0 0 28px 0;">
      Here&rsquo;s your daily apartment digest — ${data.searches.length} saved search${data.searches.length !== 1 ? "es" : ""} updated.
    </p>

    ${searchSections}

    <p style="color:#555;font-size:12px;margin-top:24px;line-height:1.6;">
      To stop these emails,
      <a href="https://staycio.com/account" style="color:#555;text-decoration:underline;">manage your alerts</a> in your account settings.
    </p>
  `;

  return layout(content, `${data.searches.length} saved search update${data.searches.length !== 1 ? "s" : ""} from Staycio`);
}

/** Welcome email after signup */
export function welcomeEmail(data: { name?: string | null; email: string }): string {
  const greeting = data.name ? `Welcome, ${escHtml(data.name)}!` : "Welcome to Staycio!";

  const content = `
    <div style="text-align:center;margin-bottom:32px;">
      <div style="font-size:48px;margin-bottom:16px;">🏢</div>
      <h2 style="color:#ffffff;font-size:28px;font-weight:700;margin:0 0 8px 0;">${greeting}</h2>
      <p style="color:#777;font-size:15px;margin:0;">Your account is ready. Let&rsquo;s find your perfect home.</p>
    </div>

    <div style="display:grid;gap:12px;margin-bottom:32px;">
      ${[
        ["🔍", "AI Search", "Describe what you want in plain English and we&rsquo;ll find it."],
        ["💜", "Save Favorites", "Bookmark buildings and get email alerts when prices drop."],
        ["🎙️", "Talk to Stacy", "Our AI video assistant knows every building inside out."],
      ]
        .map(
          ([icon, title, desc]) => `
        <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;padding:16px 20px;display:flex;gap:14px;align-items:flex-start;">
          <span style="font-size:20px;flex-shrink:0;">${icon}</span>
          <div>
            <div style="color:#ffffff;font-size:14px;font-weight:600;margin-bottom:2px;">${title}</div>
            <div style="color:#777;font-size:13px;">${desc}</div>
          </div>
        </div>`
        )
        .join("")}
    </div>

    <div style="text-align:center;">
      ${primaryButton("Start Searching →", "https://staycio.com/search")}
    </div>
  `;

  return layout(content, "Your Staycio account is ready");
}

/** New showing lead available — sent to certified showers for the building (no client PII pre-claim) */
export function newShowingLeadEmail(data: {
  displayName: string;
  buildingName: string;
  neighborhood?: string | null;
  preferredDate: string;
  preferredTime?: string | null;
  unitType?: string | null;
  expiresAt?: string | null;
}): string {
  const content = `
    ${badge("New Showing Available", "#1a1a2a", "#a5b4fc")}
    <h2 style="color:#ffffff;font-size:22px;font-weight:700;margin:16px 0 8px 0;">A tour just opened up at ${escHtml(data.buildingName)}</h2>
    <p style="color:#999;font-size:14px;margin:0 0 24px 0;">Hi ${escHtml(data.displayName)} — you're certified for this building, so you get first crack at it. Claims are first-come, first-served.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      ${row("Building", escHtml(data.buildingName))}
      ${data.neighborhood ? row("Neighborhood", escHtml(data.neighborhood)) : ""}
      ${row("Date", escHtml(data.preferredDate))}
      ${data.preferredTime ? row("Time", escHtml(data.preferredTime)) : ""}
      ${data.unitType ? row("Unit type", escHtml(data.unitType)) : ""}
      ${divider()}
      ${row("Showing fee", "$150 on approved debrief")}
      ${data.expiresAt ? row("Claim before", escHtml(new Date(data.expiresAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }))) : ""}
    </table>

    <p style="color:#777;font-size:13px;margin:0 0 16px 0;">Client contact details unlock after you claim.</p>

    <div style="text-align:center;">
      ${primaryButton("View & Claim →", "https://staycio.com/shower/leads")}
    </div>
  `;

  return layout(content, `New showing at ${data.buildingName} — ${data.preferredDate}`);
}

/** Price drop alert for a favorited building */
export function priceDropAlertEmail(data: {
  name?: string | null;
  buildingName: string;
  buildingId: string;
  neighborhood?: string | null;
  drops: Array<{
    unitLabel: string;
    oldRent: number;
    newRent: number;
  }>;
}): string {
  const fmt = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
  const content = `
    ${badge("Price Drop", "#2a1a1a", "#f87171")}
    <h2 style="color:#ffffff;font-size:22px;font-weight:700;margin:16px 0 8px 0;">Prices just dropped at ${escHtml(data.buildingName)}</h2>
    <p style="color:#999;font-size:14px;margin:0 0 24px 0;">${data.name ? `${escHtml(data.name)}, a` : "A"} building you favorited lowered pricing${data.neighborhood ? ` in ${escHtml(data.neighborhood)}` : ""}.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      ${data.drops
        .map((d) =>
          row(
            escHtml(d.unitLabel),
            `<span style="color:#777;text-decoration:line-through;">${fmt(d.oldRent)}</span>&nbsp;&nbsp;<span style="color:#4ade80;font-weight:600;">${fmt(d.newRent)}</span>&nbsp;<span style="color:#4ade80;font-size:12px;">(−${fmt(d.oldRent - d.newRent)}/mo)</span>`
          )
        )
        .join("")}
    </table>

    <div style="text-align:center;">
      ${primaryButton("View Building →", `https://staycio.com/buildings/${escHtml(data.buildingId)}`)}
    </div>
  `;

  return layout(content, `Price drop at ${data.buildingName}`);
}

// ─── Microsite inquiry reply ──────────────────────────────────────────────────
//
// Deliberately NOT a designed template. A microsite signup gets a short
// personal note from Stacy, the way a leasing agent would write back: plain
// paragraphs, one question, a signature. Same copy for every building,
// whether it is leasing today or still under construction (owner's call,
// 2026-10-02): the goal is a reply, not a status report.

/**
 * The form's unit choice in its canonical English form, or null when the
 * visitor was unsure or the value is unrecognised.
 *
 * The microsite <option>s carry no value attribute, so a visitor using the
 * browser's page translation submits the translated label: "2 habitaciones"
 * reached the database and then a subject line. Common translations are
 * mapped back here.
 */
export function normalizeUnitType(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim().toLowerCase();
  if (!t) return null;
  if (/^(studio|estudio|monoambiente|est[uú]dio|kitnet)\b/.test(t)) return "Studio";
  const m = t.match(/^(\d+)\s*(bed|br\b|habitaci|dormitori|rec[aá]mara|cuarto|quarto|chambre|pi[eè]ce|zimmer|camer)/);
  if (m) return `${m[1]} Bedroom`;
  return null;
}

/**
 * The form's move-in choice when it is one of the English options the forms
 * offer, else null. A translated value ("Cuarto trimestre de 2026") is dropped
 * rather than pasted into an English sentence.
 */
export function normalizeMoveIn(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim();
  if (/^(q[1-4]\s+\d{4}|(early|mid|late)\s+\d{4}|\d{4}|as soon as possible|next \d+ days)$/i.test(t)) return t;
  if (/^(january|february|march|april|may|june|july|august|september|october|november|december)(\s+\d{4})?$/i.test(t)) return t;
  return null;
}

/** "1 Bedroom" -> "a 1-bedroom apartment", "Studio" -> "a studio apartment", else "an apartment". */
function unitPhrase(unitType: string | null | undefined): string {
  const t = normalizeUnitType(unitType);
  if (t === "Studio") return "a studio apartment";
  const m = t?.match(/^(\d+) Bedroom$/);
  if (m) return `a ${m[1]}-bedroom apartment`;
  return "an apartment";
}

/** " in Q4 2026", " in the next 30 days", " as soon as possible", "" when flexible or unknown. */
function timingPhrase(moveIn: string | null | undefined): string {
  const t = normalizeMoveIn(moveIn) ?? "";
  if (!t) return "";
  if (/^as soon as/i.test(t)) return " as soon as possible";
  if (/^next\s/i.test(t)) return ` in the ${t.toLowerCase()}`;
  if (/^early|^late|^mid/i.test(t)) return ` in ${t.charAt(0).toLowerCase()}${t.slice(1)}`;
  return ` in ${t}`;
}

/** "Downtown 6 Miami — 1 Bedroom Availability"; city appended unless the name carries it. */
export function micrositeInquirySubject(
  buildingName: string,
  city?: string | null,
  unitType?: string | null
): string {
  const place =
    city && !buildingName.toLowerCase().includes(city.toLowerCase()) ? `${buildingName} ${city}` : buildingName;
  const t = normalizeUnitType(unitType);
  const what = t ? `${t} Availability` : "Availability";
  return `${place} \u2014 ${what}`;
}

/** "Downtown 6" + "Miami" -> "Downtown 6 Miami"; "Kenect Miami" stays as is. */
function placeName(buildingName: string, city: string): string {
  return buildingName.toLowerCase().includes(city.toLowerCase()) ? buildingName : `${buildingName} ${city}`;
}

function paragraphsToEmail(paragraphs: string[], subject: string): { html: string; text: string; bodyHtml: string } {
  const text = paragraphs.join("\n\n") + "\n";
  const bodyHtml = paragraphs.map((p) => `<p style="margin:0 0 18px 0;">${escHtml(p).replace(/\n/g, "<br>")}</p>`).join("\n");
  return { html: buildEmailShell(bodyHtml, null, subject), text, bodyHtml };
}

/**
 * Follow-up to a microsite lead who left an email but no phone number (the
 * forms only started asking for one in September). Same plain note from
 * Stacy, asking the two things the team needs to work the lead: the move-in
 * date and a number to text. Owner's wording, 2026-10-05.
 */
export function micrositeFollowUpEmail(data: {
  name: string | null;
  buildingName: string;
  city: string;
  unitType?: string | null;
}): { html: string; text: string; bodyHtml: string } {
  const firstName = firstNameOf(data.name);
  const unit = normalizeUnitType(data.unitType);
  const about =
    unit === "Studio"
      ? `a studio at ${placeName(data.buildingName, data.city)}`
      : unit
        ? `a ${unit.replace(" Bedroom", "-bedroom")} at ${placeName(data.buildingName, data.city)}`
        : placeName(data.buildingName, data.city);

  const paragraphs = [
    firstName ? `Hi ${firstName},` : "Hi there,",
    `We received your inquiry about ${about}. When are you looking to move in?`,
    `I can send you the available options and schedule an in-person tour once we find a unit that works for you.`,
    `What\u2019s the best phone number to reach you? I can also text you the options directly.`,
    `Best,\nStacy`,
  ];
  return paragraphsToEmail(paragraphs, micrositeInquirySubject(data.buildingName, data.city, data.unitType));
}

export function micrositeInquiryEmail(data: {
  name: string;
  buildingName: string;
  city: string;
  moveIn?: string | null;
  unitType?: string | null;
}): { html: string; text: string; bodyHtml: string } {
  const firstName = firstNameOf(data.name) ?? "there";
  const place = placeName(data.buildingName, data.city);
  const unit = unitPhrase(data.unitType);
  const unitShort = unit.replace(/^an? /, "").replace(/ apartment$/, ""); // "1-bedroom", "studio", "apartment"
  const options = unitShort === "apartment" ? "available options" : `available ${unitShort} options`;

  const paragraphs = [
    `Hi ${firstName},`,
    `Thanks for your interest in ${place}! I saw that you\u2019re looking for ${unit}${timingPhrase(data.moveIn)}.`,
    `Do you have an ideal move-in date?`,
    `Once I know your timing, I can send you the ${options}, pricing, and floor plans. If you\u2019re in ${data.city}, I\u2019d also be happy to schedule a private tour and show you the available units in person.`,
    `Just let me know what works best for you.`,
    `Best,\nStacy`,
  ];

  return paragraphsToEmail(paragraphs, micrositeInquirySubject(data.buildingName, data.city, data.unitType));
}
