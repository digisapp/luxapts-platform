import { Header } from "@/components/layout/Header";
import { Skeleton } from "@/components/ui/skeleton";

export default function SearchLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-black">
      <Header />
      <main className="flex-1 pt-20 pb-12 md:pt-24">
        {/* Footer comes from search/layout.tsx */}
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
          {/* Search bar skeleton */}
          <div className="mb-8">
            <Skeleton className="h-14 w-full max-w-xl rounded-full bg-white/[0.05]" />
          </div>

          {/* Filter pills skeleton */}
          <div className="flex gap-3 mb-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-24 rounded-full bg-white/[0.05]" />
            ))}
          </div>

          {/* Results grid skeleton */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
                <Skeleton className="h-48 w-full bg-white/[0.05]" />
                <div className="p-4 space-y-3">
                  <Skeleton className="h-5 w-3/4 bg-white/[0.05]" />
                  <Skeleton className="h-4 w-1/2 bg-white/[0.05]" />
                  <div className="flex gap-2">
                    <Skeleton className="h-6 w-16 rounded-full bg-white/[0.05]" />
                    <Skeleton className="h-6 w-16 rounded-full bg-white/[0.05]" />
                  </div>
                  <Skeleton className="h-6 w-24 bg-white/[0.05]" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
