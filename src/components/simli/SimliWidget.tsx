"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { X, Mic, Sparkles } from "lucide-react";
import { SimliAvatar } from "./SimliAvatar";

export function SimliWidget() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [isActive, setIsActive] = useState(false);

  // Close on route change
  useEffect(() => {
    if (isActive) return; // Don't close mid-session
    setIsOpen(false);
  }, [pathname, isActive]);

  // Hide on admin and partner pages
  if (pathname.startsWith("/admin") || pathname.startsWith("/partner")) {
    return null;
  }

  const handleClose = () => {
    if (isActive) return; // Prevent accidental close during active session
    setIsOpen(false);
  };

  return (
    <>
      {/* Floating trigger button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-36 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-purple-700 text-white shadow-lg hover:from-violet-500 hover:to-purple-600 transition-all hover:scale-105 group ring-2 ring-white/20 lg:bottom-24 lg:right-6 lg:h-16 lg:w-16"
          aria-label="Talk to Lexi"
        >
          <Mic className="h-6 w-6 lg:h-7 lg:w-7" />
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-green-500 ring-2 ring-white">
            <Sparkles className="h-3 w-3" />
          </span>
          <span className="absolute right-full mr-3 px-3 py-1.5 bg-zinc-900 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap hidden lg:block pointer-events-none">
            Talk to Lexi
          </span>
        </button>
      )}

      {/* Panel */}
      {isOpen && (
        <>
          {/* Backdrop on mobile */}
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={handleClose}
          />

          <div className="fixed bottom-20 right-4 z-50 w-[calc(100vw-2rem)] max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden lg:bottom-24 lg:right-6">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-gradient-to-r from-violet-950/60 to-purple-950/60">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-purple-600 shrink-0">
                  <Mic className="h-4 w-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white leading-none">Lexi</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-green-400 animate-pulse" : "bg-zinc-500"}`} />
                    <p className="text-xs text-zinc-400">
                      {isActive ? "Live conversation" : "AI apartment expert"}
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={handleClose}
                disabled={isActive}
                className="p-1.5 text-zinc-400 hover:text-white transition-colors rounded-lg hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Close"
                title={isActive ? "End the conversation first" : "Close"}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Avatar */}
            <div className="p-4">
              <SimliAvatar
                autoStart={false}
                onSessionStart={() => setIsActive(true)}
                onSessionEnd={() => {
                  setIsActive(false);
                  // Auto-close 1.5s after session ends
                  setTimeout(() => setIsOpen(false), 1500);
                }}
              />
            </div>

            {/* Footer hint */}
            {!isActive && (
              <div className="px-4 pb-4">
                <p className="text-xs text-zinc-500 text-center">
                  Ask about apartments, pricing, neighborhoods, or availability
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
