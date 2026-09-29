import { Skeleton } from "@/components/ui/skeleton";

/**
 * Route-level loading fallback for the portals. Renders inside PortalShell's
 * <main>, so it must not add its own page padding or min-height.
 */
export function PortalPageSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>

      {/* Header skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>

      {/* Stats grid skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-xl border p-6">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-16" />
          </div>
        ))}
      </div>

      {/* List skeleton */}
      <div className="rounded-xl border">
        <div className="border-b p-4">
          <Skeleton className="h-6 w-32" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b p-4 last:border-0">
            <Skeleton className="h-4 w-32 shrink-0" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="hidden h-6 w-20 rounded-full sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
