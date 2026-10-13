"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StaycioMark } from "@/components/brand/StaycioMark";
import { Loader2, MailCheck } from "lucide-react";

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Intentionally ignore the result: always show the same generic message
    // so the form can't be used to enumerate which emails have accounts.
    await resetPassword(email);

    setLoading(false);
    setSubmitted(true);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      {/* Background effects */}
      <div className="fixed inset-0 -z-10 hidden dark:block">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-cyan-500/[0.07] rounded-full blur-[120px]" />
      </div>

      <div className="w-full max-w-md">
        {/* Logo */}
        <Link href="/" className="flex items-center justify-center gap-2 mb-8">
          <StaycioMark className="h-8 w-auto text-foreground" />
          <span className="text-2xl font-medium tracking-tight text-foreground">Staycio</span>
        </Link>

        {/* Card */}
        <div className="p-8 rounded-2xl bg-card backdrop-blur-xl border border-border shadow-[0_1px_2px_rgba(20,33,43,0.04)] dark:bg-white/[0.02] dark:border-white/[0.08] dark:shadow-none">
          {submitted ? (
            <div className="text-center">
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/20 to-green-500/20 border border-emerald-500/20">
                <MailCheck className="h-8 w-8 text-positive" />
              </div>
              <h1 className="text-2xl font-semibold text-foreground mb-2">Check your email</h1>
              <p className="text-muted-foreground">
                If an account exists for {email}, we&apos;ve sent a password reset link.
              </p>
            </div>
          ) : (
            <>
              <div className="text-center mb-8">
                <h1 className="text-2xl font-semibold text-foreground mb-2">Forgot password?</h1>
                <p className="text-muted-foreground">
                  Enter your email and we&apos;ll send you a reset link
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="forgot-password-email" className="mb-2 block text-sm font-medium text-foreground/80 dark:text-white/70">Email</label>
                  <Input
                    id="forgot-password-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="h-12 dark:bg-white/[0.03] dark:border-white/[0.08] dark:focus:border-white/20"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
                  disabled={loading}
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {loading ? "Sending..." : "Send reset link"}
                </Button>
              </form>
            </>
          )}

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Remembered your password?{" "}
            <Link href="/auth/login" className="py-3 text-foreground hover:text-link dark:text-white/70 dark:hover:text-white transition-colors">
              Sign in
            </Link>
          </p>
        </div>

        <p className="mt-6 text-center text-sm">
          <Link href="/" className="inline-flex min-h-11 items-center px-2 text-muted-foreground hover:text-link dark:hover:text-white/70 transition-colors">
            Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
