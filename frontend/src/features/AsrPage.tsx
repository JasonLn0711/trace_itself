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
import { aiProvidersApi, asrApi, extractApiErrorMessage, usagePolicyApi } from '../lib/api';
import { formatDateTime } from '../lib/dates';
import { formatBytes, formatDuration } from '../lib/media';
import type { AIProvider, AsrTranscript, AsrTranscriptSummary, UsagePolicySnapshot } from '../types';

export function AsrPage() {
  const [entries, setEntries] = useState<AsrTranscriptSummary[]>([]);
  const [selected, setSelected] = useState<AsrTranscript | null>(null);
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [policySnapshot, setPolicySnapshot] = useState<UsagePolicySnapshot | null>(null);
  const [providerId, setProviderId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadEntries(targetId?: number | null) {
    const items = await asrApi.list({ limit: 30 });
    setEntries(items);
    const nextSelectedId = targetId ?? items[0]?.id ?? null;
    setSelectedId(nextSelectedId);
    if (nextSelectedId) {
      setLoadingTranscript(true);
      try {
        setSelected(await asrApi.get(nextSelectedId));
      } finally {
        setLoadingTranscript(false);
      }
    } else {
      setSelected(null);
    }
  }

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const [items, nextProviders, nextPolicy] = await Promise.all([
          asrApi.list({ limit: 30 }),
          aiProvidersApi.list({ kind: 'asr' }),
          usagePolicyApi.get()
        ]);
        if (!alive) {
          return;
        }
        setEntries(items);
        setProviders(nextProviders);
        setPolicySnapshot(nextPolicy);
        setProviderId((current) => current ?? nextProviders[0]?.id ?? null);
        const firstId = items[0]?.id ?? null;
        setSelectedId(firstId);
        if (firstId) {
          setLoadingTranscript(true);
          try {
            const transcript = await asrApi.get(firstId);
            if (alive) {
              setSelected(transcript);
            }
          } finally {
            if (alive) {
              setLoadingTranscript(false);
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
  const languageCount = useMemo(
    () => new Set(entries.map((item) => item.language).filter(Boolean)).size,
    [entries]
  );

  async function handleSelect(id: number) {
    setSelectedId(id);
    setLoadingTranscript(true);
    setError('');
    try {
      setSelected(await asrApi.get(id));
    } catch (err) {
      setError(extractApiErrorMessage(err));
    } finally {
      setLoadingTranscript(false);
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
      const created = await asrApi.transcribe({ file, title, language, provider_id: providerId });
      setSelected(created);
      setSelectedId(created.id);
      setTitle('');
      setLanguage('');
      setFile(null);
      setPolicySnapshot(await usagePolicyApi.get());
      await loadEntries(created.id);
      setNotice('Transcript ready.');
    } catch (err) {
      setError(extractApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm('Delete this transcript?')) {
      return;
    }

    setDeletingId(id);
    setError('');
    setNotice('');
    try {
      await asrApi.remove(id);
      await loadEntries(selectedId === id ? null : selectedId);
      setNotice('Transcript deleted.');
    } catch (err) {
      setError(extractApiErrorMessage(err));
    } finally {
      setDeletingId(null);
    }
  }

  async function copyTranscript() {
    if (!selected?.transcript_text || typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }
    await navigator.clipboard.writeText(selected.transcript_text);
    setNotice('Transcript copied.');
  }

  if (loading) {
    return (
      <div className="page">
        <Card className="section-card">
          <div className="spinner" />
          <p className="muted">Loading ASR...</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="page">
      <PageIntro
        title="ASR"
        description="Record or upload. Save text."
        actions={
          <>
            <button className="btn btn-primary" type="button" onClick={() => void loadEntries(selectedId)}>
              Refresh
            </button>
            {selected?.transcript_text ? (
              <button className="btn btn-ghost" type="button" onClick={() => void copyTranscript()}>
                Copy
              </button>
            ) : null}
          </>
        }
        aside={
          <div className="metric-strip">
            <MetricPill label="Transcripts" value={entries.length} tone="info" />
            <MetricPill label="Audio" value={`${totalMinutes}m`} tone="success" />
            <MetricPill label="24h" value={formatDuration(policySnapshot?.usage.audio_seconds_last_24h ?? null)} tone="neutral" />
            <MetricPill label="Languages" value={languageCount} tone="neutral" />
            <MetricPill label="Cap" value={formatDuration(policySnapshot?.policy.max_audio_seconds_per_request ?? null)} tone="info" />
          </div>
        }
      />

      {error ? <Notice title="ASR error" description={error} tone="danger" /> : null}
      {notice ? <Notice title={notice} tone="success" /> : null}

      <div className="grid two">
        <Card className="section-card">
          <SectionHeader title="New transcript" />
          <form className="form-grid" onSubmit={handleSubmit}>
            <AudioCapturePanel file={file} onChange={setFile} filenameBase="asr" disabled={submitting} />
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
            {providers.length > 1 ? (
              <label className="field">
                <span>ASR provider</span>
                <select value={String(providerId ?? '')} onChange={(event) => setProviderId(Number(event.target.value) || null)}>
                  {providers.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name} · {provider.model_name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="list-row-copy">
                {providers[0] ? `${providers[0].name} · ${providers[0].model_name}` : 'No ASR provider available.'}
              </div>
            )}
            {policySnapshot ? (
              <div className="list-row-copy">
                Max {formatDuration(policySnapshot.policy.max_audio_seconds_per_request)} per file. Used {formatDuration(policySnapshot.usage.audio_seconds_last_24h)} in the last 24h.
              </div>
            ) : null}
            <Button type="submit" disabled={submitting || !file || !providers.length}>
              {submitting ? 'Transcribing...' : 'Transcribe'}
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
                    <div className="list-row-copy line-clamp-1">{entry.excerpt || 'No transcript text.'}</div>
                    <div className="list-row-copy line-clamp-1">
                      {entry.original_filename} · {formatBytes(entry.file_size_bytes)} · {formatDateTime(entry.created_at)}
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
              <EmptyState title="No transcripts yet" description="Record or upload the first one." />
            )}
          </div>
        </Card>
      </div>

      <Card className="section-card">
        <SectionHeader
          title={selected ? selected.title : 'Transcript'}
          description={selected ? `${selected.original_filename} · ${formatDateTime(selected.created_at)}` : undefined}
        />
        {loadingTranscript ? (
          <div className="spinner" />
        ) : selected ? (
          <div className="transcript-surface">
            <div className="detail-row">
              <Badge tone="neutral">{selected.language || 'auto'}</Badge>
              <Badge tone="neutral">{formatDuration(selected.duration_seconds)}</Badge>
              <Badge tone="neutral">{formatBytes(selected.file_size_bytes)}</Badge>
              <Badge tone="info">{selected.model_name}</Badge>
              <a className="btn btn-ghost" href={asrApi.audioUrl(selected.id)}>
                Audio
              </a>
            </div>
            <audio className="audio-player" controls preload="none" src={asrApi.audioUrl(selected.id)} />
            <pre className="transcript-body">{selected.transcript_text}</pre>
          </div>
        ) : (
          <EmptyState title="No transcript selected" description="Pick a transcript from history." />
        )}
      </Card>
    </div>
  );
}
