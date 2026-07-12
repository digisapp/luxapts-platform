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
    <body>${processedHtml}<script>
      (function () {
        function report() {
          var height = Math.max(
            document.body ? document.body.scrollHeight : 0,
            document.documentElement ? document.documentElement.scrollHeight : 0
          );
          window.parent.postMessage({ type: "sandboxed-email-height", height: height }, "*");
        }
        window.addEventListener("load", report);
        window.addEventListener("resize", report);
        // Images loading after the load event (or failing) change the height
        var imgs = document.images;
        for (var i = 0; i < imgs.length; i++) {
          imgs[i].addEventListener("load", report);
          imgs[i].addEventListener("error", report);
        }
        report();
      })();
    </script></body>
    </html>
  `;

  // The sandbox (deliberately) omits allow-same-origin, so the parent can't
  // read contentDocument to measure the email. Instead a script injected into
  // the srcdoc (allow-scripts is safe without allow-same-origin) posts its
  // scrollHeight up to us.
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const iframe = iframeRef.current;
      if (!iframe || event.source !== iframe.contentWindow) return;

      const data = event.data as { type?: string; height?: number } | null;
      if (data?.type !== "sandboxed-email-height" || typeof data.height !== "number") return;

      const newHeight = Math.max(data.height + 16, 60);
      setHeight(Math.min(newHeight, 800)); // cap at 800px
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcdoc}
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
      className={`w-full border-0 rounded ${className}`}
      style={{ height: `${height}px`, background: "transparent" }}
      title="Email content"
    />
  );
}
