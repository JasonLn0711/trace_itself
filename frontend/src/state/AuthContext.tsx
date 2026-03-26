'use client';

import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { authApi, subscribeApiActivity } from '../lib/api';
import type { User } from '../types';

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const IDLE_CHECK_INTERVAL_MS = 5 * 1000;
const ACTIVITY_THROTTLE_MS = 10 * 1000;

interface AuthContextValue {
  authenticated: boolean;
  loading: boolean;
  user: User | null;
  login: (username: string, password: string) => Promise<User | null>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  markActivity: () => void;
  setSessionHold: (key: string, active: boolean) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const lastActivityAtRef = useRef(Date.now());
  const lastMarkedAtRef = useRef(0);
  const pendingApiCountRef = useRef(0);
  const sessionHoldsRef = useRef<Set<string>>(new Set());
  const logoutInFlightRef = useRef(false);

  const buildLoginRedirect = useCallback((reason?: 'idle') => {
    if (typeof window === 'undefined') {
      return '/login';
    }

    const params = new URLSearchParams();
    if (reason === 'idle') {
      params.set('reason', 'idle');
      const nextPath = `${window.location.pathname}${window.location.search}`;
      if (nextPath && nextPath !== '/' && !nextPath.startsWith('/login')) {
        params.set('next', nextPath);
      }
    }

    const query = params.toString();
    return query ? `/login?${query}` : '/login';
  }, []);

  const finishSignedOut = useCallback((reason?: 'idle') => {
    sessionHoldsRef.current.clear();
    pendingApiCountRef.current = 0;
    setAuthenticated(false);
    setUser(null);
    lastActivityAtRef.current = Date.now();
    lastMarkedAtRef.current = 0;
    logoutInFlightRef.current = false;
    if (typeof window !== 'undefined') {
      window.location.assign(buildLoginRedirect(reason));
    }
  }, [buildLoginRedirect]);

  const evaluateIdleTimeout = useCallback(async () => {
    if (!authenticated || logoutInFlightRef.current) {
      return;
    }
    if (pendingApiCountRef.current > 0 || sessionHoldsRef.current.size > 0) {
      return;
    }
    if (Date.now() - lastActivityAtRef.current < IDLE_TIMEOUT_MS) {
      return;
    }

    logoutInFlightRef.current = true;
    try {
      await authApi.logout();
    } catch {
      // Ignore logout transport errors and clear local session state anyway.
    } finally {
      finishSignedOut('idle');
    }
  }, [authenticated, finishSignedOut]);

  const markActivity = useCallback(() => {
    if (!authenticated || logoutInFlightRef.current) {
      return;
    }
    const now = Date.now();
    if (now - lastMarkedAtRef.current < ACTIVITY_THROTTLE_MS) {
      return;
    }
    lastMarkedAtRef.current = now;
    lastActivityAtRef.current = now;
  }, [authenticated]);

  const setSessionHold = useCallback((key: string, active: boolean) => {
    if (!key) {
      return;
    }
    if (active) {
      sessionHoldsRef.current.add(key);
      lastActivityAtRef.current = Date.now();
      lastMarkedAtRef.current = Date.now();
      return;
    }

    sessionHoldsRef.current.delete(key);
    void evaluateIdleTimeout();
  }, [evaluateIdleTimeout]);

  async function refresh() {
    try {
      const session = await authApi.me();
      setAuthenticated(true);
      setUser(session.user ?? null);
      lastActivityAtRef.current = Date.now();
      lastMarkedAtRef.current = Date.now();
    } catch {
      setAuthenticated(false);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function login(username: string, password: string) {
    const session = await authApi.login(username, password);
    setAuthenticated(true);
    setUser(session.user ?? null);
    lastActivityAtRef.current = Date.now();
    lastMarkedAtRef.current = Date.now();
    return session.user ?? null;
  }

  async function logout() {
    logoutInFlightRef.current = true;
    try {
      await authApi.logout();
    } finally {
      finishSignedOut();
    }
  }

  useEffect(() => {
    return subscribeApiActivity((pendingCount) => {
      pendingApiCountRef.current = pendingCount;
      if (pendingCount === 0) {
        void evaluateIdleTimeout();
      }
    });
  }, [evaluateIdleTimeout]);

  useEffect(() => {
    if (!authenticated || typeof window === 'undefined') {
      return;
    }

    const handleActivity = () => {
      markActivity();
    };
    const handleVisibility = () => {
      if (!document.hidden) {
        lastActivityAtRef.current = Date.now();
        lastMarkedAtRef.current = Date.now();
      }
    };

    const activityEvents: Array<keyof WindowEventMap> = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'focus'];
    for (const eventName of activityEvents) {
      window.addEventListener(eventName, handleActivity, { passive: true });
    }
    window.addEventListener('touchstart', handleActivity, { passive: true });
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      for (const eventName of activityEvents) {
        window.removeEventListener(eventName, handleActivity);
      }
      window.removeEventListener('touchstart', handleActivity);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [authenticated, markActivity]);

  useEffect(() => {
    if (!authenticated || typeof window === 'undefined') {
      return;
    }

    const timer = window.setInterval(() => {
      void evaluateIdleTimeout();
    }, IDLE_CHECK_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [authenticated, evaluateIdleTimeout]);

  const value = useMemo<AuthContextValue>(
    () => ({
      authenticated,
      loading,
      user,
      login,
      logout,
      refresh,
      markActivity,
      setSessionHold
    }),
    [authenticated, loading, user, markActivity, setSessionHold]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return value;
}
