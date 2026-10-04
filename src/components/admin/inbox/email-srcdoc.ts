/**
 * The document an email body is rendered in (the sandboxed iframe's srcdoc).
 * Pure, so the theme choice and the markup can be unit tested and rendered in
 * a harness without the admin UI.
 *
 * Two looks, picked per message:
 *
 * - "dark": the message has no design of its own (a typed reply, plain
 *   paragraphs). It is shown on the admin's dark surface in light text, like
 *   the rest of the page.
 * - "paper": the message carries backgrounds, layout tables or explicit dark
 *   text, i.e. it was designed for a white page. It is shown on white exactly
 *   as its sender built it. Forcing dark onto that produces black-on-black.
 *
 * The frame must declare its colour scheme either way. The admin page is
 * `color-scheme: dark`; a frame that says nothing is treated as light and the
 * browser paints an opaque white canvas behind it, which is how light grey
 * text on white (unreadable) used to happen.
 */

export type EmailTheme = "dark" | "paper";

const NEUTRAL_BACKGROUND = /^(transparent|none|inherit|initial|unset|white|#fff|#ffffff|rgba?\(\s*255\s*,\s*255\s*,\s*255\s*(,\s*[\d.]+\s*)?\)|rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\))$/;

/** A text colour too dark to read on the admin's dark surface. */
function isDarkTextColor(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (v === "black" || v === "windowtext") return true;
  const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split("").map((c) => c + c).join("") : hex[1];
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    return 0.299 * r + 0.587 * g + 0.114 * b < 110;
  }
  const rgb = v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgb) return 0.299 * +rgb[1] + 0.587 * +rgb[2] + 0.114 * +rgb[3] < 110;
  return false;
}

