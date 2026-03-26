'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  MetricPill,
  Notice,
  PageIntro,
  SectionHeader,
  SegmentedControl
} from '../components/Primitives';
import { useAuth } from '../state/AuthContext';
import { extractApiErrorMessage, productUpdatesApi } from '../lib/api';
import { formatDateTime } from '../lib/dates';
import { formatEnumLabel, toneForProductUpdateType } from '../lib/presentation';
import type { ProductUpdate, ProductUpdateType } from '../types';

type UpdateFormState = {
  title: string;
  summary: string;
  details: string;
  area: string;
  change_type: ProductUpdateType;
  changed_at: string;
  is_pinned: boolean;
};

type FeedFilter = 'all' | ProductUpdateType;

const filterOptions = [
  { value: 'all', label: 'All' },
  { value: 'build', label: 'Build' },
  { value: 'fix', label: 'Fix' },
  { value: 'update', label: 'Update' },
  { value: 'security', label: 'Security' }
] satisfies Array<{ value: FeedFilter; label: string }>;

function nowInputValue() {
  return new Date().toISOString().slice(0, 16);
}

function emptyUpdateForm(): UpdateFormState {
  return {
    title: '',
    summary: '',
    details: '',
    area: 'dashboard',
    change_type: 'update',
    changed_at: nowInputValue(),
    is_pinned: false
  };
}

function updateToForm(entry: ProductUpdate): UpdateFormState {
  return {
    title: entry.title,
    summary: entry.summary,
    details: entry.details ?? '',
    area: entry.area,
    change_type: entry.change_type,
    changed_at: entry.changed_at.slice(0, 16),
    is_pinned: entry.is_pinned
  };
}

function buildPayload(form: UpdateFormState) {
  return {
    title: form.title.trim(),
    summary: form.summary.trim(),
    details: form.details.trim() || null,
    area: form.area.trim(),
    change_type: form.change_type,
    changed_at: new Date(form.changed_at).toISOString(),
    is_pinned: form.is_pinned
  };
}

export function UpdatesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [entries, setEntries] = useState<ProductUpdate[]>([]);
  const [form, setForm] = useState<UpdateFormState>(emptyUpdateForm());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState<FeedFilter>('all');

  async function loadEntries() {
    const items = await productUpdatesApi.list({ limit: 100 });
    setEntries(items);
  }

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');

    try {
      const payload = buildPayload(form);
      if (editingId) {
        await productUpdatesApi.update(editingId, payload);
        setNotice('Update entry saved.');
      } else {
        await productUpdatesApi.create(payload);
        setNotice('Update entry published.');
      }
      await loadEntries();
      setEditingId(null);
      setForm(emptyUpdateForm());
    } catch (err) {
      setError(extractApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function removeEntry(entry: ProductUpdate) {
    if (!window.confirm(`Delete update "${entry.title}"?`)) {
      return;
    }
    setError('');
    setNotice('');
    try {
      await productUpdatesApi.remove(entry.id);
      if (editingId === entry.id) {
        setEditingId(null);
        setForm(emptyUpdateForm());
      }
      await loadEntries();
      setNotice('Update entry deleted.');
    } catch (err) {
      setError(extractApiErrorMessage(err));
    }
  }

  function startEdit(entry: ProductUpdate) {
    setEditingId(entry.id);
    setForm(updateToForm(entry));
    setError('');
    setNotice('');
  }

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
        actions={
          <>
            <Link className="btn btn-primary" href="/">Home</Link>
            <Link className="btn btn-ghost" href="/tasks">Tasks</Link>
          </>
        }
        aside={
          <div className="metric-strip">
            <MetricPill label="Entries" value={entries.length} tone="info" />
            <MetricPill label="Builds" value={buildCount} tone="info" />
            <MetricPill label="Fixes" value={fixCount} tone={fixCount ? 'warning' : 'neutral'} />
            <MetricPill label="Security" value={securityCount} tone={securityCount ? 'danger' : 'neutral'} />
          </div>
        }
      />

      {error ? <Notice title="Could not load updates" description={error} tone="danger" /> : null}
      {notice ? <Notice title={notice} tone="success" /> : null}

      <div className={isAdmin ? 'grid two' : 'page'}>
        {isAdmin ? (
          <Card className="section-card">
            <SectionHeader title={editingId ? 'Edit' : 'New'} />
            <form className="form-grid" onSubmit={handleSubmit}>
              <Field label="Title">
                <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Title" required />
              </Field>
              <Field label="Summary">
                <textarea
                  value={form.summary}
                  onChange={(event) => setForm({ ...form, summary: event.target.value })}
                  placeholder="Summary"
                  required
                />
              </Field>
              <Field label="Details">
                <textarea
                  value={form.details}
                  onChange={(event) => setForm({ ...form, details: event.target.value })}
                  placeholder="Optional detail"
                />
              </Field>
              <div className="form-grid cols-2">
                <Field label="Where">
                  <input value={form.area} onChange={(event) => setForm({ ...form, area: event.target.value })} placeholder="dashboard, tasks, users" required />
                </Field>
                <Field label="Type">
                  <select value={form.change_type} onChange={(event) => setForm({ ...form, change_type: event.target.value as ProductUpdateType })}>
                    <option value="build">build</option>
                    <option value="fix">fix</option>
                    <option value="update">update</option>
                    <option value="security">security</option>
                  </select>
                </Field>
              </div>
              <div className="form-grid cols-2">
                <Field label="When">
                  <input type="datetime-local" value={form.changed_at} onChange={(event) => setForm({ ...form, changed_at: event.target.value })} required />
                </Field>
                <Field label="Pinned">
                  <select value={String(form.is_pinned)} onChange={(event) => setForm({ ...form, is_pinned: event.target.value === 'true' })}>
                    <option value="false">no</option>
                    <option value="true">yes</option>
                  </select>
                </Field>
              </div>
              <div className="helper-row">
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving...' : editingId ? 'Save update' : 'Publish update'}
                </Button>
                {editingId ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setEditingId(null);
                      setForm(emptyUpdateForm());
                    }}
                  >
                    Cancel edit
                  </Button>
                ) : null}
              </div>
            </form>
          </Card>
        ) : null}

        <Card className="section-card">
          <SectionHeader
            title="Feed"
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
                      <h3 className="list-row-title line-clamp-1">{entry.title}</h3>
                      <div className="list-row-meta">
                          <Badge tone={toneForProductUpdateType(entry.change_type)}>{formatEnumLabel(entry.change_type)}</Badge>
                          <Badge tone="neutral">{formatEnumLabel(entry.area)}</Badge>
                          {entry.is_pinned ? <Badge tone="info">Pinned</Badge> : null}
                      </div>
                    </div>
                    <div className="list-row-copy line-clamp-1">{entry.summary}</div>
                    <div className="list-row-copy line-clamp-1">
                      {formatDateTime(entry.changed_at)} · {entry.author_display_name || 'System'}
                    </div>
                    {entry.details ? <div className="list-row-copy line-clamp-2">{entry.details}</div> : null}
                  </div>
                  {isAdmin ? (
                    <div className="list-row-side">
                      <div className="muted small">Updated {formatDateTime(entry.updated_at)}</div>
                      <div className="list-row-actions">
                        <Button variant="secondary" onClick={() => startEdit(entry)}>
                          Edit
                        </Button>
                        <Button variant="danger" onClick={() => void removeEntry(entry)}>
                          Delete
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="list-row-side">
                      <div className="muted small">{formatDateTime(entry.updated_at)}</div>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <EmptyState title="No updates yet" description="Publish the first product note." />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
