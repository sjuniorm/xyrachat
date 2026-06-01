import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import {
  registerForPushNotifications,
  unregisterPushToken,
} from "../lib/push";
import type { Availability, Profile } from "../types";

type AuthContextValue = {
  initializing: boolean;
  session: Session | null;
  profile: Profile | null;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setAvailability: (a: Availability) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase
    .from("profiles")
    .select("id, org_id, full_name, email, role, avatar_url, availability")
    .eq("id", userId)
    .maybeSingle();
  return (data as Profile | null) ?? null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [initializing, setInitializing] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const pushRegisteredFor = useRef<string | null>(null);

  const loadProfile = useCallback(async (userId: string) => {
    const p = await fetchProfile(userId);
    setProfile(p);
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) {
        void loadProfile(data.session.user.id);
      }
      setInitializing(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.user) {
        void loadProfile(nextSession.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  // Register for push once per signed-in user (after the session is live).
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId || pushRegisteredFor.current === userId) return;
    pushRegisteredFor.current = userId;
    void registerForPushNotifications();
  }, [session?.user?.id]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    return { error: error?.message };
  }, []);

  const signOut = useCallback(async () => {
    await unregisterPushToken();
    pushRegisteredFor.current = null;
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user) await loadProfile(session.user.id);
  }, [session?.user, loadProfile]);

  const setAvailability = useCallback(
    async (availability: Availability) => {
      if (!session?.user) return;
      // Optimistic.
      setProfile((p) => (p ? { ...p, availability } : p));
      const { error } = await supabase
        .from("profiles")
        .update({ availability })
        .eq("id", session.user.id);
      if (error) {
        // Revert on failure.
        await loadProfile(session.user.id);
      }
    },
    [session?.user, loadProfile],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      initializing,
      session,
      profile,
      signIn,
      signOut,
      refreshProfile,
      setAvailability,
    }),
    [
      initializing,
      session,
      profile,
      signIn,
      signOut,
      refreshProfile,
      setAvailability,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
