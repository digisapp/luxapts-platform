/**
 * Centralized email HTML templates.
 * All templates use the same dark luxury brand design.
 * Call escHtml() on any user-supplied data before interpolating.
 */

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

function layout(content: string, preheader = ""): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Staycio</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escHtml(preheader)}</div>` : ""}
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

      <!-- Header -->
      <tr>
        <td style="padding:0 0 32px 0;text-align:center;">
          <a href="https://staycio.com" style="text-decoration:none;">
            <span style="font-size:24px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">🏢 Staycio</span>
          </a>
        </td>
      </tr>

      <!-- Card -->
      <tr>
        <td style="background:#141414;border:1px solid #2a2a2a;border-radius:16px;padding:40px 40px 32px 40px;">
          ${content}
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="padding:24px 0 0 0;text-align:center;color:#555;font-size:12px;line-height:1.6;">
          <p style="margin:0 0 8px 0;">Staycio · AI-Powered Luxury Apartment Search</p>
          <p style="margin:0;">
            <a href="https://staycio.com/account" style="color:#555;text-decoration:underline;">Manage preferences</a>
            &nbsp;·&nbsp;
            <a href="https://staycio.com" style="color:#555;text-decoration:underline;">Visit site</a>
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function badge(text: string, color = "#1a2a1a", textColor = "#4ade80"): string {
  return `<span style="display:inline-block;background:${color};color:${textColor};font-size:11px;font-weight:600;padding:3px 10px;border-radius:99px;letter-spacing:0.5px;text-transform:uppercase;">${escHtml(text)}</span>`;
}

function primaryButton(label: string, href: string): string {
  return `<a href="${escHtml(href)}" style="display:inline-block;background:#ffffff;color:#000000;font-size:14px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:99px;margin-top:8px;">${escHtml(label)}</a>`;
}

function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:8px 0;color:#777;font-size:13px;width:140px;vertical-align:top;">${escHtml(label)}</td>
    <td style="padding:8px 0;color:#e5e5e5;font-size:13px;">${value}</td>
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
      ${data.phone ? row("Phone", `<a href="tel:${escHtml(data.phone)}" style="color:#60a5fa;">${escHtml(data.phone)}</a>`) : ""}
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
