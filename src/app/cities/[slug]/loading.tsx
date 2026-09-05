import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Skeleton } from "@/components/ui/skeleton";

export default function CityLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-black">
      <Header />
      <main className="flex-1 pt-20">
        <div className="container mx-auto px-4">
          {/* Hero skeleton */}
          <div className="mb-8 space-y-4">
            <Skeleton className="h-64 w-full rounded-xl bg-white/[0.05]" />
            <Skeleton className="h-8 w-1/3 bg-white/[0.05]" />
            <Skeleton className="h-4 w-1/2 bg-white/[0.05]" />
          </div>

          {/* Buildings grid skeleton */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
                <Skeleton className="h-48 w-full bg-white/[0.05]" />
                <div className="p-4 space-y-3">
                  <Skeleton className="h-5 w-3/4 bg-white/[0.05]" />
                  <Skeleton className="h-4 w-1/2 bg-white/[0.05]" />
                  <Skeleton className="h-6 w-24 bg-white/[0.05]" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
