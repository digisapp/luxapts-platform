/**
 * Sample Apartments.com lead emails, as the Resend webhook sees them
 * (bare From, Reply-To, subject, text and HTML parts).
 *
 * Synthetic: modelled on the portal's lead notifications, with reserved
 * example.com / 555-01xx contact details. When the first real lead arrives,
 * compare it with these and add it here (renter details replaced).
 */
import type { ListingEmail } from "@/lib/email/parse-listing-lead";

const text = `You have a new lead from Apartments.com

Jordan Rivera is interested in Bayline Residences.

Lead Details
Name: Jordan Rivera
Email: jordan.rivera@example.com
Phone: (305) 555-0142
Move-In Date: 11/15/2026
Beds: 2
Floor Plan: B2 - 2 Bed / 2 Bath

Message:
Hi! I'm interested in a 2 bedroom with a balcony.

Is parking included, and do you allow a small dog?

Property
Bayline Residences
1600 NE 1st Ave
Miami, FL 33132

Reply to this email to respond to Jordan directly.
This lead was sent to you by Apartments.com, a CoStar Group company.
© 2026 CoStar Group, Inc. Privacy Policy | Unsubscribe`;

const row = (label: string, value: string) =>
  `<tr><td style="padding:6px 12px;color:#6b6b6b;font:14px Arial" valign="top">${label}</td><td style="padding:6px 12px;font:14px Arial">${value}</td></tr>`;

const html = `<!DOCTYPE html><html><head><title>New Lead</title><style>td{font-family:Arial}</style></head>
<body><!--[if mso]><table><tr><td><![endif]-->
<table width="600" cellpadding="0" cellspacing="0"><tr><td>
<h1 style="font:bold 22px Arial">You have a new lead from Apartments.com</h1>
<p>Jordan Rivera is interested in <strong>Bayline Residences</strong>.</p>
<table cellpadding="0" cellspacing="0">
${row("Name", "Jordan Rivera")}
${row("Email", '<a href="mailto:jordan.rivera@example.com">jordan.rivera@example.com</a>')}
${row("Phone", '<a href="tel:3055550142">(305) 555-0142</a>')}
${row("Move-In Date", "11/15/2026")}
${row("Beds", "2")}
${row("Floor Plan", "B2 - 2 Bed / 2 Bath")}
${row("Property", "Bayline Residences<br>1600 NE 1st Ave<br>Miami, FL 33132")}
${row("Message", "Hi! I&#39;m interested in a 2 bedroom with a balcony.<br><br>Is parking included, and do you allow a small dog?")}
</table>
<p>Reply to this email to respond to Jordan directly.</p>
<p style="color:#999;font-size:11px">This lead was sent to you by Apartments.com, a CoStar Group company.<br>&copy; 2026 CoStar Group, Inc. <a href="https://www.apartments.com/privacy">Privacy Policy</a> | <a href="https://www.apartments.com/unsubscribe">Unsubscribe</a></p>
</td></tr></table>
<!--[if mso]></td></tr></table><![endif]--></body></html>`;

export const APARTMENTS_COM_LEAD: ListingEmail = {
  from: "noreply@email.apartments.com",
  fromName: "Apartments.com",
  replyTo: "jordan.rivera@example.com",
  subject: "New Apartments.com Lead for Bayline Residences",
  text,
  html,
};

/**
 * Account mail, not a lead. Sender, Reply-To domain and subject are those of
 * the real one that arrived on 2026-10-13; the body is made up.
 */
export const APARTMENTS_COM_WELCOME: ListingEmail = {
  from: "landlord-info@email.apartments.com",
  fromName: "Apartments.com",
  replyTo: "landlord-info@reply.email.apartments.com",
  subject: "Welcome to the Apartments.com Network",
  text: "Welcome to the Apartments.com Network! Start getting more leads for your property today.",
  html: "",
};
