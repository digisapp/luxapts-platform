"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useCompare } from "@/hooks/useCompare";
import { Button } from "@/components/ui/button";
import { GitCompare, X, Building2 } from "lucide-react";

export function CompareBar() {
  const pathname = usePathname();
  const { buildings, removeBuilding, clearAll, canCompare, isLoaded } = useCompare();

  // Don't show on compare page or admin pages
  if (pathname === "/compare" || pathname.startsWith("/admin") || !isLoaded) {
    return null;
  }

  // Don't show if no buildings selected
  if (buildings.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-zinc-900 border-t border-zinc-800 shadow-lg">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 overflow-x-auto">
            <div className="flex items-center gap-2 text-sm text-zinc-400 flex-shrink-0">
              <GitCompare className="h-4 w-4" />
              <span>Compare ({buildings.length}/3)</span>
            </div>

            <div className="flex items-center gap-2">
              {buildings.map((building) => (
                <div
                  key={building.id}
                  className="flex items-center gap-2 bg-zinc-800 rounded-lg pl-1 pr-2 py-1"
                >
                  <div className="relative w-8 h-8 rounded overflow-hidden bg-zinc-700 flex-shrink-0">
                    {building.image ? (
                      <Image
                        src={building.image}
                        alt={building.name}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Building2 className="h-4 w-4 text-zinc-500" />
                      </div>
                    )}
                  </div>
                  <span className="text-sm text-white truncate max-w-[120px]">
                    {building.name}
                  </span>
                  <button
                    onClick={() => removeBuilding(building.id)}
                    className="p-0.5 rounded-full hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAll}
              className="text-zinc-400 hover:text-white"
            >
              Clear
            </Button>
            <Link href="/compare">
              <Button size="sm" disabled={!canCompare}>
                Compare Now
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
