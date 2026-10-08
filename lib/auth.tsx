"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

export type AuthStatus = "loading" | "signed-in" | "signed-out";

export type AuthUser = {
  id: string;
  email: string | null;
};

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  /** From public.profiles; null until loaded or when signed out. */
  displayName: string | null;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Client-side view of the Supabase session. Kept out of the root layout's
 * server render on purpose: reading cookies there would make every page
 * dynamic. middleware.ts refreshes the session and gates protected routes;
 * this context only drives UI (header, greeting) and tells UserStateProvider
 * whose rows to load. RLS, not this context, is what protects the data.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<{ userId: string; displayName: string } | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    // Fires INITIAL_SESSION immediately, then on every sign-in, sign-out and
    // token refresh, including ones made in other tabs.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const next = session?.user ?? null;
      setUser((current) => {
        if (!next) return null;
        if (current && current.id === next.id && current.email === (next.email ?? null)) {
          return current;
        }
        return { id: next.id, email: next.email ?? null };
      });
      setStatus(next ? "signed-in" : "signed-out");
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = user?.id ?? null;
  const email = user?.email ?? null;

  // Supabase calls must not run inside the onAuthStateChange callback, so the
  // profile is loaded here, keyed on the user id.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    getSupabaseBrowser()
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        // Same fallback the signup trigger uses, in case the read fails.
        const fallback = email?.split("@")[0] || "WatchNow member";
        setProfile({ userId, displayName: data?.display_name ?? fallback });
      });
    return () => {
      cancelled = true;
    };
  }, [userId, email]);

  const signOut = useCallback(async () => {
    await getSupabaseBrowser().auth.signOut();
    router.push("/");
    router.refresh();
  }, [router]);

  // Ignore a profile that belongs to a previous user.
  const displayName = profile && profile.userId === userId ? profile.displayName : null;

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, displayName, signOut }),
    [status, user, displayName, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
