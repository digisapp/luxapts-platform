"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { X, Video, Sparkles } from "lucide-react";
import { SimliAvatar } from "./SimliAvatar";

interface SimliMessage {
  role: "user" | "assistant";
  content: string;
}

export function SimliWidget() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<SimliMessage[]>([]);

  // Don't show on admin pages
  if (pathname.startsWith("/admin")) {
    return null;
  }

  const handleMessage = (message: SimliMessage) => {
    setMessages((prev) => [...prev, message]);
  };

  return (
    <>
      {/* Floating Video Avatar Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-24 right-6 z-40 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-purple-700 text-white shadow-lg hover:from-violet-500 hover:to-purple-600 transition-all hover:scale-105 group ring-2 ring-white/20"
          aria-label="Talk to Lexi"
        >
          <Video className="h-7 w-7" />
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-green-500 ring-2 ring-white">
            <Sparkles className="h-3 w-3" />
          </span>

          {/* Tooltip */}
          <span className="absolute right-full mr-3 px-3 py-1.5 bg-zinc-900 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
            Talk to Lexi 🎥
          </span>
        </button>
      )}

      {/* Video Chat Panel */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-40 w-80 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-gradient-to-r from-violet-900/50 to-purple-900/50">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-purple-600">
                <Video className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">Lexi</p>
                <p className="text-xs text-zinc-400">Your LuxApts Expert</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 text-zinc-400 hover:text-white transition-colors rounded-lg hover:bg-zinc-800"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Avatar Section */}
          <div className="p-6 flex flex-col items-center">
            <SimliAvatar
              onMessage={handleMessage}
              compact={false}
              showControls={true}
              autoStart={false}
            />
          </div>

          {/* Recent Messages */}
          {messages.length > 0 && (
            <div className="px-4 pb-4 max-h-32 overflow-y-auto">
              <p className="text-xs text-zinc-500 mb-2">Recent</p>
              {messages.slice(-3).map((msg, i) => (
                <div
                  key={i}
                  className={`text-xs p-2 rounded-lg mb-1 ${
                    msg.role === "user"
                      ? "bg-zinc-800 text-zinc-300"
                      : "bg-violet-900/30 text-violet-200"
                  }`}
                >
                  <span className="font-medium">
                    {msg.role === "user" ? "You: " : "Lexi: "}
                  </span>
                  {msg.content.length > 80
                    ? msg.content.substring(0, 80) + "..."
                    : msg.content}
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="px-4 py-3 border-t border-zinc-800 bg-zinc-900/50">
            <p className="text-xs text-zinc-500 text-center">
              🎤 Click Start Chat, then speak naturally
            </p>
          </div>
        </div>
      )}
    </>
  );
}
