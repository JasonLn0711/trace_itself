'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BrandMark } from '../components/BrandMark';
import { Card } from '../components/Primitives';
import { PublicAuthCard } from '../components/PublicAuthCard';
import { resolvePostLoginPath } from '../lib/access';
import { extractApiErrorMessage } from '../lib/api';
import { useAuth } from '../state/AuthContext';

const valueHighlights = [
  {
    title: 'Track missions',
    detail: 'Organize long-horizon projects, milestones, and near-term priorities in one execution system.'
  },
  {
    title: 'Detect drift',
    detail: 'Spot overdue work, stalled tracks, and timelines at risk before they quietly slip.'
  },
  {
    title: 'Review execution',
    detail: 'Use daily logs and weekly review loops to compare intent with actual output.'
  }
];

function safeRedirectPath(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/';
  }
  return value;
}

export function LoginPage() {
  const { authenticated, loading, login, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [supportNotice, setSupportNotice] = useState('');
  const nextPath = safeRedirectPath(searchParams?.get('next') ?? null);
  const logoutReason = searchParams?.get('reason') ?? '';

  useEffect(() => {
    if (authenticated && !loading) {
      router.replace(resolvePostLoginPath(user, nextPath));
    }
  }, [authenticated, loading, nextPath, router, user]);

  if (loading) {
    return (
      <div className="auth-entry-shell">
        <div className="auth-entry-grid auth-entry-grid-loading">
          <Card className="public-auth-card auth-loading-card">
            <div className="spinner" />
            <h1 className="login-title">trace_itself</h1>
            <p className="muted">Checking your session.</p>
          </Card>
        </div>
      </div>
    );
  }

  if (authenticated) {
    return null;
  }

  async function handleEmailLogin(identifier: string, password: string) {
    setSubmitting(true);
    setError('');
    try {
      const nextUser = await login(identifier, password);
      router.replace(resolvePostLoginPath(nextUser, nextPath));
    } catch (err) {
      setError(extractApiErrorMessage(err) || 'Could not sign in');
    } finally {
      setSubmitting(false);
    }
  }

  function handleSupportAction(action: 'privacy' | 'terms' | 'contact' | 'waitlist') {
    switch (action) {
      case 'privacy':
        setSupportNotice('Privacy and data-handling details will ship as dedicated public pages when open access begins.');
        return;
      case 'terms':
        setSupportNotice('Formal product terms are not published yet during private testing, but public onboarding will add them here.');
        return;
      case 'contact':
        setSupportNotice('For now, contact the person who issued your private-testing access.');
        return;
      case 'waitlist':
        setSupportNotice('Request-access and waitlist flows will be added when the product opens beyond private testing.');
        return;
    }
  }

  return (
    <div className="auth-entry-shell">
      <div className="auth-entry-grid">
        <section className="auth-entry-intro auth-entry-intro-primary">
          <div className="auth-stage-chip">Private Beta</div>

          <div className="auth-brand-row">
            <div className="auth-brand-mark" aria-hidden="true">
              <BrandMark />
            </div>
            <div className="auth-brand-copy">
              <h1 className="auth-brand-title">trace_itself</h1>
              <p className="auth-brand-positioning">Execution intelligence for long-horizon learning and project operations.</p>
            </div>
          </div>

          <p className="auth-intro-copy">
            A calm, product-grade entry point for a system that helps you see what matters now, what is drifting, and what actually moved.
          </p>
        </section>

        <div className="auth-entry-side">
          <PublicAuthCard
            idleTimedOut={logoutReason === 'idle'}
            error={error}
            submitting={submitting}
            onEmailLogin={handleEmailLogin}
          />

          {/* Keep the public auth entry focused on product-facing access. Internal/admin-only routes stay separate. */}
          <div className="auth-support-footer">
            <button type="button" className="auth-support-link" onClick={() => handleSupportAction('privacy')}>Privacy</button>
            <button type="button" className="auth-support-link" onClick={() => handleSupportAction('terms')}>Terms</button>
            <button type="button" className="auth-support-link" onClick={() => handleSupportAction('contact')}>Contact</button>
            <button type="button" className="auth-support-link" onClick={() => handleSupportAction('waitlist')}>Request access</button>
          </div>

          {supportNotice ? <p className="auth-support-note">{supportNotice}</p> : null}
        </div>

        <section className="auth-entry-intro auth-entry-intro-secondary">
          <div className="auth-highlight-list">
            {valueHighlights.map((item) => (
              <div key={item.title} className="auth-highlight-item">
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
              </div>
            ))}
          </div>

          <div className="auth-context-panel">
            <div className="auth-context-block">
              <span className="auth-context-label">Current access</span>
              <p>Private testing runs behind Tailscale today, with product access issued directly to invited users.</p>
            </div>
            <div className="auth-context-block">
              <span className="auth-context-label">Public rollout path</span>
              <p>This login surface is designed to expand into public multi-user auth without exposing internal or admin-only access here.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