export function pickEmailTheme(html: string): EmailTheme {
  const h = html.toLowerCase();
  // Layout tables and bgcolor attributes mean a designed email.
  if (/<table\b/.test(h) || /\sbgcolor\s*=/.test(h)) return "paper";
  // A real background (anything but white/transparent) means the same.
  for (const m of h.matchAll(/background(?:-color)?\s*:\s*([^;"']+)/g)) {
    const value = m[1].trim();
    if (/url\(/.test(value) || !NEUTRAL_BACKGROUND.test(value.split(/\s+/)[0])) return "paper";
  }
  // Explicit dark text would vanish on the dark surface.
  for (const m of h.matchAll(/(?<![-\w])color\s*:\s*([^;"']+)/g)) {
    if (isDarkTextColor(m[1])) return "paper";
  }
  if (/<font\b[^>]*\scolor\s*=\s*["']?(black|#000)/.test(h)) return "paper";
  return "dark";
}

const BASE_CSS = `
  html, body { height: auto; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 16px 18px;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, 'Helvetica Neue', Helvetica, Arial, sans-serif;
    font-size: 15px;
    line-height: 1.6;
    word-wrap: break-word;
    overflow-wrap: anywhere;
  }
  #email-root { max-width: 760px; }
  #email-root > :first-child { margin-top: 0; }
  img { max-width: 100%; height: auto; }
  /* Tracking pixels. */
  img[width="1"], img[height="1"], img[width="0"], img[height="0"] { display: none !important; }
  pre { padding: 8px; overflow-x: auto; white-space: pre-wrap; }
  pre, code { border-radius: 4px; font-size: 13px; }
  table { border-collapse: collapse; max-width: 100%; }
  blockquote { margin: 8px 0; padding-left: 12px; }
  /* Outlook names fonts most machines don't have; without this the fallback
     is the browser's serif. */
  [style*="Calibri" i], [style*="Aptos" i], [face*="Calibri" i], [face*="Aptos" i] {
    font-family: Calibri, Aptos, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;
  }
  #quoted-toggle {
    /* A block, so the signature that follows starts on its own line. */
    display: block;
    width: fit-content;
    margin: 10px 0 10px;
    padding: 0 10px;
    height: 20px;
    line-height: 16px;
    font-size: 14px;
    letter-spacing: 1px;
    border-radius: 999px;
    cursor: pointer;
    font-family: inherit;
  }
  #quoted[hidden] { display: none; }
`;

const DARK_CSS = `
  :root { color-scheme: dark; }
  html, body { background: transparent; }
  body { color: #e5e5e5; }
  a { color: #7cb7ff; }
  /* A plain reply sometimes carries a stray white background on a link or a
     span (Gmail signatures do). It would show as a white box here. */
  #email-root *:not(img) { background-color: transparent !important; }
  /* Logos are often dark artwork on a transparent PNG: give them a page. */
  img { background: #f4f4f5; border-radius: 6px; padding: 4px; }
  blockquote { border-left: 2px solid #3f3f46; color: #a1a1aa; }
  pre, code { background: rgba(255,255,255,0.06); }
  td, th { border-color: #3f3f46; }
  #quoted-toggle { background: rgba(255,255,255,0.08); color: #a1a1aa; border: 1px solid rgba(255,255,255,0.12); }
  #quoted-toggle:hover { background: rgba(255,255,255,0.14); color: #e5e5e5; }
`;

const PAPER_CSS = `
  :root { color-scheme: light; }
  html, body { background: #ffffff; }
  body { color: #1a1a1a; }
  /* A designed email brings its own page background and margins: let it run
     edge to edge instead of floating in a white rim. */
  body:has(#email-root > table:first-child) { padding: 0; }
  body:has(#email-root > table:first-child) #email-root { max-width: none; }
  a { color: #1a56db; }
  blockquote { border-left: 2px solid #d4d4d8; color: #52525b; }
  pre, code { background: #f4f4f5; }
  #quoted-toggle { background: #f4f4f5; color: #52525b; border: 1px solid #e4e4e7; }
  #quoted-toggle:hover { background: #e4e4e7; color: #18181b; }
`;

/**
 * Runs inside the frame. Folds the quoted history of a reply behind a "…"
 * toggle (the thread above already shows those messages) and reports the
 * content's real height to the parent.
 *
 * Height is measured on #email-root, never on the document: the document is
 * at least as tall as the frame, so measuring it made the frame grow a little
 * on every resize until it hit its cap, leaving a tall empty panel.
 */
const FRAME_SCRIPT = `
(function () {
  var root = document.getElementById('email-root');

  function foldQuotedHistory() {
    var quote = root.querySelector('.gmail_quote, blockquote[type="cite"], #divRplyFwdMsg, .yahoo_quoted, blockquote');
    if (!quote) return;
    var start = quote;
    // "On Sun, Oct 4 … wrote:" sits just before the quote.
    var prev = quote.previousElementSibling;
    if (prev && /wrote:\\s*$/i.test((prev.textContent || '').trim())) start = prev;
    // Gmail wraps the attribution and the quote in one container.
    var parent = start.parentElement;
    if (parent && parent !== root && parent.firstElementChild === start && parent.lastElementChild === quote) start = parent;

    // Collect the quote block; a signature after it stays visible.
    var nodes = [];
    var node = start;
    while (node) {
      nodes.push(node);
      if (node === quote || node.contains(quote)) break;
      node = node.nextSibling;
    }

    // Nothing to fold if the message is only a quote (a bare forward).
    var own = root.cloneNode(true);
    var ownQuote = own.querySelector('.gmail_quote, blockquote[type="cite"], #divRplyFwdMsg, .yahoo_quoted, blockquote');
    if (ownQuote) ownQuote.remove();
    if (!(own.textContent || '').replace(/\\s+/g, '').length) return;

    var wrap = document.createElement('div');
    wrap.id = 'quoted';
    wrap.hidden = true;
    start.parentNode.insertBefore(wrap, start);
    nodes.forEach(function (n) { wrap.appendChild(n); });

    var btn = document.createElement('button');
    btn.id = 'quoted-toggle';
    btn.type = 'button';
    btn.textContent = '\\u2022\\u2022\\u2022';
    btn.title = 'Show quoted text';
    btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', function () {
      wrap.hidden = !wrap.hidden;
      btn.title = wrap.hidden ? 'Show quoted text' : 'Hide quoted text';
      btn.setAttribute('aria-expanded', String(!wrap.hidden));
      report();
    });
    wrap.parentNode.insertBefore(btn, wrap);

    // Trim the empty lines mail clients leave on either side of the quote.
    trimEmptySiblings(btn, 'previousSibling');
    trimEmptySiblings(wrap, 'nextSibling');
  }

  // Whitespace, a <br>, or a block with no text and no image.
  function isBlank(node) {
    if (node.nodeType === 3) return !node.textContent.trim();
    if (node.nodeType !== 1) return true;
    if (node.id === 'quoted' || node.id === 'quoted-toggle') return false;
    if (node.tagName === 'BR') return true;
    if (node.tagName === 'IMG' || node.tagName === 'HR' || node.tagName === 'TABLE') return false;
    return !node.textContent.trim() && !node.querySelector('img, hr, table');
  }

  function trimEmptySiblings(from, direction) {
    var node = from[direction];
    while (node && isBlank(node)) {
      var gone = node;
      node = node[direction];
      gone.remove();
    }
  }

  // Mail clients end a message with a run of empty lines; they only add a
  // blank band under the last line here.
  function trimTrailingBlank(container) {
    var last = container.lastChild;
    while (last) {
      if (isBlank(last)) {
        var gone = last;
        last = last.previousSibling;
        gone.remove();
        continue;
      }
      if (last.nodeType === 1 && last.id !== 'quoted' && last.tagName !== 'IMG') trimTrailingBlank(last);
      break;
    }
  }

  function report() {
    var style = getComputedStyle(document.body);
    var pad = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    var height = Math.ceil(root.getBoundingClientRect().height + pad);
    window.parent.postMessage({ type: 'sandboxed-email-height', height: height }, '*');
  }

  try { foldQuotedHistory(); } catch (e) {}
  try { trimTrailingBlank(root); } catch (e) {}
  report();
  window.addEventListener('load', report);
  if (window.ResizeObserver) new ResizeObserver(report).observe(root);
  var imgs = document.images;
  for (var i = 0; i < imgs.length; i++) {
    imgs[i].addEventListener('load', report);
    imgs[i].addEventListener('error', report);
  }
})();
`;

/** `sanitizedHtml` must already be sanitized; this only frames it. */
export function buildEmailSrcdoc(sanitizedHtml: string, theme: EmailTheme = pickEmailTheme(sanitizedHtml)): string {
  // Every link opens in a new tab: the frame must never navigate itself.
  const body = sanitizedHtml.replace(/<a\s/gi, '<a target="_blank" rel="noopener noreferrer" ');
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="${theme === "paper" ? "light" : "dark"}">
<style>${BASE_CSS}${theme === "paper" ? PAPER_CSS : DARK_CSS}</style>
</head>
<body><div id="email-root">${body}</div><script>${FRAME_SCRIPT}</script></body>
</html>`;
}
