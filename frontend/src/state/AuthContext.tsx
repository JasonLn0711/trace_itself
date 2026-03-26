'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '../lib/api';
import type { User } from '../types';

interface AuthContextValue {
  authenticated: boolean;
  loading: boolean;
  user: User | null;
  login: (username: string, password: string) => Promise<User | null>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const session = await authApi.me();
      setAuthenticated(true);
      setUser(session.user ?? null);
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
    return session.user ?? null;
  }

  async function logout() {
    try {
      await authApi.logout();
    } finally {
      setAuthenticated(false);
      setUser(null);
      window.location.assign('/login');
    }
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      authenticated,
      loading,
      user,
      login,
      logout,
      refresh
    }),
    [authenticated, loading, user]
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
