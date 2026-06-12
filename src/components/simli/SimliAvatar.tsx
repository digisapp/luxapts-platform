"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, PhoneOff, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SimliAvatarProps {
  onSessionStart?: (sessionId: string) => void;
  onSessionEnd?: () => void;
  className?: string;
  autoStart?: boolean;
  /** City/building context passed to the session */
  context?: { city_slug?: string; building_id?: string };
}

type SessionState = "idle" | "starting" | "active" | "error";

export function SimliAvatar({
  onSessionStart,
  onSessionEnd,
  className = "",
  autoStart = false,
  context,
}: SimliAvatarProps) {
  const [state, setState] = useState<SessionState>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [roomUrl, setRoomUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endedRef = useRef(false);

  const startSession = async () => {
    setState("starting");
    setError(null);
    endedRef.current = false;

    try {
      const res = await fetch("/api/simli/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: context ? JSON.stringify(context) : undefined,
      });
      const data = await res.json();

      // Component unmounted or session ended while the request was in flight
      if (endedRef.current) return;

      if (!res.ok || !data.session?.roomUrl) {
        setError(data.error || "Failed to start session");
        setState("error");
        return;
      }

      setSessionId(data.session.sessionId);
      setRoomUrl(data.session.roomUrl);
      setState("active");
      onSessionStart?.(data.session.sessionId);
    } catch {
      if (endedRef.current) return;
      setError("Could not connect. Check your internet connection.");
      setState("error");
    }
  };

  const endSession = () => {
    if (endedRef.current) return;
    endedRef.current = true;
    setRoomUrl(null);
    setSessionId(null);
    setState("idle");
    onSessionEnd?.();
  };

  useEffect(() => {
    if (autoStart) startSession();
    return () => { endedRef.current = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  return (
    <div className={`flex flex-col items-center gap-3 w-full ${className}`}>
      {/* Idle state */}
      {state === "idle" && (
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-purple-800">
            <Mic className="h-9 w-9 text-white" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-white">Lexi is ready</p>
            <p className="text-xs text-zinc-400 mt-0.5">AI apartment expert · voice-enabled</p>
          </div>
          <Button
            onClick={startSession}
            className="bg-violet-600 hover:bg-violet-500 text-white px-6"
          >
            Start Conversation
          </Button>
        </div>
      )}

      {/* Connecting */}
      {state === "starting" && (
        <div className="flex flex-col items-center gap-3 py-8">
          <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
          <p className="text-sm text-zinc-400">Connecting to Lexi…</p>
        </div>
      )}

      {/* Error */}
      {state === "error" && (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <p className="text-sm text-red-400">{error}</p>
          <Button variant="outline" size="sm" onClick={startSession}>
            Try again
          </Button>
        </div>
      )}

      {/* Active — avatar iframe */}
      {state === "active" && roomUrl && (
        <div className="w-full flex flex-col gap-2">
          <div className="relative w-full rounded-xl overflow-hidden bg-zinc-900" style={{ aspectRatio: "3/4" }}>
            <iframe
              src={roomUrl}
              allow="camera; microphone; autoplay; display-capture; clipboard-write"
              allowFullScreen
              className="absolute inset-0 w-full h-full border-0"
              title="Talk to Lexi"
            />
          </div>

          <Button
            variant="destructive"
            size="sm"
            onClick={endSession}
            className="w-full gap-2"
          >
            <PhoneOff className="h-4 w-4" />
            End Conversation
          </Button>

          {sessionId && (
            <p className="text-center text-xs text-zinc-600">
              Session {sessionId.slice(0, 8)}…
            </p>
          )}
        </div>
      )}
    </div>
  );
}
