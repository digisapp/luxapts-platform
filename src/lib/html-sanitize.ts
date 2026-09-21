import sanitizeHtml from "sanitize-html";

/**
 * HTML sanitization for email content.
 *
 * These allowlists previously ran on isomorphic-dompurify, which reaches for
 * jsdom on the server. jsdom's CommonJS graph require()s an ESM-only package
 * (@exodus/bytes, via html-encoding-sniffer), and the deployed Node runtime
 * has no require(esm) support — so every module importing it threw during
 * evaluation, returning an empty 500 before any handler ran. That took out the
 * Resend webhook and the admin inbox for months without a single caught error.
 *
 * sanitize-html parses with htmlparser2 and needs no DOM, so these work on any
 * runtime. The allowlists below are ported unchanged from the DOMPurify calls
 * they replace; only the spelling of the configuration differs.
 */

/**
 * Classic CSS-borne script vectors. DOMPurify parsed and scrubbed style
 * attributes; sanitize-html passes them through untouched unless asked
 * otherwise, so drop any declaration that could execute.
 */
const UNSAFE_STYLE = /(?:expression\s*\(|javascript\s*:|behaviou?r\s*:|-moz-binding)/i;

function dropUnsafeStyle(tagName: string, attribs: sanitizeHtml.Attributes) {
  if (attribs.style && UNSAFE_STYLE.test(attribs.style)) {
    const rest = { ...attribs };
    delete rest.style;
    return { tagName, attribs: rest };
  }
  return { tagName, attribs };
}

/**
 * Schemes DOMPurify permitted by default and that legitimately appear in mail.
 * `cid:` addresses inline attachments; omitting it would break embedded images
 * in forwarded threads.
 */
const MAIL_SCHEMES = ["http", "https", "mailto", "tel", "cid"];

/**
 * Inbound email stored for the admin inbox. Strips scripts, event handlers and
 * dangerous tags while preserving layout and formatting, so a hostile sender
 * cannot plant stored XSS in a page an admin opens.
 */
export function sanitizeInboundEmailHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "a", "b", "blockquote", "br", "caption", "cite", "code", "col", "colgroup",
      "dd", "del", "details", "dfn", "div", "dl", "dt", "em", "figcaption", "figure",
      "footer", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img",
      "ins", "kbd", "li", "main", "mark", "menu", "nav", "ol", "p", "pre", "q",
      "rp", "rt", "ruby", "s", "samp", "section", "small", "span", "strong", "sub",
      "summary", "sup", "table", "tbody", "td", "tfoot", "th", "thead", "time", "tr",
      "u", "ul", "var",
    ],
    allowedAttributes: {
      "*": [
        "href", "src", "alt", "title", "width", "height", "style",
        "align", "valign", "colspan", "rowspan", "cellpadding", "cellspacing", "border",
        "bgcolor", "color", "target", "rel",
      ],
    },
    allowedSchemes: MAIL_SCHEMES,
    transformTags: { "*": dropUnsafeStyle },
  });
}

/**
 * AI-drafted reply bodies before sending. The draft is influenced by
 * attacker-controlled inbound email content (prompt injection), so only a
 * minimal formatting allowlist is permitted — no scripts, styles, images, or
 * non-https/mailto links.
 */
export function sanitizeDraftHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ["p", "br", "strong", "em", "b", "i", "ul", "ol", "li", "a"],
    allowedAttributes: { a: ["href"] },
    allowedSchemes: ["https", "mailto"],
  });
}

/**
 * Email HTML on its way into the admin inbox's sandboxed iframe. Runs in the
 * browser during render, so it must not pull a DOM implementation of its own.
 */
export function sanitizeRenderedEmailHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "div", "span", "p", "br", "b", "i", "u", "strong", "em",
      "a", "img", "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6",
      "table", "thead", "tbody", "tr", "td", "th",
      "blockquote", "pre", "code", "hr", "sup", "sub", "small",
    ],
    allowedAttributes: {
      "*": [
        "href", "src", "alt", "title", "style", "class", "width", "height",
        "target", "cellpadding", "cellspacing", "border", "align", "valign",
        "colspan", "rowspan",
      ],
    },
    allowedSchemes: MAIL_SCHEMES,
    transformTags: { "*": dropUnsafeStyle },
  });
}
