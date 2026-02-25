import { Skeleton } from "@/components/ui/skeleton";

export default function AdminLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 pt-20 pb-8">
        {/* Header skeleton */}
        <div className="flex items-center justify-between mb-8">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32 rounded-lg" />
        </div>

        {/* Stats grid skeleton */}
        <div className="grid gap-4 md:grid-cols-4 mb-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border p-6 space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-16" />
            </div>
          ))}
        </div>

        {/* Table skeleton */}
        <div className="rounded-xl border">
          <div className="p-4 border-b">
            <Skeleton className="h-6 w-32" />
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4 border-b last:border-0">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-48 flex-1" />
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
