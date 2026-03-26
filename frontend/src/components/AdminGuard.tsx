'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../state/AuthContext';

export function AdminGuard({ children }: { children: ReactNode }) {
  const { loading, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user?.role !== 'admin') {
      router.replace('/');
    }
  }, [loading, router, user]);

  if (loading || user?.role !== 'admin') {
    return null;
  }

  return <>{children}</>;
}
