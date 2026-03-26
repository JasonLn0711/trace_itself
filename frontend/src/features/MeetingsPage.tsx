'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AudioCapturePanel } from '../components/AudioCapturePanel';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  MetricPill,
  Notice,
  PageIntro,
  SectionHeader
} from '../components/Primitives';
import { aiProvidersApi, meetingsApi, extractApiErrorMessage, usagePolicyApi } from '../lib/api';
import { formatDateTime } from '../lib/dates';
import { actionItemCount, formatBytes, formatDuration } from '../lib/media';
import type { AIProvider, MeetingRecord, MeetingRecordSummary, UsagePolicySnapshot } from '../types';

type MeetingTab = 'summary' | 'minutes' | 'actions' | 'transcript';

function excerpt(value: string, max = 160) {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= max) {
    return compact;
  }
  return `${compact.slice(0, max - 1).trimEnd()}…`;
}

function splitActionItems(value: string) {
  return value
    .split('\n')
    .map((line) => line.replace(/^-\s*/, '').trim())
    .filter(Boolean);
}

export function MeetingsPage() {
  const [entries, setEntries] = useState<MeetingRecordSummary[]>([]);
  const [selected, setSelected] = useState<MeetingRecord | null>(null);
  const [asrProviders, setAsrProviders] = useState<AIProvider[]>([]);
  const [llmProviders, setLlmProviders] = useState<AIProvider[]>([]);
  const [policySnapshot, setPolicySnapshot] = useState<UsagePolicySnapshot | null>(null);
  const [asrProviderId, setAsrProviderId] = useState<number | null>(null);
  const [llmProviderId, setLlmProviderId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [activeTab, setActiveTab] = useState<MeetingTab>('summary');
  const [loading, setLoading] = useState(true);
  const [loadingEntry, setLoadingEntry] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadEntries(targetId?: number | null) {
    const items = await meetingsApi.list({ limit: 30 });
    setEntries(items);
    const nextSelectedId = targetId ?? items[0]?.id ?? null;
    setSelectedId(nextSelectedId);
    if (nextSelectedId) {
      setLoadingEntry(true);
      try {
        setSelected(await meetingsApi.get(nextSelectedId));
      } finally {
        setLoadingEntry(false);
      }
    } else {
      setSelected(null);
    }
  }

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const [items, nextAsrProviders, nextLlmProviders, nextPolicy] = await Promise.all([
          meetingsApi.list({ limit: 30 }),
          aiProvidersApi.list({ kind: 'asr' }),
          aiProvidersApi.list({ kind: 'llm' }),
          usagePolicyApi.get()
        ]);
        if (!alive) {
          return;
        }
        setEntries(items);
        setAsrProviders(nextAsrProviders);
        setLlmProviders(nextLlmProviders);
        setPolicySnapshot(nextPolicy);
        setAsrProviderId((current) => current ?? nextAsrProviders[0]?.id ?? null);
        setLlmProviderId((current) => current ?? nextLlmProviders[0]?.id ?? null);
        const firstId = items[0]?.id ?? null;
        setSelectedId(firstId);
        if (firstId) {
          setLoadingEntry(true);
          try {
            const meeting = await meetingsApi.get(firstId);
            if (alive) {
              setSelected(meeting);
            }
          } finally {
            if (alive) {
              setLoadingEntry(false);
            }
          }
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

  const totalMinutes = useMemo(
    () => Math.round(entries.reduce((sum, item) => sum + (item.duration_seconds ?? 0), 0) / 60),
    [entries]
  );
  const totalActionItems = useMemo(
    () => entries.reduce((sum, item) => sum + actionItemCount(item.action_items_text), 0),
    [entries]
  );

  async function handleSelect(id: number) {
    setSelectedId(id);
    setLoadingEntry(true);
    setError('');
    try {
      setSelected(await meetingsApi.get(id));
      setActiveTab('summary');
    } catch (err) {
      setError(extractApiErrorMessage(err));
    } finally {
      setLoadingEntry(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError('Add audio first.');
      return;
    }

    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      const created = await meetingsApi.create({
        file,
        title,
        language,
        asr_provider_id: asrProviderId,
        llm_provider_id: llmProviderId
      });
      setSelected(created);
      setSelectedId(created.id);
      setTitle('');
      setLanguage('');
      setFile(null);
      setActiveTab('summary');
      setPolicySnapshot(await usagePolicyApi.get());
      await loadEntries(created.id);
      setNotice('Meeting saved.');
    } catch (err) {
      setError(extractApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm('Delete this meeting record?')) {
      return;
    }

    setDeletingId(id);
    setError('');
    setNotice('');
    try {
      await meetingsApi.remove(id);
      await loadEntries(selectedId === id ? null : selectedId);
      setNotice('Meeting deleted.');
    } catch (err) {
      setError(extractApiErrorMessage(err));
    } finally {
      setDeletingId(null);
    }
  }

  async function copyActiveTab() {
    if (!selected || typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }

    const value =
      activeTab === 'summary'
        ? selected.summary_text
        : activeTab === 'minutes'
          ? selected.minutes_text
          : activeTab === 'actions'
            ? selected.action_items_text
            : selected.transcript_text;

    await navigator.clipboard.writeText(value);
    setNotice('Copied.');
  }

  function renderActiveTab(meeting: MeetingRecord) {
    if (activeTab === 'summary') {
      return <div className="note-surface">{meeting.summary_text}</div>;
    }
    if (activeTab === 'minutes') {
      return <pre className="transcript-body meeting-body">{meeting.minutes_text}</pre>;
    }
    if (activeTab === 'actions') {
      const items = splitActionItems(meeting.action_items_text);
      return items.length ? (
        <div className="todo-list">
          {items.map((item, index) => (
            <div key={`${item}-${index}`} className="todo-item">
              <span className="todo-bullet" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="No action items" description="This meeting did not produce explicit tasks." />
      );
    }
    return <pre className="transcript-body meeting-body">{meeting.transcript_text}</pre>;
  }

  if (loading) {
    return (
      <div className="page">
        <Card className="section-card">
          <div className="spinner" />
          <p className="muted">Loading meetings...</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="page">
      <PageIntro
        title="Meetings"
        description="Record. Save notes."
        actions={
          <>
            <button className="btn btn-primary" type="button" onClick={() => void loadEntries(selectedId)}>
              Refresh
            </button>
            {selected ? (
              <button className="btn btn-ghost" type="button" onClick={() => void copyActiveTab()}>
                Copy
              </button>
            ) : null}
          </>
        }
        aside={
          <div className="metric-strip">
            <MetricPill label="Meetings" value={entries.length} tone="info" />
            <MetricPill label="Audio" value={`${totalMinutes}m`} tone="success" />
            <MetricPill
              label="Text left"
              value={
                policySnapshot
                  ? `${policySnapshot.usage.llm_runs_remaining}/${policySnapshot.policy.llm_runs_per_24h}`
                  : 'n/a'
              }
              tone="warning"
            />
            <MetricPill label="To-do" value={totalActionItems} tone="warning" />
            <MetricPill label="Cap" value={formatDuration(policySnapshot?.policy.max_audio_seconds_per_request ?? null)} tone="neutral" />
          </div>
        }
      />

      {error ? <Notice title="Meeting error" description={error} tone="danger" /> : null}
      {notice ? <Notice title={notice} tone="success" /> : null}

      <div className="grid two">
        <Card className="section-card">
          <SectionHeader title="New meeting" />
          <form className="form-grid" onSubmit={handleSubmit}>
            <AudioCapturePanel file={file} onChange={setFile} filenameBase="meeting" disabled={submitting} />
            <div className="form-grid cols-2">
              <label className="field">
                <span>Title</span>
                <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Optional" />
              </label>
              <label className="field">
                <span>Language</span>
                <input value={language} onChange={(event) => setLanguage(event.target.value)} placeholder="auto, en, zh" />
              </label>
            </div>
            {asrProviders.length > 1 ? (
              <label className="field">
                <span>ASR provider</span>
                <select value={String(asrProviderId ?? '')} onChange={(event) => setAsrProviderId(Number(event.target.value) || null)}>
                  {asrProviders.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name} · {provider.model_name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="list-row-copy">
                {asrProviders[0] ? `${asrProviders[0].name} · ${asrProviders[0].model_name}` : 'No ASR provider available.'}
              </div>
            )}
            {llmProviders.length > 1 ? (
              <label className="field">
                <span>LLM provider</span>
                <select value={String(llmProviderId ?? '')} onChange={(event) => setLlmProviderId(Number(event.target.value) || null)}>
                  {llmProviders.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name} · {provider.model_name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="list-row-copy">
                {llmProviders[0] ? `${llmProviders[0].name} · ${llmProviders[0].model_name}` : 'No LLM provider available.'}
              </div>
            )}
            {policySnapshot ? (
              <div className="list-row-copy">
                {policySnapshot.usage.llm_runs_remaining} of {policySnapshot.policy.llm_runs_per_24h} text runs left in the last 24h. Max {formatDuration(policySnapshot.policy.max_audio_seconds_per_request)} per file.
              </div>
            ) : null}
            <Button
              type="submit"
              disabled={
                submitting ||
                !file ||
                !asrProviders.length ||
                !llmProviders.length ||
                (policySnapshot?.usage.llm_runs_remaining ?? 1) <= 0
              }
            >
              {submitting ? 'Processing...' : 'Save meeting'}
            </Button>
          </form>
        </Card>

        <Card className="section-card">
          <SectionHeader title="History" />
          <div className="list-table">
            {entries.length ? (
              entries.map((entry) => (
                <div key={entry.id} className="list-row">
                  <div className="list-row-main">
                    <div className="list-row-header">
                      <h3 className="list-row-title line-clamp-1">{entry.title}</h3>
                      <div className="list-row-meta">
                        <Badge tone={selectedId === entry.id ? 'info' : 'neutral'}>{selectedId === entry.id ? 'Open' : 'Saved'}</Badge>
                        <Badge tone="neutral">{entry.language || 'auto'}</Badge>
                        <Badge tone="neutral">{formatDuration(entry.duration_seconds)}</Badge>
                      </div>
                    </div>
                    <div className="list-row-copy line-clamp-2">{excerpt(entry.summary_text)}</div>
                    <div className="list-row-copy line-clamp-1">
                      {formatBytes(entry.file_size_bytes)} · {actionItemCount(entry.action_items_text)} tasks · {formatDateTime(entry.created_at)}
                    </div>
                  </div>
                  <div className="list-row-side">
                    <div className="list-row-actions">
                      <Button variant="secondary" onClick={() => void handleSelect(entry.id)}>
                        View
                      </Button>
                      <Button variant="danger" disabled={deletingId === entry.id} onClick={() => void handleDelete(entry.id)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState title="No meetings yet" description="Record one to save the first note set." />
            )}
          </div>
        </Card>
      </div>

      <Card className="section-card">
        <SectionHeader
          title={selected ? selected.title : 'Meeting'}
          description={selected ? `${selected.audio_filename} · ${formatDateTime(selected.created_at)}` : undefined}
        />
        {loadingEntry ? (
          <div className="spinner" />
        ) : selected ? (
          <div className="transcript-surface">
            <div className="detail-row">
              <Badge tone="neutral">{selected.language || 'auto'}</Badge>
              <Badge tone="neutral">{formatDuration(selected.duration_seconds)}</Badge>
              <Badge tone="neutral">{formatBytes(selected.file_size_bytes)}</Badge>
              <Badge tone="info">{selected.asr_model_name}</Badge>
              <Badge tone="warning">{selected.llm_model_name}</Badge>
              <a className="btn btn-ghost" href={meetingsApi.audioUrl(selected.id)}>
                Audio
              </a>
            </div>
            <audio className="audio-player" controls preload="none" src={meetingsApi.audioUrl(selected.id)} />
            <div className="segmented-control">
              {(['summary', 'minutes', 'actions', 'transcript'] as MeetingTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={`segment ${activeTab === tab ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab === 'actions' ? 'To-do' : tab[0].toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
            {renderActiveTab(selected)}
          </div>
        ) : (
          <EmptyState title="No meeting selected" description="Pick a saved meeting." />
        )}
      </Card>
    </div>
  );
}
