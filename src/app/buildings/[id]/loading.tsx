import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Skeleton } from "@/components/ui/skeleton";

export default function BuildingLoading() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <div className="bg-gradient-to-b from-muted/50 to-background">
          <div className="container mx-auto px-4 pt-20 pb-6 md:pt-24 md:pb-8">
            {/* Breadcrumb skeleton */}
            <div className="flex gap-2 mb-6">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-32" />
            </div>

            <div className="grid gap-8 lg:grid-cols-3">
              {/* Image gallery skeleton */}
              <div className="lg:col-span-2">
                <Skeleton className="h-64 md:h-96 w-full rounded-xl" />
              </div>

              {/* Quick info skeleton */}
              <div className="space-y-6">
                <Skeleton className="h-6 w-24 rounded-full" />
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <div className="space-y-2">
                  <Skeleton className="h-6 w-32" />
                  <Skeleton className="h-10 w-48" />
                </div>
                <div className="flex gap-3">
                  <Skeleton className="h-10 flex-1 rounded-lg" />
                  <Skeleton className="h-10 flex-1 rounded-lg" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-8">
          <div className="grid gap-8 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-8">
              {/* Description skeleton */}
              <div className="rounded-xl border p-6 space-y-3">
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>

              {/* Units skeleton */}
              <div className="rounded-xl border p-6 space-y-4">
                <Skeleton className="h-6 w-40" />
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex gap-4 rounded-lg border p-4">
                    <Skeleton className="h-32 w-48 rounded-lg flex-shrink-0" />
                    <div className="flex-1 space-y-3">
                      <Skeleton className="h-5 w-32" />
                      <div className="flex gap-2">
                        <Skeleton className="h-6 w-16 rounded-full" />
                        <Skeleton className="h-6 w-16 rounded-full" />
                        <Skeleton className="h-6 w-20 rounded-full" />
                      </div>
                      <Skeleton className="h-6 w-24" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Sidebar skeleton */}
            <div className="space-y-6">
              <div className="rounded-xl border p-6 space-y-4">
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
