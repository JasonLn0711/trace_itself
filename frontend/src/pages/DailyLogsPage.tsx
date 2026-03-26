import { FormEvent, useEffect, useState } from 'react';
import { Badge, Button, Card, EmptyState, Field, SectionHeader } from '../components/Primitives';
import { dailyLogsApi, extractApiErrorMessage } from '../lib/api';
import { formatDate, formatDateTime, todayIso } from '../lib/dates';
import type { DailyLog } from '../types';

type DailyLogFormState = {
  log_date: string;
  summary: string;
  blockers: string;
  next_step: string;
  total_focus_hours: string;
};

function emptyLogForm(): DailyLogFormState {
  return {
    log_date: todayIso(),
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
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [form, setForm] = useState<DailyLogFormState>(emptyLogForm());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
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
      } else {
        await dailyLogsApi.create(payload);
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
  }

  async function removeLog(id: number) {
    if (!window.confirm('Delete this daily log?')) {
      return;
    }
    try {
      await dailyLogsApi.remove(id);
      await loadLogs();
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
      <div className="page-header">
        <div>
          <h1>Daily Logs</h1>
          <p className="muted">Capture what you planned, did, and learned each day.</p>
        </div>
      </div>

      <div className="grid two">
        <Card className="section-card">
          <SectionHeader title={editingId ? 'Edit log' : 'Create log'} description="Write the shortest useful note that will help future you." />
          <form className="form-grid" onSubmit={handleSubmit}>
            <Field label="Date">
              <input type="date" value={form.log_date} onChange={(event) => setForm({ ...form, log_date: event.target.value })} required />
            </Field>
            <Field label="Summary">
              <textarea value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} required />
            </Field>
            <Field label="Blockers">
              <textarea value={form.blockers} onChange={(event) => setForm({ ...form, blockers: event.target.value })} />
            </Field>
            <Field label="Next step">
              <textarea value={form.next_step} onChange={(event) => setForm({ ...form, next_step: event.target.value })} />
            </Field>
            <Field label="Total focus hours">
              <input type="number" min="0" step="0.25" value={form.total_focus_hours} onChange={(event) => setForm({ ...form, total_focus_hours: event.target.value })} />
            </Field>
            {error ? <EmptyState title="Could not save log" description={error} /> : null}
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
                  Cancel
                </Button>
              ) : null}
            </div>
          </form>
        </Card>

        <Card className="section-card">
          <SectionHeader title="Recent logs" description="Latest notes from your workdays." />
          <div className="list-grid">
            {logs.length ? (
              logs.map((log) => (
                <div key={log.id} className="entity">
                  <div className="entity-top">
                    <div>
                      <h3 className="entity-title">{formatDate(log.log_date)}</h3>
                      <p className="muted">{log.summary || 'No summary yet.'}</p>
                    </div>
                    <Badge tone="neutral">{log.total_focus_hours ?? 0}h focus</Badge>
                  </div>
                  <div className="entity-meta">
                    <Badge tone="info">Next: {log.next_step || 'Not set'}</Badge>
                    <Badge tone="neutral">Updated {formatDateTime(log.updated_at)}</Badge>
                  </div>
                  <div className="entity-actions">
                    <Button variant="secondary" onClick={() => editLog(log)}>
                      Edit
                    </Button>
                    <Button variant="danger" onClick={() => void removeLog(log.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState title="No logs yet" description="Start with today so the record stays fresh." />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
