import { describe, it, expect } from "vitest";
import {
  sanitizeInboundEmailHtml,
  sanitizeDraftHtml,
  sanitizeRenderedEmailHtml,
} from "@/lib/html-sanitize";

/**
 * These guard the sanitizers that replaced DOMPurify. The inputs are the
 * shapes a hostile sender actually mails: the point is that swapping the
 * implementation did not quietly widen what gets stored or rendered.
 */

describe("sanitizeInboundEmailHtml", () => {
  it("drops scripts along with their contents", () => {
    const out = sanitizeInboundEmailHtml('<p>hi</p><script>alert(1)</script>');
    expect(out).toContain("<p>hi</p>");
    expect(out).not.toContain("script");
    expect(out).not.toContain("alert(1)");
  });

  it("strips event handlers but keeps the element", () => {
    const out = sanitizeInboundEmailHtml('<img src="https://x.test/a.png" onerror="alert(1)">');
    expect(out).toContain("src=\"https://x.test/a.png\"");
    expect(out).not.toContain("onerror");
  });

  it("refuses javascript: and data: URLs", () => {
    const out = sanitizeInboundEmailHtml('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toContain("javascript:");
    expect(sanitizeInboundEmailHtml('<a href="data:text/html,<script>">x</a>')).not.toContain("data:");
  });

  it("removes style attributes that can execute", () => {
    const out = sanitizeInboundEmailHtml('<div style="width:expression(alert(1))">x</div>');
    expect(out).not.toContain("expression");
    expect(out).toContain("<div>x</div>");
  });

  it("keeps ordinary layout and formatting intact", () => {
    const html =
      '<table cellpadding="4"><tr><td style="color:#333" align="left">' +
      '<strong>Hi</strong> <a href="https://staycio.com">tour</a></td></tr></table>';
    const out = sanitizeInboundEmailHtml(html);
    expect(out).toContain("<strong>Hi</strong>");
    expect(out).toContain('href="https://staycio.com"');
    expect(out).toContain('style="color:#333"');
    expect(out).toContain('cellpadding="4"');
  });

  it("keeps cid: images so inline attachments still render", () => {
    expect(sanitizeInboundEmailHtml('<img src="cid:logo@1">')).toContain("cid:logo@1");
  });
});

describe("sanitizeDraftHtml", () => {
  it("allows only https and mailto links", () => {
    expect(sanitizeDraftHtml('<a href="https://staycio.com">a</a>')).toContain("https://staycio.com");
    expect(sanitizeDraftHtml('<a href="mailto:a@b.co">a</a>')).toContain("mailto:a@b.co");
    expect(sanitizeDraftHtml('<a href="http://staycio.com">a</a>')).not.toContain("http://");
  });

  it("strips images, styles and scripts a prompt injection might produce", () => {
    const out = sanitizeDraftHtml(
      '<p>Sure</p><img src="https://evil.test/track.gif"><div style="x">y</div><script>x</script>'
    );
    expect(out).toContain("<p>Sure</p>");
    expect(out).not.toContain("<img");
    expect(out).not.toContain("style=");
    expect(out).not.toContain("script");
  });

  it("keeps the formatting a reply legitimately uses", () => {
    const out = sanitizeDraftHtml("<p>Hi <strong>there</strong></p><ul><li>one</li></ul>");
    expect(out).toBe("<p>Hi <strong>there</strong></p><ul><li>one</li></ul>");
  });
});

describe("sanitizeRenderedEmailHtml", () => {
  it("strips scripts before the iframe ever sees them", () => {
    const out = sanitizeRenderedEmailHtml('<div>body</div><script>parent.location="x"</script>');
    expect(out).toContain("<div>body</div>");
    expect(out).not.toContain("script");
  });

  it("drops executable styles while keeping presentational ones", () => {
    expect(sanitizeRenderedEmailHtml('<p style="behavior:url(#x)">a</p>')).not.toContain("behavior");
    expect(sanitizeRenderedEmailHtml('<p style="color:red">a</p>')).toContain('style="color:red"');
  });
});
