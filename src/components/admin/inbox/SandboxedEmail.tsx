"use client";

import { useEffect, useRef, useState } from "react";
import DOMPurify from "isomorphic-dompurify";

interface SandboxedEmailProps {
  html: string;
  className?: string;
}

/**
 * Renders email HTML inside a sandboxed iframe to prevent XSS,
 * CSS bleed, and script execution from inbound email content.
 */
export function SandboxedEmail({ html, className = "" }: SandboxedEmailProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(120);

  const sanitizedHtml = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "div", "span", "p", "br", "b", "i", "u", "strong", "em",
      "a", "img", "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6",
      "table", "thead", "tbody", "tr", "td", "th",
      "blockquote", "pre", "code", "hr", "sup", "sub", "small",
    ],
    ALLOWED_ATTR: [
      "href", "src", "alt", "title", "style", "class", "width", "height",
      "target", "cellpadding", "cellspacing", "border", "align", "valign",
      "colspan", "rowspan",
    ],
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ["target"],
  });

  // Force all links to open in new tab
  const processedHtml = sanitizedHtml.replace(
    /<a\s/gi,
    '<a target="_blank" rel="noopener noreferrer" '
  );

  const srcdoc = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 14px;
          line-height: 1.6;
          color: #e0e0e0;
          background: transparent;
          word-wrap: break-word;
          overflow-wrap: break-word;
        }
        a { color: #60a5fa; }
        img { max-width: 100%; height: auto; }
        blockquote {
          border-left: 2px solid #444;
          padding-left: 12px;
          margin: 8px 0;
          color: #888;
        }
        pre, code {
          background: rgba(255,255,255,0.05);
          border-radius: 4px;
          padding: 2px 4px;
          font-size: 13px;
        }
        pre { padding: 8px; overflow-x: auto; }
        table { border-collapse: collapse; }
        td, th { padding: 4px 8px; border: 1px solid #333; }
      </style>
    </head>
    <body>${processedHtml}</body>
    </html>
  `;

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    function adjustHeight() {
      try {
        const doc = iframe!.contentDocument || iframe!.contentWindow?.document;
        if (doc?.body) {
          const newHeight = Math.max(doc.body.scrollHeight + 16, 60);
          setHeight(Math.min(newHeight, 800)); // cap at 800px
        }
      } catch {
        // Cross-origin restriction — shouldn't happen with srcdoc
      }
    }

    iframe.addEventListener("load", adjustHeight);
    return () => iframe.removeEventListener("load", adjustHeight);
  }, [sanitizedHtml]);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcdoc}
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      className={`w-full border-0 rounded ${className}`}
      style={{ height: `${height}px`, background: "transparent" }}
      title="Email content"
    />
  );
}
