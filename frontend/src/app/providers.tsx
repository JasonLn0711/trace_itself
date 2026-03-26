'use client';

import type { ReactNode } from 'react';
import { AuthProvider } from '../state/AuthContext';

export function Providers({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
