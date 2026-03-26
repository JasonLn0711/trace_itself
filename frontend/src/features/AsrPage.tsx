'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
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
import { asrApi, extractApiErrorMessage } from '../lib/api';
import { formatDateTime } from '../lib/dates';
import type { AsrTranscript, AsrTranscriptSummary } from '../types';

function formatDuration(seconds: number | null) {
  if (seconds == null || Number.isNaN(seconds)) {
    return 'n/a';
  }
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return `${minutes}m ${remaining}s`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AsrPage() {
  const [entries, setEntries] = useState<AsrTranscriptSummary[]>([]);
  const [selected, setSelected] = useState<AsrTranscript | null>(null);
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function loadEntries(targetId?: number | null) {
    const items = await asrApi.list({ limit: 30 });
    setEntries(items);
    const nextSelectedId = targetId ?? items[0]?.id ?? null;
    setSelectedId(nextSelectedId);
    if (nextSelectedId) {
      setLoadingTranscript(true);
      try {
        const fullTranscript = await asrApi.get(nextSelectedId);
        setSelected(fullTranscript);
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
        const items = await asrApi.list({ limit: 30 });
        if (!alive) {
          return;
        }
        setEntries(items);
        const firstId = items[0]?.id ?? null;
        setSelectedId(firstId);
        if (firstId) {
          setLoadingTranscript(true);
          try {
            const fullTranscript = await asrApi.get(firstId);
            if (alive) {
              setSelected(fullTranscript);
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
      const transcript = await asrApi.get(id);
      setSelected(transcript);
    } catch (err) {
      setError(extractApiErrorMessage(err));
    } finally {
      setLoadingTranscript(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError('Choose an audio file first.');
      return;
    }

    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      const created = await asrApi.transcribe({ file, title, language });
      setSelected(created);
      setTitle('');
      setLanguage('');
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
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
        description="Upload audio. Get text."
        actions={
          <>
            <button className="btn btn-primary" type="button" onClick={() => void loadEntries(selectedId)}>
              Refresh
            </button>
            {selected?.transcript_text ? (
              <button className="btn btn-ghost" type="button" onClick={() => void copyTranscript()}>
                Copy text
              </button>
            ) : null}
          </>
        }
        aside={
          <div className="metric-strip">
            <MetricPill label="Transcripts" value={entries.length} tone="info" />
            <MetricPill label="Audio" value={`${totalMinutes}m`} tone="success" />
            <MetricPill label="Languages" value={languageCount} tone="neutral" />
            <MetricPill label="Model" value={selected?.model_name ?? 'ready'} tone="info" />
          </div>
        }
      />

      {error ? <Notice title="ASR error" description={error} tone="danger" /> : null}
      {notice ? <Notice title={notice} tone="success" /> : null}

      <div className="grid two">
        <Card className="section-card">
          <SectionHeader title="Transcribe" />
          <form className="form-grid" onSubmit={handleSubmit}>
            <Field label="Audio">
              <input
                ref={fileInputRef}
                type="file"
                accept=".aac,.flac,.m4a,.mp3,.mp4,.ogg,.wav,.webm,audio/*"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                required
              />
            </Field>
            <div className="form-grid cols-2">
              <Field label="Title">
                <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Optional" />
              </Field>
              <Field label="Language">
                <input value={language} onChange={(event) => setLanguage(event.target.value)} placeholder="auto, en, zh" />
              </Field>
            </div>
            <div className="list-row-copy">
              Supports common audio uploads. Transcription runs on your lab server.
            </div>
            <Button type="submit" disabled={submitting || !file}>
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
              <EmptyState title="No transcripts yet" description="Upload audio to create the first one." />
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
            </div>
            <pre className="transcript-body">{selected.transcript_text}</pre>
          </div>
        ) : (
          <EmptyState title="No transcript selected" description="Pick a transcript from history." />
        )}
      </Card>
    </div>
  );
}
