"use client";

import { useState, useRef, useEffect } from "react";
import { useSitePathname } from "@/hooks/use-site-pathname";
import { useMediaQuery } from "@/hooks/use-media-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, X, Send, Loader2, Sparkles, Building2, Minus, Phone } from "lucide-react";
import { parseSSEStream } from "@/lib/chat/stream-parser";
import { useCompare } from "@/hooks/useCompare";
import { isPortalRoute } from "@/hooks/portal-routes";
import { OPEN_CHAT_EVENT } from "@/lib/chat/open-chat";
import { STACY_MAIN_LINE } from "@/lib/constants/stacy";

/** URL-safe conversation id; matches the session_key format the API accepts. */
function newSessionKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

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

/**
 * Phone chat sheet geometry. iOS Safari keeps position:fixed elements on the
 * layout viewport, which does not shrink when the keyboard opens, so a
 * bottom-0 sheet slid under the keyboard and Safari scrolled its header off
 * the top to reveal the input. Tracking the visual viewport pins the sheet to
 * the area the user can actually see: 90% of the screen normally, exactly the
 * space above the keyboard while typing.
 */
function useVisualViewportSheet(enabled: boolean) {
  const [box, setBox] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!enabled || !vv) return;
    const update = () => {
      const height = Math.min(vv.height, Math.round(window.innerHeight * 0.9));
      setBox({ top: Math.round(vv.offsetTop + vv.height - height), height });
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [enabled]);
  return enabled ? box : null;
}

