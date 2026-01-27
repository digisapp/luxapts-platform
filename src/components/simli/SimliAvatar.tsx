"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { SimliClient } from "simli-client";
import { Mic, MicOff, Phone, PhoneOff, Volume2, VolumeX, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SimliAvatarProps {
  onMessage?: (message: { role: "user" | "assistant"; content: string }) => void;
  className?: string;
  autoStart?: boolean;
  showControls?: boolean;
  compact?: boolean;
}

type ConnectionState = "disconnected" | "connecting" | "connected" | "error";

export function SimliAvatar({
  onMessage,
  className = "",
  autoStart = false,
  showControls = true,
  compact = false,
}: SimliAvatarProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const simliClientRef = useRef<SimliClient | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [isMuted, setIsMuted] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string>("");

  // Initialize the Simli client
  const initializeSimli = useCallback(async () => {
    if (!process.env.NEXT_PUBLIC_SIMLI_API_KEY) {
      setError("Simli API key not configured");
      setConnectionState("error");
      return;
    }

    try {
      setConnectionState("connecting");
      setError(null);

      // Create new Simli client
      const simliClient = new SimliClient();
      simliClientRef.current = simliClient;

      const config = {
        apiKey: process.env.NEXT_PUBLIC_SIMLI_API_KEY,
        faceID: process.env.NEXT_PUBLIC_SIMLI_FACE_ID || "tmp9i8bbq7c",
        handleSilence: true,
        maxSessionLength: 600,
        maxIdleTime: 120,
        videoRef: videoRef,
        audioRef: audioRef,
      };

      // @ts-expect-error - SimliClient Initialize method types
      simliClient.Initialize(config);

      await simliClient.start();

      setConnectionState("connected");

      // Send initial greeting
      await sendTextToAvatar("Hey! I'm Lexi, your LuxApts apartment expert. What kind of place are you looking for?");

    } catch (err) {
      console.error("Simli initialization error:", err);
      setError(err instanceof Error ? err.message : "Failed to connect");
      setConnectionState("error");
    }
  }, []);

  // Convert text to audio and send to avatar
  const sendTextToAvatar = async (text: string) => {
    if (!simliClientRef.current) return;

    try {
      // Use browser's speech synthesis for TTS
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.1;
      utterance.voice = speechSynthesis.getVoices().find(v => v.name.includes("Female")) || null;

      // For now, we'll speak through the browser
      // In production, you'd use ElevenLabs API and send PCM to Simli
      speechSynthesis.speak(utterance);

      onMessage?.({ role: "assistant", content: text });
    } catch (err) {
      console.error("TTS error:", err);
    }
  };

  // Process user speech directly with the transcript text (avoids stale state)
  const processUserSpeechDirect = async (text: string) => {
    try {
      if (!text) return;
      onMessage?.({ role: "user", content: text });

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: text }],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        await sendTextToAvatar(data.message);
      }
    } catch (err) {
      console.error("Speech processing error:", err);
    }
  };

  // Process user speech and get AI response (legacy - kept for audioBlob usage)
  const processUserSpeech = async (audioBlob: Blob) => {
    try {
      // Convert speech to text using Web Speech API
      // In production, use Deepgram or Whisper for better accuracy
      const text = transcript;
      if (!text) return;

      onMessage?.({ role: "user", content: text });

      // Get AI response from our chat API
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: text }],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        await sendTextToAvatar(data.message);
      }
    } catch (err) {
      console.error("Speech processing error:", err);
    }
  };

  // Start listening to user's microphone
  const startListening = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      // Set up speech recognition
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onresult = (event) => {
          const result = event.results[event.results.length - 1];
          if (result.isFinal) {
            const finalTranscript = result[0].transcript;
            setTranscript(finalTranscript);
            processUserSpeechDirect(finalTranscript);
          }
        };

        recognition.start();
        recognitionRef.current = recognition;
      }

      setIsListening(true);
    } catch (err) {
      console.error("Microphone error:", err);
      setError("Could not access microphone");
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
    }
    setIsListening(false);
  };

  // Disconnect from Simli
  const disconnect = () => {
    if (simliClientRef.current) {
      simliClientRef.current.close();
      simliClientRef.current = null;
    }
    stopListening();
    setConnectionState("disconnected");
  };

  // Toggle mute
  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !audioRef.current.muted;
      setIsMuted(!isMuted);
    }
  };

  // Auto-start if enabled
  useEffect(() => {
    if (autoStart) {
      initializeSimli();
    }

    return () => {
      disconnect();
    };
  }, [autoStart, initializeSimli]);

  const videoSize = compact ? "w-32 h-32" : "w-64 h-64";
  const buttonSize = compact ? "h-8 w-8" : "h-10 w-10";

  return (
    <div className={`flex flex-col items-center gap-4 ${className}`}>
      {/* Avatar Video */}
      <div className={`relative ${videoSize} rounded-full overflow-hidden bg-zinc-800 border-2 border-zinc-700`}>
        {connectionState === "connecting" && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/80 z-10">
            <Loader2 className="h-8 w-8 animate-spin text-white" />
          </div>
        )}

        {connectionState === "disconnected" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-zinc-700 to-zinc-900 z-10">
            <div className="text-4xl mb-2">👋</div>
            <p className="text-xs text-zinc-400 text-center px-2">
              {compact ? "Talk to Lexi" : "Click to talk with Lexi"}
            </p>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-900/50 z-10">
            <p className="text-xs text-red-200 text-center px-2">{error}</p>
          </div>
        )}

        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
        />
        <audio ref={audioRef} autoPlay className="hidden" />

        {/* Listening indicator */}
        {isListening && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-green-500/90 text-white text-xs px-2 py-1 rounded-full">
            <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
            Listening...
          </div>
        )}
      </div>

      {/* Controls */}
      {showControls && (
        <div className="flex items-center gap-2">
          {connectionState === "disconnected" ? (
            <Button
              onClick={initializeSimli}
              size={compact ? "sm" : "default"}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <Phone className="h-4 w-4 mr-2" />
              {compact ? "Start" : "Start Chat"}
            </Button>
          ) : connectionState === "connected" ? (
            <>
              <Button
                onClick={isListening ? stopListening : startListening}
                size="icon"
                variant={isListening ? "default" : "outline"}
                className={`${buttonSize} ${isListening ? "bg-green-600 hover:bg-green-700" : ""}`}
              >
                {isListening ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
              </Button>

              <Button
                onClick={toggleMute}
                size="icon"
                variant="outline"
                className={buttonSize}
              >
                {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </Button>

              <Button
                onClick={disconnect}
                size="icon"
                variant="destructive"
                className={buttonSize}
              >
                <PhoneOff className="h-4 w-4" />
              </Button>
            </>
          ) : null}
        </div>
      )}

      {/* Transcript display (optional) */}
      {transcript && !compact && (
        <p className="text-sm text-zinc-400 max-w-xs text-center">
          &ldquo;{transcript}&rdquo;
        </p>
      )}
    </div>
  );
}
