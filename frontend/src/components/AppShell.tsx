'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BrandMark } from './BrandMark';
import { LiveAsrDock } from './LiveAsrDock';
import { Badge } from './Primitives';
import { canUseAudioWorkspace, canUseFeature } from '../lib/access';
import { auditEventsApi } from '../lib/api';
import { useLiveAsr } from '../state/LiveAsrContext';
import { useAuth } from '../state/AuthContext';

type NavItem = {
  to: string;
  label: string;
};

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

function ShellSidebarContent({
  idleCountdownMs,
  onLogout,
  onNavigate,
  pathname,
  sessionTimeoutPaused,
  timeoutTone,
  user,
  visibleNavItems
}: {
  idleCountdownMs: number;
  onLogout: () => void;
  onNavigate?: () => void;
  pathname: string;
  sessionTimeoutPaused: boolean;
  timeoutTone: 'neutral' | 'warning' | 'danger' | 'info';
  user: ReturnType<typeof useAuth>['user'];
  visibleNavItems: NavItem[];
}) {
  return (
    <div className="sidebar-shell">
      <div className="brand">
        <div className="brand-mark">
          <BrandMark />
        </div>
        <div>
          <div className="brand-title">trace_itself</div>
          <div className="brand-caption">Execution OS</div>
        </div>
      </div>

      <nav className="nav">
        {visibleNavItems.map((item) => (
          <Link
            key={item.to}
            href={item.to}
            className={isActivePath(pathname, item.to) ? 'active' : ''}
            onClick={onNavigate}
          >
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

      <button className="btn btn-ghost sidebar-logout" type="button" onClick={onLogout}>
        Sign out
      </button>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { idleCountdownMs, logout, sessionTimeoutPaused, user } = useAuth();
  const { error, lastSavedTranscript, notice, pendingSave, state } = useLiveAsr();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const pathname = usePathname() ?? '/';
  const liveDockVisible = !pathname.startsWith('/meetings') && (state !== 'idle' || pendingSave || !!error || !!notice || !!lastSavedTranscript);
  const timeoutTone =
    sessionTimeoutPaused ? 'info' : idleCountdownMs <= 60_000 ? 'danger' : idleCountdownMs <= 120_000 ? 'warning' : 'neutral';
  const visibleNavItems: NavItem[] = [
    ...(canUseFeature(user, 'project_tracer') ? [{ to: '/', label: 'Home' }] : []),
    { to: '/dashboard', label: 'Nutrition' },
    { to: '/meals/new', label: 'Log Meal' },
    { to: '/body-log', label: 'Body Log' },
    { to: '/profile/setup', label: 'Profile' },
    ...(canUseAudioWorkspace(user) ? [{ to: '/meetings', label: 'Audio' }] : []),
    ...(canUseFeature(user, 'project_tracer') ? [{ to: '/projects', label: 'Projects' }, { to: '/tasks', label: 'Tasks' }] : []),
    ...(user?.role === 'admin' ? [{ to: '/control', label: 'Control' }] : []),
    ...(user?.role === 'admin' ? [{ to: '/activity', label: 'Activity' }] : []),
    { to: '/updates', label: 'Updates' },
    ...(canUseFeature(user, 'project_tracer') ? [{ to: '/daily-logs', label: 'Daily Logs' }] : []),
  ];

  useEffect(() => {
    if (!pathname) {
      return;
    }
    void auditEventsApi.trackPageView(pathname).catch(() => undefined);
  }, [pathname]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.classList.toggle('mobile-nav-open', mobileNavOpen);
    return () => {
      document.body.classList.remove('mobile-nav-open');
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    if (!mobileNavOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMobileNavOpen(false);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileNavOpen]);

  function handleLogout() {
    setMobileNavOpen(false);
    void logout();
  }

  return (
    <div className="app-shell">
      <aside className="sidebar sidebar-desktop card">
        <ShellSidebarContent
          idleCountdownMs={idleCountdownMs}
          onLogout={handleLogout}
          pathname={pathname}
          sessionTimeoutPaused={sessionTimeoutPaused}
          timeoutTone={timeoutTone}
          user={user}
          visibleNavItems={visibleNavItems}
        />
      </aside>

      <div className="app-shell-main">
        <div className="app-mobile-topbar card">
          <Link href="/" className="mobile-topbar-brand" aria-label="trace_itself home">
            <div className="brand-mark mobile-topbar-mark">
              <BrandMark />
            </div>
            <div className="mobile-topbar-copy">
              <div className="brand-title">trace_itself</div>
              <div className="brand-caption">Execution OS</div>
            </div>
          </Link>

          <button
            type="button"
            className={`mobile-menu-button${mobileNavOpen ? ' is-open' : ''}`}
            aria-expanded={mobileNavOpen}
            aria-controls="mobile-nav-drawer"
            aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
            onClick={() => setMobileNavOpen((current) => !current)}
          >
            <span className="mobile-menu-icon" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span className="mobile-menu-label">{mobileNavOpen ? 'Close' : 'Menu'}</span>
          </button>
        </div>

        <div className={`content${liveDockVisible ? ' content-with-live-dock' : ''}`}>
          {children}
        </div>
        <LiveAsrDock />
      </div>

      <div className={`mobile-nav-layer${mobileNavOpen ? ' is-open' : ''}`} aria-hidden={!mobileNavOpen}>
        <button
          type="button"
          className="mobile-nav-backdrop"
          aria-label="Close navigation"
          tabIndex={mobileNavOpen ? 0 : -1}
          onClick={() => setMobileNavOpen(false)}
        />
        <aside id="mobile-nav-drawer" className="mobile-nav-drawer card">
          <ShellSidebarContent
            idleCountdownMs={idleCountdownMs}
            onLogout={handleLogout}
            onNavigate={() => setMobileNavOpen(false)}
            pathname={pathname}
            sessionTimeoutPaused={sessionTimeoutPaused}
            timeoutTone={timeoutTone}
            user={user}
            visibleNavItems={visibleNavItems}
          />
        </aside>
      </div>
    </div>
  );
}
