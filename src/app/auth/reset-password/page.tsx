"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Sparkles, CheckCircle2, AlertCircle } from "lucide-react";

function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const redirectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear redirect timeout on unmount
  useEffect(() => {
    return () => {
      if (redirectTimeoutRef.current) clearTimeout(redirectTimeoutRef.current);
    };
  }, []);

  // Supabase sends the token as a hash fragment: #access_token=...&type=recovery
  // The Supabase client automatically exchanges it on load.
  useEffect(() => {
    const supabase = createClient();

    // Listen for the PASSWORD_RECOVERY event which fires when the
    // recovery token in the URL hash has been successfully exchanged.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setSessionReady(true);
      }
    });

    // Also check if there's already an active session (user navigated here with token)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSessionReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    setLoading(false);

    if (error) {
      setError(error.message);
    } else {
      setSuccess(true);
      redirectTimeoutRef.current = setTimeout(() => router.push("/"), 2500);
    }
  };

  if (success) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/20 to-green-500/20 border border-emerald-500/20">
          <CheckCircle2 className="h-8 w-8 text-emerald-400" />
        </div>
        <h1 className="text-2xl font-semibold text-white mb-2">Password updated!</h1>
        <p className="text-white/50">Redirecting you home…</p>
      </div>
    );
  }

  if (!sessionReady) {
    return (
      <div className="text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-white/50 mb-4" />
        <p className="text-white/50">Verifying your reset link…</p>
        <p className="text-white/30 text-sm mt-2">
          If nothing happens,{" "}
          <Link href="/auth/forgot-password" className="text-white/50 hover:text-white underline">
            request a new link
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="text-center mb-8">
        <h1 className="text-2xl font-semibold text-white mb-2">Set new password</h1>
        <p className="text-white/50">Choose a strong password for your account</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-2 block text-sm font-medium text-white/70">New password</label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
            required
            minLength={6}
            className="h-12 bg-white/[0.03] border-white/[0.08] focus:border-white/20"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-white/70">Confirm password</label>
          <Input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Same password again"
            required
            className="h-12 bg-white/[0.03] border-white/[0.08] focus:border-white/20"
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        <Button
          type="submit"
          className="w-full h-12 bg-white text-black hover:bg-white/90 font-medium"
          disabled={loading}
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {loading ? "Updating…" : "Update password"}
        </Button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-4">
      <div className="fixed inset-0 -z-10">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-gradient-to-r from-violet-500/10 via-purple-500/10 to-cyan-500/10 rounded-full blur-[120px]" />
      </div>

      <div className="w-full max-w-md">
        <Link href="/" className="flex items-center justify-center gap-2 mb-8">
          <Sparkles className="h-6 w-6 text-cyan-400" />
          <span className="text-2xl font-semibold text-white">Staycio</span>
        </Link>

        <div className="p-8 rounded-2xl bg-white/[0.02] backdrop-blur-xl border border-white/[0.08]">
          <Suspense
            fallback={
              <div className="text-center">
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-white/50" />
              </div>
            }
          >
            <ResetPasswordForm />
          </Suspense>
        </div>

        <p className="mt-6 text-center text-sm">
          <Link href="/" className="text-white/50 hover:text-white/70 transition-colors">
            Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
