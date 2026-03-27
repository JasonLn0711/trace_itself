'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  MetricPill,
  Notice,
  PageIntro,
  SectionHeader
} from '../components/Primitives';
import { useConfirmationDialog } from '../components/ConfirmationDialog';
import { dailyLogsApi, extractApiErrorMessage } from '../lib/api';
import { formatDate, formatDateTime, todayIso } from '../lib/dates';
import { summarizeFocus } from '../lib/presentation';
import type { DailyLog } from '../types';

type DailyLogFormState = {
  log_date: string;
  summary: string;
  blockers: string;
  next_step: string;
  total_focus_hours: string;
};

function emptyLogForm(defaultDate = todayIso()): DailyLogFormState {
  return {
    log_date: defaultDate,
    summary: '',
    blockers: '',
    next_step: '',
    total_focus_hours: ''
  };
}

function logToForm(log: DailyLog): DailyLogFormState {
  return {
    log_date: log.log_date,
    summary: log.summary ?? '',
    blockers: log.blockers ?? '',
    next_step: log.next_step ?? '',
    total_focus_hours: log.total_focus_hours == null ? '' : String(log.total_focus_hours)
  };
}

export function DailyLogsPage() {
  const { confirm, confirmationDialog } = useConfirmationDialog();
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [form, setForm] = useState<DailyLogFormState>(emptyLogForm());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadLogs() {
    const items = await dailyLogsApi.list();
    setLogs(items);
  }

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const items = await dailyLogsApi.list();
        if (alive) {
          setLogs(items);
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

  const orderedLogs = useMemo(
    () => [...logs].sort((left, right) => right.log_date.localeCompare(left.log_date)),
    [logs]
  );
  const recentLogs = orderedLogs.slice(0, 8);
  const focusSummary = summarizeFocus(recentLogs);
  const todayLog = orderedLogs.find((log) => log.log_date === todayIso());
  const blockerCount = orderedLogs.filter((log) => Boolean(log.blockers?.trim())).length;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');

    const payload = {
      log_date: form.log_date,
      summary: form.summary,
      blockers: form.blockers || null,
      next_step: form.next_step || null,
      total_focus_hours: form.total_focus_hours ? Number(form.total_focus_hours) : null
    };

    try {
      if (editingId) {
        await dailyLogsApi.update(editingId, payload);
        setNotice('Daily log updated.');
      } else {
        await dailyLogsApi.create(payload);
        setNotice('Daily log created.');
      }
      setForm(emptyLogForm());
      setEditingId(null);
      await loadLogs();
    } catch (err) {
      setError(extractApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function editLog(log: DailyLog) {
    setEditingId(log.id);
    setForm(logToForm(log));
    setError('');
    setNotice('');
  }

  async function removeLog(log: DailyLog) {
    const confirmed = await confirm({
      title: `Delete log for ${formatDate(log.log_date)}?`,
      description: 'This daily log entry will be removed.',
      confirmLabel: 'Delete log'
    });
    if (!confirmed) {
      return;
    }

    setError('');
    setNotice('');
    try {
      await dailyLogsApi.remove(log.id);
      await loadLogs();
      setNotice('Daily log deleted.');
      if (editingId === log.id) {
        setEditingId(null);
        setForm(emptyLogForm());
      }
    } catch (err) {
      setError(extractApiErrorMessage(err));
    }
  }

  if (loading) {
    return (
      <div className="page">
        <Card className="section-card">
          <div className="spinner" />
          <p className="muted">Loading daily logs...</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="page">
      {confirmationDialog}
      <PageIntro
        title="Daily Logs"
        actions={
          <>
            <button className="btn btn-primary" type="button" onClick={() => setForm(emptyLogForm(todayIso()))}>
              Today
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => {
                setEditingId(null);
                setForm(emptyLogForm());
              }}
            >
              Reset form
            </button>
          </>
        }
        aside={
          <div className="metric-strip">
            <MetricPill label="Today log" value={todayLog ? 'Captured' : 'Missing'} tone={todayLog ? 'success' : 'warning'} />
            <MetricPill label="Recent logs" value={recentLogs.length} tone="info" />
            <MetricPill label="Avg focus" value={`${focusSummary.averageHours.toFixed(1)}h`} tone="success" />
            <MetricPill label="Logs with blockers" value={blockerCount} tone={blockerCount ? 'warning' : 'neutral'} />
          </div>
        }
      />

      {error ? <Notice title="Could not update daily logs" description={error} tone="danger" /> : null}
      {notice ? <Notice title={notice} tone="success" /> : null}

      <div className="grid two">
        <Card className="section-card">
          <SectionHeader title={editingId ? 'Edit' : 'New'} />
          <form className="form-grid" onSubmit={handleSubmit}>
            <Field label="Date">
              <input type="date" value={form.log_date} onChange={(event) => setForm({ ...form, log_date: event.target.value })} required />
            </Field>
            <Field label="Summary">
              <textarea
                value={form.summary}
                onChange={(event) => setForm({ ...form, summary: event.target.value })}
                placeholder="What moved today?"
                required
              />
            </Field>
            <div className="form-grid cols-2">
              <Field label="Blockers">
                <textarea
                  value={form.blockers}
                  onChange={(event) => setForm({ ...form, blockers: event.target.value })}
                  placeholder="Blockers"
                />
              </Field>
              <Field label="Next">
                <textarea
                  value={form.next_step}
                  onChange={(event) => setForm({ ...form, next_step: event.target.value })}
                  placeholder="Next step"
                />
              </Field>
            </div>
            <Field label="Focus hours">
              <input type="number" min="0" step="0.25" value={form.total_focus_hours} onChange={(event) => setForm({ ...form, total_focus_hours: event.target.value })} />
            </Field>
            <div className="helper-row">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving...' : editingId ? 'Update log' : 'Create log'}
              </Button>
              {editingId ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setEditingId(null);
                    setForm(emptyLogForm());
                  }}
                >
                  Cancel edit
                </Button>
              ) : null}
            </div>
          </form>
        </Card>

        <Card className="section-card">
          <SectionHeader title="Recent" />
          <div className="list-table">
            {recentLogs.length ? (
              recentLogs.map((log) => (
                <div key={log.id} className="list-row">
                  <div className="list-row-main">
                    <div className="list-row-header">
                      <h3 className="list-row-title">{formatDate(log.log_date)}</h3>
                      <div className="list-row-meta">
                        <Badge tone="neutral">{(log.total_focus_hours ?? 0).toFixed(1)}h</Badge>
                        {log.blockers?.trim() ? <Badge tone="warning">Blockers</Badge> : null}
                      </div>
                    </div>
                    <div className="list-row-copy line-clamp-1">{log.summary || 'No summary.'}</div>
                    <div className="list-row-copy line-clamp-1">{log.next_step || 'No next step.'}</div>
                  </div>
                  <div className="list-row-side">
                    <div className="muted small">Updated {formatDateTime(log.updated_at)}</div>
                    <div className="list-row-actions">
                    <Button variant="secondary" onClick={() => editLog(log)}>
                      Edit
                    </Button>
                    <Button variant="danger" onClick={() => void removeLog(log)}>
                      Delete
                    </Button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState title="No logs yet" description="Add one for today." />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
