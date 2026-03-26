import { FormEvent, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../state/AuthContext';
import { Button, Card, Field, Notice } from '../components/Primitives';
import { extractApiErrorMessage } from '../lib/api';

export function LoginPage() {
  const { authenticated, loading, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authenticated && !loading) {
      navigate('/');
    }
  }, [authenticated, loading, navigate]);

  if (loading) {
    return (
      <div className="login-shell">
        <Card className="login-card">
          <div className="spinner" />
          <h1 className="login-title">trace_itself</h1>
          <p className="muted">Verifying your secure session.</p>
        </Card>
      </div>
    );
  }

  if (authenticated) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      setError(extractApiErrorMessage(err) || 'Could not sign in');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-shell">
      <Card className="login-card login-surface">
        <div className="login-brand-stack">
          <div className="login-brand-mark">T</div>
          <div className="login-copy">
            <div className="login-eyebrow">Private access</div>
            <h1 className="login-title">trace_itself</h1>
            <p className="muted">Sign in to continue.</p>
          </div>
        </div>

        <form className="stack login-form" onSubmit={handleSubmit}>
          <Field label="Username">
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
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

          {error ? <Notice title="Could not sign in" description={error} tone="danger" /> : null}

          <Button type="submit" disabled={submitting || !username.trim() || !password}>
            {submitting ? 'Signing in...' : 'Sign in'}
          </Button>

          <div className="login-meta">
            <span>Use the account your admin created.</span>
            <span>Failed attempts may lock the account briefly.</span>
          </div>
        </form>
      </Card>
    </div>
  );
}
