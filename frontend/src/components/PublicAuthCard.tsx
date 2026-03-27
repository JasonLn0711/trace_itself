'use client';

import { FormEvent, useState } from 'react';
import { Button, Card, Field, Notice } from './Primitives';
import { PUBLIC_AUTH_PROVIDERS, type PublicAuthProviderId } from '../lib/auth-entry';

function ProviderIcon({ providerId }: { providerId: PublicAuthProviderId }) {
  if (providerId === 'google') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M21.8 12.2c0-.76-.07-1.48-.21-2.17H12v4.11h5.48a4.69 4.69 0 0 1-2.04 3.08v2.56h3.3c1.93-1.78 3.06-4.41 3.06-7.58Z"
          fill="currentColor"
        />
        <path
          d="M12 22c2.76 0 5.08-.91 6.77-2.47l-3.3-2.56c-.92.62-2.09.99-3.47.99-2.67 0-4.93-1.8-5.74-4.23H2.84v2.64A9.99 9.99 0 0 0 12 22Z"
          fill="currentColor"
          opacity="0.82"
        />
        <path
          d="M6.26 13.73A6.02 6.02 0 0 1 5.94 12c0-.6.11-1.17.32-1.73V7.63H2.84A10 10 0 0 0 2 12c0 1.61.38 3.14 1.04 4.37l3.22-2.64Z"
          fill="currentColor"
          opacity="0.66"
        />
        <path
          d="M12 5.98c1.5 0 2.84.51 3.89 1.51l2.92-2.92C17.07 2.95 14.75 2 12 2a9.99 9.99 0 0 0-9.16 5.63l3.42 2.64c.81-2.43 3.07-4.29 5.74-4.29Z"
          fill="currentColor"
          opacity="0.48"
        />
      </svg>
    );
  }

  if (providerId === 'github') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          fill="currentColor"
          d="M12 2C6.48 2 2 6.58 2 12.23c0 4.51 2.87 8.34 6.84 9.69.5.1.68-.22.68-.49 0-.24-.01-1.04-.01-1.89-2.78.62-3.37-1.21-3.37-1.21-.45-1.19-1.11-1.5-1.11-1.5-.91-.64.07-.62.07-.62 1 .08 1.53 1.06 1.53 1.06.9 1.57 2.35 1.12 2.93.86.09-.67.35-1.12.64-1.37-2.22-.26-4.56-1.14-4.56-5.08 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.31.1-2.73 0 0 .84-.28 2.75 1.05A9.29 9.29 0 0 1 12 6.9c.85 0 1.71.12 2.51.36 1.9-1.33 2.74-1.05 2.74-1.05.56 1.42.21 2.47.11 2.73.64.72 1.03 1.63 1.03 2.75 0 3.95-2.34 4.82-4.57 5.07.36.32.68.95.68 1.92 0 1.38-.01 2.49-.01 2.83 0 .27.18.6.69.49A10.17 10.17 0 0 0 22 12.23C22 6.58 17.52 2 12 2Z"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v13a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18.5v-13Zm2.22.5 5.78 4.55L17.78 6H6.22Zm11.28 1.3-4.58 3.6a1.5 1.5 0 0 1-1.84 0L6.5 7.3v11.2a.5.5 0 0 0 .5.5h10a.5.5 0 0 0 .5-.5V7.3Z"
      />
    </svg>
  );
}

type PublicAuthCardProps = {
  idleTimedOut?: boolean;
  error?: string;
  submitting?: boolean;
  onEmailLogin: (identifier: string, password: string) => Promise<void>;
};

export function PublicAuthCard({
  idleTimedOut = false,
  error = '',
  submitting = false,
  onEmailLogin
}: PublicAuthCardProps) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const secondaryProviders = PUBLIC_AUTH_PROVIDERS.filter((provider) => provider.id !== 'email');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onEmailLogin(identifier, password);
  }

  return (
    <Card className="public-auth-card public-auth-card-minimal">
      <div className="public-auth-head public-auth-head-minimal">
        <div className="public-auth-kicker">Sign in</div>
      </div>

      {idleTimedOut && !error ? <Notice title="Session timed out" description="Sign in again to continue." tone="warning" /> : null}
      {error ? <Notice title="Sign-in failed" description={error} tone="danger" /> : null}

      <form className="auth-email-form auth-email-form-primary" onSubmit={handleSubmit}>
        <div className="login-fields auth-email-fields">
          <Field label="Username">
            <input
              type="text"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              autoComplete="username"
              autoFocus
              className="login-input"
              placeholder="Username"
              enterKeyHint="next"
              required
            />
          </Field>
          <Field label="Password">
            <div className="password-field">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                className="login-input password-input"
                placeholder="Password"
                enterKeyHint="go"
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </Field>
        </div>

        <Button type="submit" disabled={submitting || !identifier.trim() || !password}>
          {submitting ? 'Signing in...' : 'Sign in'}
        </Button>
      </form>

      <div className="auth-divider" aria-hidden="true">
        <span>Other methods</span>
      </div>

      <div className="auth-option-list auth-option-list-secondary" role="group" aria-label="Other sign-in methods">
        {secondaryProviders.map((provider) => (
          <button
            key={provider.id}
            type="button"
            className="auth-option-button auth-option-button-secondary"
            disabled={provider.state !== 'available'}
            aria-label={`${provider.label} unavailable`}
          >
            <span className="auth-option-icon">
              <ProviderIcon providerId={provider.id} />
            </span>
            <span className="auth-option-copy auth-option-copy-minimal">
              <strong>{provider.id === 'google' ? 'Google' : 'GitHub'}</strong>
            </span>
          </button>
        ))}
      </div>
    </Card>
  );
}
