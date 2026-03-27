'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Badge } from './Primitives';
import { canUseAudioWorkspace, canUseFeature } from '../lib/access';
import { useAuth } from '../state/AuthContext';

function isActivePath(pathname: string, href: string) {
  if (href === '/') {
    return pathname === '/';
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function formatCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { idleCountdownMs, logout, sessionTimeoutPaused, user } = useAuth();
  const pathname = usePathname() ?? '/';
  const timeoutTone =
    sessionTimeoutPaused ? 'info' : idleCountdownMs <= 60_000 ? 'danger' : idleCountdownMs <= 120_000 ? 'warning' : 'neutral';
  const visibleNavItems = [
    ...(canUseFeature(user, 'project_tracer') ? [{ to: '/', label: 'Home' }] : []),
    ...(canUseAudioWorkspace(user) ? [{ to: '/meetings', label: 'Audio' }] : []),
    ...(canUseFeature(user, 'project_tracer') ? [{ to: '/projects', label: 'Projects' }, { to: '/tasks', label: 'Tasks' }] : []),
    ...(user?.role === 'admin' ? [{ to: '/users', label: 'Control' }] : []),
    { to: '/updates', label: 'Updates' },
    ...(canUseFeature(user, 'project_tracer') ? [{ to: '/daily-logs', label: 'Logs' }] : []),
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar card">
        <div className="brand">
          <div className="brand-mark">T</div>
          <div>
            <div className="brand-title">trace_itself</div>
          </div>
        </div>

        <nav className="nav">
          {visibleNavItems.map((item) => (
            <Link key={item.to} href={item.to} className={isActivePath(pathname, item.to) ? 'active' : ''}>
              <span className="nav-title">{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="account-card">
          <div className="helper-row">
            <div className="account-name">{user?.display_name ?? 'Unknown user'}</div>
            <Badge tone={user?.role === 'admin' ? 'warning' : 'info'}>{user?.role ?? 'member'}</Badge>
          </div>
          <div className="account-meta">@{user?.username ?? 'unknown'}</div>
          <div className={`session-clock session-clock-${timeoutTone}`} role="status" aria-live="polite">
            <span className="session-clock-label">Timeout</span>
            <strong>{formatCountdown(idleCountdownMs)}</strong>
            <span className="session-clock-state">{sessionTimeoutPaused ? 'Paused' : 'Idle'}</span>
          </div>
        </div>

        <button className="btn btn-ghost sidebar-logout" type="button" onClick={() => void logout()}>
          Sign out
        </button>
      </aside>

      <div className="content">
        {children}
      </div>
    </div>
  );
}
