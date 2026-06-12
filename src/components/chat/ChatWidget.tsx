"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, X, Send, Loader2, Sparkles, Building2, Minus } from "lucide-react";
import { parseSSEStream } from "@/lib/chat/stream-parser";
import { useCompare } from "@/hooks/useCompare";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTED_PROMPTS = [
  "2 bed in Miami with pool, gym, and concierge under $5,000",
  "Dog-friendly buildings with a dog park in NYC",
  "Luxury high-rise with doorman and rooftop in Brickell",
  "Studios with in-unit washer dryer in Manhattan",
];

// Max messages to send to the API to prevent unbounded context growth
const MAX_HISTORY_MESSAGES = 20;

export function ChatWidget() {
  const pathname = usePathname();
  // Lift the floating button above the CompareBar when it's showing —
  // otherwise it covers the "Compare Now" CTA.
  const { count: compareCount } = useCompare();
  const compareBarVisible = compareCount > 0;
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [statusText, setStatusText] = useState("Thinking...");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const streamingIndexRef = useRef<number | null>(null);

  // Extract context from URL
  const getBuildingId = () => {
    const match = pathname.match(/\/buildings\/([^/]+)/);
    return match ? match[1] : undefined;
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isOpen && !isMinimized) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, isMinimized]);

  const handleSend = async (messageContent?: string) => {
    const content = messageContent || input;
    if (!content.trim() || loading || isStreaming) return;

    const userMessage: Message = { role: "user", content: content.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setStatusText("Thinking...");

    try {
      // Send only the most recent messages to prevent unbounded context
      const recentMessages = [...messages, userMessage].slice(-MAX_HISTORY_MESSAGES);
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: recentMessages,
          building_id: getBuildingId(),
        }),
      });

      if (!res.ok) throw new Error("Failed to get response");

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      let assistantContent = "";
      let hasStartedResponse = false;

      await parseSSEStream(reader, {
        onStatus: (text) => setStatusText(text),
        onContent: (text) => {
          if (!hasStartedResponse) {
            setMessages((prev) => {
              streamingIndexRef.current = prev.length;
              return [...prev, { role: "assistant", content: "" }];
            });
            hasStartedResponse = true;
            setLoading(false);
            setIsStreaming(true);
          }
          assistantContent += text;
          setMessages((prev) => {
            const updated = [...prev];
            const idx = streamingIndexRef.current ?? updated.length - 1;
            updated[idx] = { role: "assistant", content: assistantContent };
            return updated;
          });
        },
        onError: (msg) => { throw new Error(msg); },
        onDone: () => {},
      });

      if (!hasStartedResponse) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "I couldn't generate a response. Please try again." },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
      setIsStreaming(false);
      streamingIndexRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Don't show on admin pages
  if (pathname.startsWith("/admin")) {
    return null;
  }

  return (
    <>
      {/* Floating Chat Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className={`fixed right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-white text-black shadow-lg hover:bg-zinc-100 transition-all hover:scale-105 group lg:right-6 ${
            compareBarVisible ? "bottom-36 lg:bottom-24" : "bottom-20 lg:bottom-6"
          }`}
          aria-label="Open chat"
        >
          <MessageCircle className="h-6 w-6" />
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-green-500 text-[10px] text-white font-medium">
            AI
          </span>
        </button>
      )}

      {/* Chat Panel */}
      {isOpen && (
        <div
          className={`fixed z-50 flex flex-col bg-zinc-900 border border-zinc-800 shadow-2xl transition-all duration-200 ${
            isMinimized
              ? `right-4 w-72 h-14 rounded-2xl lg:right-6 ${compareBarVisible ? "bottom-36 lg:bottom-24" : "bottom-20 lg:bottom-6"}`
              : "inset-x-0 bottom-0 h-[85vh] rounded-t-2xl sm:inset-x-auto sm:bottom-6 sm:right-4 sm:w-[calc(100vw-2rem)] sm:max-w-sm sm:h-[32rem] sm:max-h-[calc(100vh-6rem)] sm:rounded-2xl lg:right-6"
          }`}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 cursor-pointer"
            onClick={() => isMinimized && setIsMinimized(false)}
          >
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-zinc-600 to-zinc-800">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">LuxApts AI</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMinimized(!isMinimized);
                }}
                className="p-1.5 text-zinc-400 hover:text-white transition-colors rounded-lg hover:bg-zinc-800"
                aria-label={isMinimized ? "Expand" : "Minimize"}
              >
                <Minus className="h-4 w-4" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen(false);
                }}
                className="p-1.5 text-zinc-400 hover:text-white transition-colors rounded-lg hover:bg-zinc-800"
                aria-label="Close chat"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {!isMinimized && (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 ? (
                  <div className="space-y-4">
                    <div className="text-center py-4">
                      <Building2 className="h-10 w-10 mx-auto text-zinc-600 mb-3" />
                      <p className="text-zinc-400 text-sm px-4">
                        I can help you find apartments, compare buildings, and answer questions.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs text-zinc-500 uppercase tracking-wider px-1">
                        Try asking
                      </p>
                      {SUGGESTED_PROMPTS.map((prompt, i) => (
                        <button
                          key={i}
                          onClick={() => handleSend(prompt)}
                          className="w-full text-left px-3 py-2.5 text-sm text-zinc-300 bg-zinc-800/50 rounded-lg hover:bg-zinc-800 transition-colors border border-zinc-800"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  messages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex ${
                        msg.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                          msg.role === "user"
                            ? "bg-white text-black"
                            : "bg-zinc-800 text-zinc-100"
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap leading-relaxed">
                          {msg.content}
                        </p>
                      </div>
                    </div>
                  ))
                )}

                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-zinc-800 rounded-2xl px-4 py-3 flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
                      <span className="text-sm text-zinc-400">{statusText}</span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="p-4 border-t border-zinc-800">
                <div className="flex gap-2">
                  <Input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask about apartments..."
                    className="flex-1 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:ring-zinc-600"
                    disabled={loading}
                  />
                  <Button
                    onClick={() => handleSend()}
                    disabled={loading || !input.trim()}
                    size="icon"
                    className="bg-white text-black hover:bg-zinc-200 disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
