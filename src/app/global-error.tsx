"use client";

import { useEffect } from "react";
import "./globals.css";
import { reportClientError } from "@/lib/client-errors/report";

/**
 * Shown when the root layout itself throws — every other error screen lives
 * inside that layout (ErrorFallback). Without this file Next rendered a bare
 * default page and nothing was reported. Replaces the layout, so it renders
 * its own <html> and <body>.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    reportClientError("root", error, { digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-background p-8 text-foreground antialiased">
        <div className="max-w-md text-center">
          <h1 className="mb-2 text-xl font-semibold">Something went wrong</h1>
          <p className="mb-6 text-muted-foreground">
            We encountered an unexpected error. Please try again.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
