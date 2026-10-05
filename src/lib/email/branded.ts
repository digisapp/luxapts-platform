import { escapeHtml } from "@/lib/utils";

/**
 * The shell around every email the inbox sends: manual replies, AI drafts,
 * the round-trip test and the first note to a microsite signup. Deliberately
 * plain (white, system font, paragraphs, no header or footer), so a reply
 * from Stacy reads like a person wrote it. The sender identity carries the
 * brand; the body does not need to.
 */
export function buildEmailShell(bodyHtml: string, recipientName?: string | null, title?: string | null): string {
  const greeting = recipientName ? `<p style="margin:0 0 18px 0;">Hi ${escapeHtml(recipientName)},</p>\n` : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(title || "")}</title>
</head>
<body style="margin:0;padding:24px 16px;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;">
<div style="max-width:560px;">
${greeting}${bodyHtml}
</div>
</body>
</html>`;
}

/** Plain text → simple paragraphs, for the manual compose path. */
export function textToHtml(text: string): string {
  return text
    .split(/\r?\n\r?\n/)
    .map((para) => `<p style="margin:0 0 18px 0;">${escapeHtml(para).replace(/\r?\n/g, "<br>")}</p>`)
    .join("\n");
}

/** HTML → readable plain text, for the text/plain part and list previews. */
export function htmlToText(html: string): string {
  return html
    // The <head> (title) and HTML comments (Outlook's <!--[if mso]> blocks,
    // whose PixelsPerInch "96" leaked into every lead-alert preview) are
    // never message text.
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}
