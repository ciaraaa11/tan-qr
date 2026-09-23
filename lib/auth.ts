import { useEffect, useSyncExternalStore } from "react";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "./supabase";

type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
};

export type SignUpProfile = {
  full_name: string;
  role: "student" | "teacher";
};

let globalSession: Session | null = null;
let globalUser: User | null = null;
let globalLoading = true;
let globalVersion = 0;

const listeners = new Set<() => void>();

let started = false;
let startupTimeout: ReturnType<typeof setTimeout> | null = null;

function notify() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return globalVersion;
}

export function setAuth(session: Session | null) {
  globalSession = session;
  globalUser = session?.user ?? null;
  globalLoading = false;
  globalVersion += 1;

  if (startupTimeout) {
    clearTimeout(startupTimeout);
    startupTimeout = null;
  }

  notify();
}

function ensureAuthStarted() {
  if (started) return;
  started = true;

  // Do not allow startup to remain on the loading screen forever.
  // If session restoration is unusually slow, show the logged-out flow.
  // A later Supabase auth event can still update the session normally.
  startupTimeout = setTimeout(() => {
    if (globalLoading) {
      console.warn(
        "Auth session restore timed out; continuing without a session.",
      );
      setAuth(null);
    }
  }, 5000);

  supabase.auth
    .getSession()
    .then(({ data, error }) => {
      if (error) {
        console.error("Failed to restore auth session:", error);
        setAuth(null);
        return;
      }

      setAuth(data.session);
    })
    .catch((error) => {
      console.error("Failed to restore auth session:", error);
      setAuth(null);
    });

  supabase.auth.onAuthStateChange((_event, session) => {
    setAuth(session);
  });
}

export function useAuth(): AuthState {
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    ensureAuthStarted();
  }, []);

  return {
    session: globalSession,
    user: globalSession?.user ?? globalUser,
    loading: globalLoading,
  };
}

export async function signUp(
  email: string,
  password: string,
  profile?: SignUpProfile,
) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (!error && data.user && profile) {
    // The Phase 3 trigger creates the profile row on signup with a
    // default role of "student". Use the set_profile() SECURITY
    // DEFINER function so the chosen role is saved even when email
    // confirmation is required and there is no session yet.
    const { error: roleError } = await supabase.rpc("set_profile", {
      uid: data.user.id,
      user_email: data.user.email ?? "",
      user_full_name: profile.full_name,
      user_role: profile.role,
    });

    // Fallback for projects that have not applied the migration yet.
    if (roleError) {
      await supabase.from("profiles").upsert(
        {
          id: data.user.id,
          email: data.user.email ?? "",
          full_name: profile.full_name,
          role: profile.role,
        },
        { onConflict: "id" },
      );
    }
  }

  if (!error && data.session) {
    setAuth(data.session);
  }

  return { data, error };
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (!error && data.session) {
    setAuth(data.session);
  }

  return { data, error };
}

export async function signOut() {
  setAuth(null);

  supabase.auth.signOut().catch(() => {});

  return { error: null };
}
