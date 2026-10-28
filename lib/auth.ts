import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { Session, User } from "@supabase/supabase-js";

type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
};

export type SignUpProfile = {
  full_name: string;
  program: string;
  year_level: string;
  block: string;
};

// Shared authentication state
let globalSession: Session | null = null;
let globalUser: User | null = null;
let globalLoading = true;

const listeners = new Set<() => void>();
let authInitialized = false;

function notify() {
  listeners.forEach((listener) => listener());
}

export function setAuth(session: Session | null) {
  globalSession = session;
  globalUser = session?.user ?? null;
  globalLoading = false;

  notify();
}

function initializeAuth() {
  if (authInitialized) {
    return;
  }

  authInitialized = true;
  globalLoading = true;

  supabase.auth.onAuthStateChange((_event, session) => {
    setAuth(session);
  });
}

export function useAuth(): AuthState {
  const [, forceRender] = useState(0);

  useEffect(() => {
    const listener = () => {
      forceRender((value) => value + 1);
    };

    listeners.add(listener);
    initializeAuth();

    return () => {
      listeners.delete(listener);
    };
  }, []);

  return {
    session: globalSession,
    user: globalUser,
    loading: globalLoading,
  };
}

// Student registration with academic information
export async function signUp(
  email: string,
  password: string,
  profile?: SignUpProfile,
) {
  const academicDetails = profile
    ? {
        full_name: profile.full_name.trim(),
        program: profile.program,
        year_level: profile.year_level,
        block: profile.block,
      }
    : undefined;

  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: academicDetails,
    },
  });

  if (error) {
    return { data, error };
  }

  // Update the profile when a session is available.
  if (data.session && profile) {
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        ...academicDetails,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.session.user.id);

    if (profileError) {
      console.error(
        "Failed to update the new user's profile:",
        profileError.message,
      );

      return { data, error: profileError };
    }
  }

  if (data.session) {
    setAuth(data.session);
  }

  return { data, error: null };
}

// Sign in
export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) {
    return { data, error };
  }

  if (data.session) {
    setAuth(data.session);
  }

  return { data, error: null };
}

// Sign out
export async function signOut() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error("Sign-out failed:", error.message);
    return { error };
  }

  setAuth(null);

  return { error: null };
}
