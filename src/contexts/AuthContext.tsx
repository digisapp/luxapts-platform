"use client";

import { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { User, Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/** profiles.role for the signed-in user; null while unknown or signed out. */
export type UserRole = "admin" | "agent" | "partner" | "shower" | "renter";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /**
   * Drives the portal link in the header. Nothing in the UI linked to /admin,
   * so an admin could only reach it by typing the URL. Read-only and purely
   * cosmetic: every portal route re-checks the role server-side.
   */
  role: UserRole | null;
  signUp: (email: string, password: string, name?: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Signup flags a pending welcome email in localStorage; the SIGNED_IN handler
// below sends it once a session exists. The flag stores who it was set for and
// when, so a signup that never confirms can't make the NEXT person to sign in
// on this browser (possibly a different account) receive the welcome email.
const WELCOME_PENDING_KEY = "staycio:welcome-pending";
const WELCOME_PENDING_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type WelcomePending = { email: string; at: number };

function clearWelcomePending() {
  try {
    localStorage.removeItem(WELCOME_PENDING_KEY);
  } catch {}
}

/** Read the flag, discarding anything malformed or written by an older build. */
function readWelcomePending(): WelcomePending | null {
  try {
    const raw = localStorage.getItem(WELCOME_PENDING_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as WelcomePending).email === "string" &&
      typeof (parsed as WelcomePending).at === "number"
    ) {
      return parsed as WelcomePending;
    }
  } catch {}
  clearWelcomePending();
  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<UserRole | null>(null);

  const supabase = useMemo(() => createClient(), []);

  // profiles_read_own (migration 002) lets a signed-in user read their own row.
  const loadRole = useCallback(
    async (userId: string | undefined) => {
      if (!userId) {
        setRole(null);
        return;
      }
      const { data, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();
      setRole(error || !data ? null : ((data.role as UserRole) ?? null));
    },
    [supabase]
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      void loadRole(session?.user?.id);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      void loadRole(session?.user?.id);

      // Send the welcome email flagged at signup once a session exists —
      // the API requires auth and emails the session user's own address.
      // Fires immediately when email confirmation is off, or after the user
      // clicks the confirmation link when it's on.
      if (event === "SIGNED_IN" && session) {
        const pending = readWelcomePending();
        if (pending) {
          const expired = Date.now() - pending.at > WELCOME_PENDING_MAX_AGE_MS;
          const sameUser =
            pending.email.toLowerCase() === (session.user.email ?? "").toLowerCase();
          if (expired) {
            clearWelcomePending();
          } else if (sameUser) {
            clearWelcomePending();
            fetch("/api/auth/welcome", { method: "POST" }).catch(() => {});
          }
        }
      }

      // A stale flag must never survive into the next person's session.
      if (event === "SIGNED_OUT") {
        clearWelcomePending();
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase, loadRole]);

  const signUp = useCallback(
    async (email: string, password: string, name?: string) => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name } },
      });
      if (error) return { error };
      return { error: null };
    },
    [supabase]
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error };
      return { error: null };
    },
    [supabase]
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, [supabase]);

  const resetPassword = useCallback(
    async (email: string) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });
      if (error) return { error };
      return { error: null };
    },
    [supabase]
  );

  return (
    <AuthContext.Provider value={{ user, session, loading, role, signUp, signIn, signOut, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
