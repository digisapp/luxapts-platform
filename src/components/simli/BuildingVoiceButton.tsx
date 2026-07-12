"use client";

import { useState, useEffect, useRef } from "react";
import { X, Mic, Sparkles } from "lucide-react";
import { SimliAvatar } from "./SimliAvatar";

interface BuildingVoiceButtonProps {
  buildingId: string;
  buildingName: string;
}

export function BuildingVoiceButton({ buildingId, buildingName }: BuildingVoiceButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear the pending auto-close timer on unmount
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-violet-700/50 bg-violet-950/30 px-4 py-3 text-sm font-medium text-violet-300 transition-colors hover:bg-violet-950/50 hover:text-violet-200"
      >
        <Mic className="h-4 w-4" />
        Ask Lexi about {buildingName}
        <span className="ml-auto flex items-center gap-1 text-xs text-violet-400/60">
          <Sparkles className="h-3 w-3" /> AI
        </span>
      </button>

      {/* Inline expandable panel */}
      {isOpen && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-gradient-to-r from-violet-950/40 to-purple-950/40">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-purple-600">
                <Mic className="h-3.5 w-3.5 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-white leading-none">Lexi</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-green-400 animate-pulse" : "bg-zinc-500"}`} />
                  <p className="text-xs text-zinc-400">
                    {isActive ? "Live conversation" : "AI apartment expert"}
                  </p>
                </div>
              </div>
            </div>
            <button
              onClick={() => { if (!isActive) setIsOpen(false); }}
              disabled={isActive}
              className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed"
              title={isActive ? "End the conversation first" : "Close"}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-4">
            <SimliAvatar
              context={{ building_id: buildingId }}
              onSessionStart={() => setIsActive(true)}
              onSessionEnd={() => {
                setIsActive(false);
                // Auto-close 1.5s after session ends
                if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
                closeTimeoutRef.current = setTimeout(() => setIsOpen(false), 1500);
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
