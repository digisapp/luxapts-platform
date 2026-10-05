import { describe, it, expect } from "vitest";
import { buildEmailSrcdoc, pickEmailTheme } from "@/components/admin/inbox/email-srcdoc";

// A Gmail reply as the inbox stores it: plain divs, the quoted original in a
// blockquote, and a signature whose link carries a stray white background.
const GMAIL_REPLY =
  '<div>hi are there there i need a apartment in miami</div><br /><div><div>On Sun, Oct 4, 2026 at 3:30 PM Staycio &lt;<a href="mailto:hello@staycio.com">hello@staycio.com</a>&gt; wrote:<br /></div>' +
  '<blockquote style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex">This address now receives mail.</blockquote></div>' +
  '<span>-- </span><br /><div>Nathan Mayell</div><div>COO / <a href="http://examodels.com" style="background-color:rgb(255,255,255)">examodels.com</a></div>';

describe("pickEmailTheme", () => {
  it("shows a typed reply on the dark surface", () => {
    expect(pickEmailTheme("<div>Hi Stacy,</div><div>December 1 works.</div>")).toBe("dark");
    expect(pickEmailTheme("<p>Thanks!</p>")).toBe("dark");
  });

  it("is not fooled by a stray white or transparent background (Gmail signatures)", () => {
    expect(pickEmailTheme(GMAIL_REPLY)).toBe("dark");
    expect(pickEmailTheme('<span style="background:transparent">x</span>')).toBe("dark");
    expect(pickEmailTheme('<span style="background-color:#fff">x</span>')).toBe("dark");
  });

  it("keeps light or mid-tone text on dark", () => {
    expect(pickEmailTheme('<span style="color:#888888">sig</span>')).toBe("dark");
    expect(pickEmailTheme('<span style="color:rgb(136,136,136)">sig</span>')).toBe("dark");
  });

  it("shows designed mail on a white page", () => {
    expect(pickEmailTheme("<table><tr><td>Newsletter</td></tr></table>")).toBe("paper");
    expect(pickEmailTheme('<div bgcolor="#f5f5f5">x</div>')).toBe("paper");
    expect(pickEmailTheme('<div style="background-color:#0f1b2d;color:#fff">x</div>')).toBe("paper");
    expect(pickEmailTheme('<div style="background:url(https://x/y.png)">x</div>')).toBe("paper");
  });

  it("shows mail with explicit dark text on a white page (Outlook does this)", () => {
    expect(pickEmailTheme('<p style="color:black">Hello</p>')).toBe("paper");
    expect(pickEmailTheme('<p style="color:#000000">Hello</p>')).toBe("paper");
    expect(pickEmailTheme('<p style="color:rgb(34, 34, 34)">Hello</p>')).toBe("paper");
    expect(pickEmailTheme('<span style="color:windowtext">Hello</span>')).toBe("paper");
  });

  it("does not read background-color as a text colour", () => {
    expect(pickEmailTheme('<span style="background-color:#ffffff">x</span>')).toBe("dark");
  });
});

describe("buildEmailSrcdoc", () => {
  it("declares the colour scheme that matches the theme", () => {
    // Without this the browser paints an opaque white canvas behind a
    // "transparent" frame on the dark admin page: light grey text on white.
    expect(buildEmailSrcdoc("<p>hi</p>")).toContain('<meta name="color-scheme" content="dark">');
    expect(buildEmailSrcdoc("<table><tr><td>x</td></tr></table>")).toContain('<meta name="color-scheme" content="light">');
  });

  it("wraps the message in a measurable root and measures that, not the document", () => {
    const doc = buildEmailSrcdoc("<p>hi</p>");
    expect(doc).toContain('<div id="email-root"><p>hi</p></div>');
    expect(doc).toContain("root.getBoundingClientRect().height");
    // The old script measured documentElement.scrollHeight, which is never
    // smaller than the frame, so the frame only ever grew.
    expect(doc).not.toContain("documentElement.scrollHeight");
  });

  it("opens every link in a new tab", () => {
    expect(buildEmailSrcdoc('<a href="https://x.com">x</a>')).toContain(
      '<a target="_blank" rel="noopener noreferrer" href="https://x.com">'
    );
  });

  it("folds quoted history and hides tracking pixels", () => {
    const doc = buildEmailSrcdoc(GMAIL_REPLY);
    expect(doc).toContain("foldQuotedHistory");
    expect(doc).toContain('img[width="1"]');
  });
});

describe("list previews", () => {
  it("never shows the Outlook block or the head as message text", async () => {
    const { htmlToText } = await import("@/lib/email/branded");
    const html =
      '<!DOCTYPE html><html><head><title>Staycio</title><!--[if mso]><noscript><xml><o:PixelsPerInch>96</o:PixelsPerInch></xml></noscript><![endif]--></head><body><a href="https://staycio.com">Staycio</a><p>New lead from Klaudia in Miami</p></body></html>';
    const text = htmlToText(html);
    expect(text).not.toContain("96");
    expect(text.replace(/\s+/g, " ").trim()).toBe("Staycio New lead from Klaudia in Miami");
  });
});
