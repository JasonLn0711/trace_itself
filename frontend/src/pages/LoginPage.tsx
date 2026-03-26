import { FormEvent, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../state/AuthContext';
import { Badge, Button, Card, EmptyState, Field } from '../components/Primitives';
import { extractApiErrorMessage } from '../lib/api';

export function LoginPage() {
  const { authenticated, loading, login, user } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
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
      <Card className="login-card hero-banner">
        <div className="hero-chip">
          <Badge tone="info">Account-based</Badge>
          Private self-hosted progress dashboard
        </div>
        <div>
          <h1 className="login-title">trace_itself</h1>
          <p className="muted">
            Sign in to review projects, milestones, daily logs, and the work that needs attention today.
          </p>
          <p className="muted small">Repeated failed sign-ins may temporarily lock an account.</p>
        </div>
        {user ? <Badge tone="info">Last session: {user.display_name}</Badge> : null}

        <form className="stack" onSubmit={handleSubmit}>
          <Field label="Username" hint="Use your account username.">
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              placeholder="your-username"
              required
            />
          </Field>
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
