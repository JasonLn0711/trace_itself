'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BrandMark } from '../components/BrandMark';
import { Card } from '../components/Primitives';
import { PublicAuthCard } from '../components/PublicAuthCard';
import { resolvePostLoginPath } from '../lib/access';
import { extractApiErrorMessage } from '../lib/api';
import { useAuth } from '../state/AuthContext';

const APP_VERSION = 'v1.1.12';

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
  const nextPath = safeRedirectPath(searchParams?.get('next') ?? null);
  const logoutReason = searchParams?.get('reason') ?? '';
  const currentYear = new Date().getFullYear();

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

  return (
    <div className="auth-entry-shell">
      <div className="auth-entry-grid">
        <section className="auth-entry-intro auth-identity-panel">
          <div className="auth-identity-hero">
            <div className="auth-identity-icon-shell" aria-hidden="true">
              <BrandMark className="auth-identity-icon" />
            </div>
            <div className="auth-identity-title-block">
              <p className="auth-identity-kicker">Mission control</p>
              <h1 className="auth-brand-title">trace_itself</h1>
              <p className="auth-identity-description">A focused workspace for research, planning, and execution.</p>
              <div className="auth-identity-tags" aria-label="Product focus">
                <span>Research</span>
                <span>Plan</span>
                <span>Ship</span>
              </div>
            </div>
          </div>
          <div className="auth-identity-meta auth-identity-footer">
            <p className="auth-identity-signature">Jason Chia-Sheng Lin · PhD student, NYCU</p>
            <div className="auth-identity-meta-row">
              <span>{APP_VERSION}</span>
              <span>© {currentYear}</span>
            </div>
          </div>
        </section>

        <div className="auth-entry-side">
          <PublicAuthCard
            idleTimedOut={logoutReason === 'idle'}
            error={error}
            submitting={submitting}
            onEmailLogin={handleEmailLogin}
          />
        </div>
      </div>
    </div>
  );
}
