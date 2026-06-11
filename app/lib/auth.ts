'use client';

import { useEffect, useState } from 'react';

export interface AuthUser {
  login: string;
  avatar_url: string;
  name: string | null;
}

export interface AuthState {
  user: AuthUser | null;
  canEdit: boolean;
  loading: boolean;
}

/**
 * Shared auth hook — fetches session once, caches in module-level state
 * so multiple components on the same page don't re-fetch.
 */
let cachedAuth: { user: AuthUser | null; canEdit: boolean } | null = null;
let fetchPromise: Promise<{ user: AuthUser | null; canEdit: boolean }> | null =
  null;

function fetchAuth(): Promise<{ user: AuthUser | null; canEdit: boolean }> {
  if (fetchPromise) return fetchPromise;
  fetchPromise = fetch('/api/auth/session')
    .then((r) => r.json())
    .then((data) => {
      cachedAuth = data;
      return data;
    })
    .catch(() => {
      const fallback = { user: null, canEdit: false };
      cachedAuth = fallback;
      return fallback;
    });
  return fetchPromise;
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    user: cachedAuth?.user ?? null,
    canEdit: cachedAuth?.canEdit ?? false,
    loading: cachedAuth === null,
  });

  useEffect(() => {
    let active = true;
    if (cachedAuth) {
      setState({ ...cachedAuth, loading: false });
      return;
    }
    fetchAuth().then((data) => {
      if (!active) return;
      setState({ ...data, loading: false });
    });

    return () => {
      active = false;
    };
  }, []);

  return state;
}

/** Clear cached auth (call on logout). */
export function clearAuthCache() {
  cachedAuth = null;
  fetchPromise = null;
}
