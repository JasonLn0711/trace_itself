'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AppShell } from './AppShell';
import { useAuth } from '../state/AuthContext';

export function ProtectedShell({ children }: { children: ReactNode }) {
  const { authenticated, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !authenticated) {
      const nextPath = pathname && pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : '';
      router.replace(`/login${nextPath}`);
    }
  }, [authenticated, loading, pathname, router]);

  if (loading) {
    return (
      <div className="screen-center">
        <div className="card loading-card">
          <div className="spinner" />
          <h1>Loading trace_itself</h1>
          <p className="muted">Checking your secure session.</p>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return null;
  }

  return <AppShell>{children}</AppShell>;
}
