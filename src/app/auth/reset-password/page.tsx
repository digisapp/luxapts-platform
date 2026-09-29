"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StaycioMark } from "@/components/brand/StaycioMark";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "checking" until the Supabase client has processed the link in the URL.
  // It used to wait for a PASSWORD_RECOVERY event that never comes for a bad
  // link, so an expired or reused link spun on "Verifying…" forever.
  const [linkStatus, setLinkStatus] = useState<"checking" | "ready" | "expired" | "invalid">(
    "checking"
  );
  const redirectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear redirect timeout on unmount
  useEffect(() => {
    return () => {
      if (redirectTimeoutRef.current) clearTimeout(redirectTimeoutRef.current);
    };
  }, []);

  // The reset email links here with a PKCE `?code=` that the browser client
  // exchanges on load; a bad link comes back as `error_code` in the query or
  // hash instead. The client leaves error params in the URL (it only cleans
  // up after a success), so they can be read here.
  useEffect(() => {
    const supabase = createClient();
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const errorCode = query.get("error_code") ?? hash.get("error_code");

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setLinkStatus("ready");
    });

    // getSession() resolves only after the client has finished with the URL,
    // so no session here means the link failed: expired, already used, or
    // opened in a different browser than the one that requested it (the PKCE
    // verifier lives in the requesting browser). An existing session is kept
    // on failure, so someone already signed in can still set a password.
    let active = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      if (session) setLinkStatus("ready");
      else setLinkStatus(errorCode === "otp_expired" ? "expired" : "invalid");
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
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

  if (linkStatus === "expired" || linkStatus === "invalid") {
    return (
      <div className="text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20">
          <AlertCircle className="h-8 w-8 text-amber-400" />
        </div>
        <h1 className="text-2xl font-semibold text-white mb-2">
          {linkStatus === "expired" ? "This link has expired" : "This link can’t be used"}
        </h1>
        <p className="text-white/50 mb-6">
          {linkStatus === "expired"
            ? "Reset links work once and expire after a while. Request a new one and we’ll email it right away."
            : "Open the link from your reset email on the same device and browser you requested it from, or request a new one."}
        </p>
        <Button asChild className="w-full h-12 bg-white text-black hover:bg-white/90 font-medium">
          <Link href="/auth/forgot-password">Request a new link</Link>
        </Button>
      </div>
    );
  }

  if (linkStatus === "checking") {
    return (
      <div className="text-center" role="status">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-white/50 mb-4" />
        <h1 className="text-white/70">Verifying your reset link…</h1>
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
          <label htmlFor="reset-password-new-password" className="mb-2 block text-sm font-medium text-white/70">New password</label>
          <Input
            id="reset-password-new-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
            required
            minLength={6}
            className="h-12 bg-white/[0.03] border-white/[0.08] focus:border-white/20"
          />
        </div>

        <div>
          <label htmlFor="reset-password-confirm-password" className="mb-2 block text-sm font-medium text-white/70">Confirm password</label>
          <Input
            id="reset-password-confirm-password"
            type="password"
            autoComplete="new-password"
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
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-cyan-500/[0.07] rounded-full blur-[120px]" />
      </div>

      <div className="w-full max-w-md">
        <Link href="/" className="flex items-center justify-center gap-2 mb-8">
          <StaycioMark className="h-8 w-auto text-white" />
          <span className="text-2xl font-medium tracking-tight text-white">Staycio</span>
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
          <Link href="/" className="inline-flex min-h-11 items-center px-2 text-white/50 hover:text-white/70 transition-colors">
            Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
