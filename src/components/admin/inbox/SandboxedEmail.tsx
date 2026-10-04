"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { sanitizeRenderedEmailHtml } from "@/lib/html-sanitize";
import { buildEmailSrcdoc, pickEmailTheme } from "./email-srcdoc";

interface SandboxedEmailProps {
  html: string;
  className?: string;
}

/** Taller than this and the message scrolls inside its own frame. */
const MAX_HEIGHT = 1600;

/**
 * Renders email HTML inside a sandboxed iframe to prevent XSS,
 * CSS bleed, and script execution from inbound email content.
 *
 * The look (dark surface or white page) is chosen per message; see
 * email-srcdoc.ts.
 */
export function SandboxedEmail({ html, className = "" }: SandboxedEmailProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(72);

  const { srcdoc, theme } = useMemo(() => {
    const sanitized = sanitizeRenderedEmailHtml(html);
    const picked = pickEmailTheme(sanitized);
    return { srcdoc: buildEmailSrcdoc(sanitized, picked), theme: picked };
  }, [html]);

  // The sandbox (deliberately) omits allow-same-origin, so the parent can't
  // read contentDocument to measure the email. Instead a script injected into
  // the srcdoc (allow-scripts is safe without allow-same-origin) posts the
  // height of its content up to us.
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const iframe = iframeRef.current;
      if (!iframe || event.source !== iframe.contentWindow) return;

      const data = event.data as { type?: string; height?: number } | null;
      if (data?.type !== "sandboxed-email-height" || typeof data.height !== "number") return;

      setHeight(Math.min(Math.max(Math.ceil(data.height), 48), MAX_HEIGHT));
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcdoc}
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
      className={`block w-full border-0 ${className}`}
      // colorScheme must match the document inside: a mismatch makes the
      // browser paint an opaque canvas behind a transparent frame.
      style={{
        height: `${height}px`,
        background: theme === "paper" ? "#ffffff" : "transparent",
        colorScheme: theme === "paper" ? "light" : "dark",
      }}
      title="Email content"
    />
  );
}
