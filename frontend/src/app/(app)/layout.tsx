import type { ReactNode } from 'react';
import { ProtectedShell } from '../../components/ProtectedShell';

export default function AuthenticatedLayout({ children }: { children: ReactNode }) {
  return <ProtectedShell>{children}</ProtectedShell>;
}
