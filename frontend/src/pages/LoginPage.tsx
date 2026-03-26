import { FormEvent, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../state/AuthContext';
import { Badge, Button, Card, EmptyState, Field } from '../components/Primitives';
import { extractApiErrorMessage } from '../lib/api';

export function LoginPage() {
  const { authenticated, loading, login } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
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
      await login(password);
      navigate('/');
    } catch (err) {
      setError(extractApiErrorMessage(err) || 'Could not sign in');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-shell">
      <Card className="login-card hero-banner">
        <div className="hero-chip">
          <Badge tone="info">Single-user</Badge>
          Private self-hosted progress dashboard
        </div>
        <div>
          <h1 className="login-title">trace_itself</h1>
          <p className="muted">
            Sign in to review projects, milestones, daily logs, and the work that needs attention today.
          </p>
        </div>

        <form className="stack" onSubmit={handleSubmit}>
          <Field label="Access password" hint="Use the password configured on your lab server.">
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="Enter password"
              required
            />
          </Field>

          {error ? <EmptyState title="Login failed" description={error} /> : null}

          <Button type="submit" disabled={submitting}>
            {submitting ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>
      </Card>
    </div>
  );
}

