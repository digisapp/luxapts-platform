"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/client-errors/report";

/**
 * Uncaught errors and unhandled promise rejections anywhere on the site, sent
 * to /admin/errors. Error screens report through ErrorFallback and
 * global-error.tsx. Image and script load failures don't bubble to window,
 * so a 404'd listing photo is not reported.
 */
export function ClientErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) =>
      reportClientError("window", e.error ?? e.message, {
        filename: e.filename || undefined,
        line: e.lineno || undefined,
        column: e.colno || undefined,
      });
    const onRejection = (e: PromiseRejectionEvent) => reportClientError("promise", e.reason);

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
