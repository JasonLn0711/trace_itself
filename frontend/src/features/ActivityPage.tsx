'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Badge,
  Card,
  EmptyState,
  Field,
  MetricPill,
  Notice,
  PageIntro,
  SectionHeader,
  SegmentedControl
} from '../components/Primitives';
import { auditEventsApi, extractApiErrorMessage, usersApi } from '../lib/api';
import { formatDateTime } from '../lib/dates';
import { formatEnumLabel, type Tone } from '../lib/presentation';
import type { AuditEvent, AuditEventType, User } from '../types';

type ActivityFilter = 'all' | AuditEventType;

const activityFilterOptions = [
  { value: 'all', label: 'All' },
  { value: 'login_success', label: 'Sign-ins' },
  { value: 'login_failed', label: 'Failed' },
  { value: 'logout', label: 'Sign-outs' },
  { value: 'page_view', label: 'Page views' }
] satisfies Array<{ value: ActivityFilter; label: string }>;

function toneForAuditEvent(eventType: string): Tone {
  switch (eventType) {
    case 'login_success':
      return 'success';
    case 'login_failed':
      return 'danger';
    case 'logout':
      return 'neutral';
    case 'page_view':
    default:
      return 'info';
  }
}

function auditEventTitle(event: AuditEvent) {
  switch (event.event_type) {
    case 'login_success':
      return 'Signed in';
    case 'login_failed':
      return 'Sign-in attempt failed';
    case 'logout':
      return 'Signed out';
    case 'page_view':
      return event.path ? `Visited ${event.path}` : 'Visited a page';
    default:
      return formatEnumLabel(event.event_type);
  }
}

function auditEventSummary(event: AuditEvent) {
  const userLabel = event.display_name || event.username || 'Unknown user';
  const detail = event.path || event.description || 'No extra details.';
  return `${userLabel} · ${detail}`;
}

export function ActivityPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [eventFilter, setEventFilter] = useState<ActivityFilter>('all');
  const [userFilter, setUserFilter] = useState('');
  const hasLoadedInitialRef = useRef(false);

  async function loadEvents(showSpinner = false) {
    if (showSpinner) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    try {
      const items = await auditEventsApi.list({
        limit: 200,
        event_type: eventFilter === 'all' ? undefined : eventFilter,
        user_id: userFilter ? Number(userFilter) : undefined
      });
      setEvents(items);
      setError('');
    } catch (err) {
      setError(extractApiErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    let alive = true;

    async function loadInitial() {
      try {
        const [nextUsers, nextEvents] = await Promise.all([
          usersApi.list(),
          auditEventsApi.list({ limit: 200 })
        ]);
        if (!alive) {
          return;
        }
        setUsers(nextUsers);
        setEvents(nextEvents);
        setError('');
        hasLoadedInitialRef.current = true;
      } catch (err) {
        if (alive) {
          setError(extractApiErrorMessage(err));
        }
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    }

    void loadInitial();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (loading || !hasLoadedInitialRef.current) {
      return;
    }
    void loadEvents();
  }, [eventFilter, userFilter]);

  const signInCount = events.filter((event) => event.event_type === 'login_success').length;
  const failedCount = events.filter((event) => event.event_type === 'login_failed').length;
  const signOutCount = events.filter((event) => event.event_type === 'logout').length;
  const pageViewCount = events.filter((event) => event.event_type === 'page_view').length;
  const activeUserCount = useMemo(() => {
    const keys = new Set(
      events
        .map((event) => event.user_id ?? event.username ?? null)
        .filter((value) => value !== null)
    );
    return keys.size;
  }, [events]);

  if (loading) {
    return (
      <div className="page">
        <Card className="section-card">
          <div className="spinner" />
          <p className="muted">Loading activity log...</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="page">
      <PageIntro
        title="Activity Log"
        description="Admin-only audit trail for sign-ins, sign-outs, and page visits."
        actions={
          <>
            <button className="btn btn-primary" type="button" onClick={() => void loadEvents()}>
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            <Link className="btn btn-ghost" href="/control">Control</Link>
            <Link className="btn btn-ghost" href="/">Home</Link>
          </>
        }
        aside={
          <div className="metric-strip">
            <MetricPill label="Events" value={events.length} tone="info" />
            <MetricPill label="Sign-ins" value={signInCount} tone={signInCount ? 'success' : 'neutral'} />
            <MetricPill label="Failed" value={failedCount} tone={failedCount ? 'danger' : 'neutral'} />
            <MetricPill label="Sign-outs" value={signOutCount} tone={signOutCount ? 'warning' : 'neutral'} />
            <MetricPill label="Page views" value={pageViewCount} tone="info" />
            <MetricPill label="Users" value={activeUserCount} tone="neutral" />
          </div>
        }
      />

      {error ? <Notice title="Could not load activity log" description={error} tone="danger" /> : null}

      <Card className="section-card">
        <SectionHeader
          title="Recent activity"
          description="Newest events first."
          action={
            <SegmentedControl
              label="Activity type"
              value={eventFilter}
              onChange={(value) => setEventFilter(value as ActivityFilter)}
              options={activityFilterOptions}
            />
          }
        />

        <div className="toolbar">
          <div className="toolbar-row">
            <Field label="User">
              <select value={userFilter} onChange={(event) => setUserFilter(event.target.value)}>
                <option value="">All users</option>
                {users.map((user) => (
                  <option key={user.id} value={String(user.id)}>
                    {user.display_name || user.username}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>

        <div className="divider" />

        <div className="list-table">
          {events.length ? (
            events.map((event) => (
              <div key={event.id} className="list-row">
                <div className="list-row-main">
                  <div className="list-row-header">
                    <h3 className="list-row-title line-clamp-1">{auditEventTitle(event)}</h3>
                    <div className="list-row-meta">
                      <Badge tone={toneForAuditEvent(event.event_type)}>{formatEnumLabel(event.event_type)}</Badge>
                      <Badge tone="neutral">{event.display_name || event.username || 'Unknown user'}</Badge>
                      {event.path ? <Badge tone="info">{event.path}</Badge> : null}
                    </div>
                  </div>
                  <div className="list-row-copy line-clamp-1">{auditEventSummary(event)}</div>
                  <div className="list-row-copy line-clamp-1">
                    {event.ip_address || 'Unknown IP'} · {event.user_agent || 'No user agent'}
                  </div>
                </div>
                <div className="list-row-side">
                  <div className="muted small">{formatDateTime(event.created_at)}</div>
                </div>
              </div>
            ))
          ) : (
            <EmptyState title="No activity yet" description="User sign-ins and page visits will appear here." />
          )}
        </div>
      </Card>
    </div>
  );
}
