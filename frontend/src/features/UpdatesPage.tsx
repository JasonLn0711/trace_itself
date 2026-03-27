'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Badge,
  Card,
  EmptyState,
  MetricPill,
  Notice,
  PageIntro,
  SectionHeader,
  SegmentedControl
} from '../components/Primitives';
import { extractApiErrorMessage, productUpdatesApi } from '../lib/api';
import { formatDateTime } from '../lib/dates';
import { formatEnumLabel, toneForProductUpdateType } from '../lib/presentation';
import type { ProductUpdate, ProductUpdateType } from '../types';

type FeedFilter = 'all' | ProductUpdateType;

const filterOptions = [
  { value: 'all', label: 'All' },
  { value: 'build', label: 'Build' },
  { value: 'fix', label: 'Fix' },
  { value: 'update', label: 'Update' },
  { value: 'security', label: 'Security' }
] satisfies Array<{ value: FeedFilter; label: string }>;

export function UpdatesPage() {
  const [entries, setEntries] = useState<ProductUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<FeedFilter>('all');

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const items = await productUpdatesApi.list({ limit: 100 });
        if (alive) {
          setEntries(items);
          setError('');
        }
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

    void load();
    return () => {
      alive = false;
    };
  }, []);

  const visibleEntries = useMemo(() => {
    if (filter === 'all') {
      return entries;
    }
    return entries.filter((entry) => entry.change_type === filter);
  }, [entries, filter]);

  const buildCount = entries.filter((entry) => entry.change_type === 'build').length;
  const fixCount = entries.filter((entry) => entry.change_type === 'fix').length;
  const securityCount = entries.filter((entry) => entry.change_type === 'security').length;
  const pinnedCount = entries.filter((entry) => entry.is_pinned).length;

  if (loading) {
    return (
      <div className="page">
        <Card className="section-card">
          <div className="spinner" />
          <p className="muted">Loading updates...</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="page">
      <PageIntro
        title="Updates"
        description="What changed."
        actions={
          <>
            <Link className="btn btn-primary" href="/">
              Home
            </Link>
            <Link className="btn btn-ghost" href="/tasks">
              Tasks
            </Link>
          </>
        }
        aside={
          <div className="metric-strip">
            <MetricPill label="Entries" value={entries.length} tone="info" />
            <MetricPill label="Builds" value={buildCount} tone="info" />
            <MetricPill label="Fixes" value={fixCount} tone={fixCount ? 'warning' : 'neutral'} />
            <MetricPill label="Pinned" value={pinnedCount} tone={pinnedCount ? 'success' : 'neutral'} />
            <MetricPill label="Security" value={securityCount} tone={securityCount ? 'danger' : 'neutral'} />
          </div>
        }
      />

      {error ? <Notice title="Could not load updates" description={error} tone="danger" /> : null}

      <Card className="section-card">
        <SectionHeader
          title="Feed"
          description="Read-only release log."
          action={
            <SegmentedControl
              label="Update type"
              value={filter}
              onChange={(value) => setFilter(value as FeedFilter)}
              options={filterOptions}
            />
          }
        />

        <div className="detail-row">
          <Badge tone={pinnedCount ? 'info' : 'neutral'}>{pinnedCount} pinned</Badge>
          <Badge tone="neutral">{visibleEntries.length} visible</Badge>
        </div>

        <div className="list-table">
          {visibleEntries.length ? (
            visibleEntries.map((entry) => (
              <div key={entry.id} className="list-row">
                <div className="list-row-main">
                  <div className="list-row-header">
                    <h3 className="list-row-title line-clamp-1">
                      {entry.version_tag ? `${entry.version_tag} · ` : ''}
                      {entry.title}
                    </h3>
                    <div className="list-row-meta">
                      {entry.version_tag ? <Badge tone="success">{entry.version_tag}</Badge> : null}
                      <Badge tone={toneForProductUpdateType(entry.change_type)}>
                        {formatEnumLabel(entry.change_type)}
                      </Badge>
                      <Badge tone="neutral">{formatEnumLabel(entry.area)}</Badge>
                      {entry.is_pinned ? <Badge tone="info">Pinned</Badge> : null}
                    </div>
                  </div>
                  <div className="list-row-copy line-clamp-1">{entry.summary}</div>
                  <div className="list-row-copy line-clamp-1">Updater · {entry.author_display_name || 'System'}</div>
                  {entry.details ? <div className="list-row-copy line-clamp-2">{entry.details}</div> : null}
                </div>
                <div className="list-row-side">
                  <div className="muted small">{formatDateTime(entry.updated_at)}</div>
                </div>
              </div>
            ))
          ) : (
            <EmptyState title="No updates yet" description="New changes will appear here." />
          )}
        </div>
      </Card>
    </div>
  );
}