export function ChatWidget() {
  const pathname = useSitePathname();
  // Lift the floating button above the CompareBar when it's showing —
  // otherwise it covers the "Compare Now" CTA.
  const { count: compareCount } = useCompare();
  const compareBarVisible = compareCount > 0;
  const [isOpen, setIsOpen] = useState(false);
  // The homepage hero is itself the Stacy prompt, so a second entry point on
  // top of it was redundant — and on a phone the bubble sat over the Ask Stacy
  // button. It appears once the hero has scrolled away.
  const isHome = pathname === "/";
  const [pastHero, setPastHero] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  // Stable for one conversation so the admin Chat Log stores a single
  // transcript instead of one row per request. Regenerated on Clear.
  const sessionKeyRef = useRef<string>("");
  if (!sessionKeyRef.current) sessionKeyRef.current = newSessionKey();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [statusText, setStatusText] = useState("Thinking...");
  const listRef = useRef<HTMLDivElement>(null);
  // Follow new tokens only while the reader is at the bottom, so scrolling up
  // mid-stream to reread something is not yanked back down.
  const stickToBottomRef = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const streamingIndexRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!isHome) return;
    const update = () => setPastHero(window.scrollY > window.innerHeight * 0.6);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [isHome]);

  // Abort any in-flight stream on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Extract context from URL
  const getBuildingId = () => {
    const match = pathname.match(/\/buildings\/([^/]+)/);
    return match ? match[1] : undefined;
  };

  // On phones the open chat is a sheet over the page.
  const isPhone = useMediaQuery("(max-width: 639px)");
  const sheetMode = isOpen && !isMinimized && isPhone;
  const sheetBox = useVisualViewportSheet(sheetMode);

  // Building and unit pages have a sticky Schedule Tour bar on phones that
  // carries its own chat button, so the floating bubble stays off it there.
  const hasStickyCta = /^\/buildings\/[^/]+/.test(pathname);

  // Other components (the building page's bottom bar) open the chat by event.
  useEffect(() => {
    const open = () => {
      setIsOpen(true);
      setIsMinimized(false);
    };
    window.addEventListener(OPEN_CHAT_EVENT, open);
    return () => window.removeEventListener(OPEN_CHAT_EVENT, open);
  }, []);

  // Lock the page behind the phone sheet so a swipe that runs past the end of
  // the message list does not scroll the listing underneath.
  useEffect(() => {
    if (!sheetMode) return;
    const html = document.documentElement;
    const prevHtml = html.style.overflow;
    const prevBody = document.body.style.overflow;
    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      html.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
    };
  }, [sheetMode]);

  // scrollIntoView() on every streamed chunk also scrolled the page and made
  // the sheet jitter on iOS; move only the message list.
  useEffect(() => {
    const list = listRef.current;
    if (list && stickToBottomRef.current) list.scrollTop = list.scrollHeight;
  }, [messages, loading]);

  useEffect(() => {
    // Only auto-focus where there is a hardware keyboard: on a phone it would
    // throw the keyboard over the suggested prompts the moment chat opens.
    if (isOpen && !isMinimized && window.matchMedia("(hover: hover)").matches) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, isMinimized]);

  const handleSend = async (messageContent?: string) => {
    const content = messageContent || input;
    if (!content.trim() || loading || isStreaming) return;

    const userMessage: Message = { role: "user", content: content.trim() };
    stickToBottomRef.current = true;
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setStatusText("Thinking...");

    // Abort any previous stream before starting a new one
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Server-provided error message (e.g. "Rate limit exceeded") to surface
    // instead of the generic fallback
    let serverErrorMessage: string | null = null;

    try {
      // Send only the most recent messages to prevent unbounded context
      const recentMessages = [...messages, userMessage].slice(-MAX_HISTORY_MESSAGES);
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: recentMessages,
          building_id: getBuildingId(),
          session_key: sessionKeyRef.current,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        // Surface what the server actually said (rate limit, not configured,
        // bad request) instead of a generic failure the user can't act on.
        const errorBody = (await res.json().catch(() => ({}))) as { error?: string };
        serverErrorMessage =
          errorBody.error ||
          (res.status === 429
            ? "Too many messages right now. Please wait a moment and try again."
            : `Sorry, I couldn't reach the assistant (error ${res.status}). Please try again.`);
        throw new Error(serverErrorMessage);
      }

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
        onError: (msg) => {
          serverErrorMessage = msg;
          throw new Error(msg);
        },
        onDone: () => {},
      });

      if (!hasStartedResponse) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "I couldn't generate a response. Please try again." },
        ]);
      }
    } catch (err) {
      // Aborted by unmount or a newer message — nothing to report
      if (err instanceof DOMException && err.name === "AbortError") return;
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: serverErrorMessage || "Sorry, I encountered an error. Please try again.",
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

  const floatOffset = compareBarVisible
    ? "bottom-[calc(9.25rem+env(safe-area-inset-bottom,0px))] lg:bottom-[5.75rem]"
    : "bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] lg:bottom-6";
  const headerButton =
    "flex h-11 w-11 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white sm:h-8 sm:w-8";

  // Don't show on portal pages (admin/shower/partner/agent) — the bubble
  // covers their content on mobile and consumers never see those routes —
  // or on the sign-in/sign-up screens, where it sat on the form's links.
  if (isPortalRoute(pathname) || pathname.startsWith("/auth/")) {
    return null;
  }

  return (
    <>
      {/* Floating Chat Button. On phones it sits above the bottom tab bar
          (and the compare bar when that is up), including the home-indicator
          inset; on building pages the sticky tour bar has the chat button. */}
      {!isOpen && (!isHome || pastHero) && (
        <button
          onClick={() => setIsOpen(true)}
          className={`fixed right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-white text-black shadow-lg hover:bg-zinc-100 transition-all hover:scale-105 group lg:right-6 ${
            hasStickyCta ? "max-lg:hidden " : ""
          }${floatOffset}`}
          aria-label="Open AI chat"
        >
          <MessageCircle className="h-6 w-6" />
          <span
            aria-hidden="true"
            className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-cyan-400 text-[10px] text-black font-semibold"
          >
            AI
          </span>
        </button>
      )}

      {/* Chat Panel */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Chat with Stacy"
          style={sheetBox ? { top: sheetBox.top, height: sheetBox.height } : undefined}
          className={`fixed z-50 flex flex-col bg-zinc-900 border border-zinc-800 shadow-2xl ${
            isMinimized
              ? `right-4 w-72 h-14 rounded-2xl lg:right-6 ${floatOffset}`
              : `inset-x-0 rounded-t-2xl ${sheetBox ? "" : "bottom-0 h-[90dvh]"} sm:inset-x-auto sm:bottom-6 sm:right-4 sm:w-[calc(100vw-2rem)] sm:max-w-sm sm:h-[32rem] sm:max-h-[calc(100dvh-6rem)] sm:rounded-2xl lg:right-6`
          }`}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 cursor-pointer"
            onClick={() => isMinimized && setIsMinimized(false)}
          >
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-400">
                <Sparkles className="h-4 w-4 text-black" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">Stacy</p>
                <p className="text-[11px] leading-tight text-zinc-400">Staycio assistant</p>
              </div>
            </div>
            <div className="flex items-center gap-1 -mr-2 sm:mr-0">
              {!isMinimized && (
                <a
                  href={`tel:${STACY_MAIN_LINE.e164}`}
                  onClick={(e) => e.stopPropagation()}
                  className={headerButton}
                  aria-label={`Call Stacy at ${STACY_MAIN_LINE.display}`}
                >
                  <Phone className="h-4 w-4" />
                </a>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMinimized(!isMinimized);
                }}
                className={headerButton}
                aria-label={isMinimized ? "Expand" : "Minimize"}
              >
                <Minus className="h-4 w-4" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen(false);
                }}
                className={headerButton}
                aria-label="Close chat"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {!isMinimized && (
            <>
              {/* Messages */}
              <div
                ref={listRef}
                onScroll={(e) => {
                  const el = e.currentTarget;
                  stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
                }}
                className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-4"
              >
                {messages.length === 0 ? (
                  <div className="space-y-4">
                    <div className="text-center py-4">
                      <Building2 className="h-10 w-10 mx-auto text-zinc-600 mb-3" />
                      <p className="text-zinc-400 text-sm px-4">
                        Hi, I&apos;m Stacy. I can help you find apartments, compare buildings, and answer questions.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs text-zinc-400 uppercase tracking-wider px-1">
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
              </div>

              {/* Input */}
              <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:pb-4 border-t border-zinc-800">
                <div className="flex gap-2">
                  <Input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask about apartments..."
                    enterKeyHint="send"
                    className="flex-1 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:ring-zinc-600"
                    disabled={loading}
                  />
                  <Button
                    onClick={() => handleSend()}
                    disabled={loading || isStreaming || !input.trim()}
                    size="icon"
                    aria-label="Send message"
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
