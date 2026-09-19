import { useSyncExternalStore } from 'react';
import { supabase } from './supabase';
import type { Session, User } from '@supabase/supabase-js';

type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
};

export type SignUpProfile = {
  full_name: string;
  role: 'student' | 'teacher';
};

let globalSession: Session | null = null;
let globalUser: User | null = null;
let globalLoading = false;

let listeners: Set<() => void> = new Set();

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
  return globalSession;
}

export function setAuth(session: Session | null) {
  globalSession = session;
  globalUser = session?.user ?? null;
  globalLoading = false;

  notify();
}

export function useAuth(): AuthState {
  const session = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot
  );

  return {
    session,
    user: session?.user ?? globalUser,
    loading: globalLoading,
  };
}

export async function signUp(
  email: string,
  password: string,
  profile?: SignUpProfile
) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (!error && data.session && profile) {
    // The Phase 3 trigger creates the profile row on signup.
    // Fill in the full_name and role the student chose.
    await supabase
      .from('profiles')
      .update({
        full_name: profile.full_name,
        role: profile.role,
      })
      .eq('id', data.session.user.id);
  }

  if (!error && data.session) {
    setAuth(data.session);
  }

  return { data, error };
}

export async function signIn(
  email: string,
  password: string
) {
  const { data, error } =
    await supabase.auth.signInWithPassword({
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