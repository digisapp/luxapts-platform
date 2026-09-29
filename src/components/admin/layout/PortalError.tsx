"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Route-level error fallback for the portals. Unlike the root error page it
 * renders inside PortalShell, so the sidebar/mobile nav stay usable.
 */
export function PortalError({
  error,
  retry,
  homeHref,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  homeHref: string;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  // On the dashboard itself the link would point at the page that just failed.
  const onDashboard = usePathname() === homeHref;

  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10">
        <AlertTriangle className="h-6 w-6 text-red-400" aria-hidden="true" />
      </div>
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {onDashboard
          ? "This page failed to load. Try again in a moment."
          : "This page failed to load. Try again, or head back to the dashboard."}
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-xs text-muted-foreground">Ref: {error.digest}</p>
      )}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button variant="outline" className="gap-2" onClick={() => retry()}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Try again
        </Button>
        {!onDashboard && (
          <Button asChild>
            <Link href={homeHref}>Back to dashboard</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
