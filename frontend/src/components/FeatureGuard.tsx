'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { preferredRouteForUser } from '../lib/access';
import { useAuth } from '../state/AuthContext';

type FeatureGuardProps = {
  allowed: boolean;
  children: ReactNode;
};

export function FeatureGuard({ allowed, children }: FeatureGuardProps) {
  const { loading, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !allowed) {
      router.replace(preferredRouteForUser(user));
    }
  }, [allowed, loading, router, user]);

  if (loading || !allowed) {
    return null;
  }

  return <>{children}</>;
}
