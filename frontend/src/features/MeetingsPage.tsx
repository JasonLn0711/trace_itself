'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AudioCapturePanel } from '../components/AudioCapturePanel';
import { LiveAsrPanel } from '../components/LiveAsrPanel';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  MetricPill,
  Notice,
  PageIntro,
  SectionHeader,
  SegmentedControl
} from '../components/Primitives';
import { aiProvidersApi, asrApi, extractApiErrorMessage, meetingsApi, usagePolicyApi } from '../lib/api';
import { canUseMeetingNotes } from '../lib/access';
import { formatDateTime } from '../lib/dates';
import { actionItemCount, formatBytes, formatDuration } from '../lib/media';
import { useAuth } from '../state/AuthContext';
import type {
  AIProvider,
  AsrTranscript,
  AsrTranscriptSummary,
  MeetingRecord,
  MeetingRecordSummary,
  UsagePolicySnapshot
} from '../types';

type MeetingTab = 'summary' | 'minutes' | 'actions' | 'transcript';
type WorkspaceMode = 'transcript' | 'meeting';
type TranscriptInputMode = 'live' | 'file';

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
  const { user } = useAuth();
  const notesEnabled = canUseMeetingNotes(user);

  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('transcript');
  const [transcriptInputMode, setTranscriptInputMode] = useState<TranscriptInputMode>('live');
  const [transcriptEntries, setTranscriptEntries] = useState<AsrTranscriptSummary[]>([]);
  const [meetingEntries, setMeetingEntries] = useState<MeetingRecordSummary[]>([]);
  const [selectedTranscript, setSelectedTranscript] = useState<AsrTranscript | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<MeetingRecord | null>(null);
  const [asrProviders, setAsrProviders] = useState<AIProvider[]>([]);
  const [llmProviders, setLlmProviders] = useState<AIProvider[]>([]);
  const [policySnapshot, setPolicySnapshot] = useState<UsagePolicySnapshot | null>(null);
  const [asrProviderId, setAsrProviderId] = useState<number | null>(null);
  const [llmProviderId, setLlmProviderId] = useState<number | null>(null);
  const [selectedTranscriptId, setSelectedTranscriptId] = useState<number | null>(null);
  const [selectedMeetingId, setSelectedMeetingId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [activeTab, setActiveTab] = useState<MeetingTab>('summary');
  const [loading, setLoading] = useState(true);
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [loadingMeeting, setLoadingMeeting] = useState(false);
  const [submittingTranscript, setSubmittingTranscript] = useState(false);
  const [submittingMeeting, setSubmittingMeeting] = useState(false);
  const [deletingTranscriptId, setDeletingTranscriptId] = useState<number | null>(null);
  const [deletingMeetingId, setDeletingMeetingId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!notesEnabled && workspaceMode === 'meeting') {
      setWorkspaceMode('transcript');
    }
  }, [notesEnabled, workspaceMode]);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const [
          nextTranscriptEntries,
          nextAsrProviders,
          nextPolicySnapshot,
          nextMeetingEntries,
          nextLlmProviders
        ] = await Promise.all([
          asrApi.list({ limit: 24 }),
          aiProvidersApi.list({ kind: 'asr' }),
          usagePolicyApi.get(),
          notesEnabled ? meetingsApi.list({ limit: 24 }) : Promise.resolve([] as MeetingRecordSummary[]),
          notesEnabled ? aiProvidersApi.list({ kind: 'llm' }) : Promise.resolve([] as AIProvider[])
        ]);

        if (!alive) {
          return;
        }

        setTranscriptEntries(nextTranscriptEntries);
        setMeetingEntries(nextMeetingEntries);
        setAsrProviders(nextAsrProviders);
        setLlmProviders(nextLlmProviders);
        setPolicySnapshot(nextPolicySnapshot);
        setAsrProviderId((current) => current ?? nextAsrProviders[0]?.id ?? null);
        setLlmProviderId((current) => current ?? nextLlmProviders[0]?.id ?? null);

        const nextTranscriptId = nextTranscriptEntries[0]?.id ?? null;
        const nextMeetingId = nextMeetingEntries[0]?.id ?? null;
        setSelectedTranscriptId(nextTranscriptId);
        setSelectedMeetingId(nextMeetingId);

        const [nextTranscript, nextMeeting] = await Promise.all([
          nextTranscriptId ? asrApi.get(nextTranscriptId) : Promise.resolve(null as AsrTranscript | null),
          notesEnabled && nextMeetingId ? meetingsApi.get(nextMeetingId) : Promise.resolve(null as MeetingRecord | null)
        ]);

        if (!alive) {
          return;
        }

        setSelectedTranscript(nextTranscript);
        setSelectedMeeting(nextMeeting);
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
  }, [notesEnabled]);

  const canRunMeetingNotes =
    notesEnabled &&
    llmProviders.length > 0 &&
    (policySnapshot?.usage.llm_runs_remaining ?? 1) > 0;

  async function loadTranscriptEntries(targetId?: number | null) {
    const items = await asrApi.list({ limit: 24 });
    setTranscriptEntries(items);
    const nextSelectedId = targetId ?? items[0]?.id ?? null;
    setSelectedTranscriptId(nextSelectedId);
    if (nextSelectedId) {
      setLoadingTranscript(true);
      try {
        setSelectedTranscript(await asrApi.get(nextSelectedId));
      } finally {
        setLoadingTranscript(false);
      }
    } else {
      setSelectedTranscript(null);
    }
  }

  async function loadMeetingEntries(targetId?: number | null) {
    const items = await meetingsApi.list({ limit: 24 });
    setMeetingEntries(items);
    const nextSelectedId = targetId ?? items[0]?.id ?? null;
    setSelectedMeetingId(nextSelectedId);
    if (nextSelectedId) {
      setLoadingMeeting(true);
      try {
        setSelectedMeeting(await meetingsApi.get(nextSelectedId));
      } finally {
        setLoadingMeeting(false);
      }
    } else {
      setSelectedMeeting(null);
    }
  }

  async function handleRefresh() {
    setError('');
    setNotice('');
    try {
      const nextPolicy = await usagePolicyApi.get();
      setPolicySnapshot(nextPolicy);
      await Promise.all([
        loadTranscriptEntries(selectedTranscriptId),
        notesEnabled ? loadMeetingEntries(selectedMeetingId) : Promise.resolve()
      ]);
    } catch (err) {
      setError(extractApiErrorMessage(err));
    }
  }

  async function handleSelectTranscript(id: number) {
    setSelectedTranscriptId(id);
    setLoadingTranscript(true);
    setError('');
    try {
      setSelectedTranscript(await asrApi.get(id));
      setWorkspaceMode('transcript');
    } catch (err) {
      setError(extractApiErrorMessage(err));
    } finally {
      setLoadingTranscript(false);
    }
  }

  async function handleSelectMeeting(id: number) {
    setSelectedMeetingId(id);
    setLoadingMeeting(true);
    setError('');
    try {
      setSelectedMeeting(await meetingsApi.get(id));
      setActiveTab('summary');
      setWorkspaceMode('meeting');
    } catch (err) {
      setError(extractApiErrorMessage(err));
    } finally {
      setLoadingMeeting(false);
    }
  }

  async function handleTranscriptSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError('Add audio first.');
      return;
    }

    setSubmittingTranscript(true);
    setError('');
    setNotice('');
    try {
      const created = await asrApi.transcribe({ file, title, language, provider_id: asrProviderId });
      setSelectedTranscript(created);
      setSelectedTranscriptId(created.id);
      setFile(null);
      setTitle('');
      setLanguage('');
      setPolicySnapshot(await usagePolicyApi.get());
      await loadTranscriptEntries(created.id);
      setWorkspaceMode('transcript');
      setNotice('Transcript saved.');
    } catch (err) {
      setError(extractApiErrorMessage(err));
    } finally {
      setSubmittingTranscript(false);
    }
  }

  async function handleMeetingSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError('Add audio first.');
      return;
    }

    setSubmittingMeeting(true);
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
      setSelectedMeeting(created);
      setSelectedMeetingId(created.id);
      setFile(null);
      setTitle('');
      setLanguage('');
      setActiveTab('summary');
      setPolicySnapshot(await usagePolicyApi.get());
      await loadMeetingEntries(created.id);
      setWorkspaceMode('meeting');
      setNotice('Notes saved.');
    } catch (err) {
      setError(extractApiErrorMessage(err));
    } finally {
      setSubmittingMeeting(false);
    }
  }

  async function handleDeleteTranscript(id: number) {
    if (!window.confirm('Delete this transcript?')) {
      return;
    }

    setDeletingTranscriptId(id);
    setError('');
    setNotice('');
    try {
      await asrApi.remove(id);
      await loadTranscriptEntries(selectedTranscriptId === id ? null : selectedTranscriptId);
      setNotice('Transcript deleted.');
    } catch (err) {
      setError(extractApiErrorMessage(err));
    } finally {
      setDeletingTranscriptId(null);
    }
  }

  async function handleDeleteMeeting(id: number) {
    if (!window.confirm('Delete this meeting record?')) {
      return;
    }

    setDeletingMeetingId(id);
    setError('');
    setNotice('');
    try {
      await meetingsApi.remove(id);
      await loadMeetingEntries(selectedMeetingId === id ? null : selectedMeetingId);
      setNotice('Notes deleted.');
    } catch (err) {
      setError(extractApiErrorMessage(err));
    } finally {
      setDeletingMeetingId(null);
    }
  }

  async function handleLiveSaved(created: AsrTranscript) {
    setSelectedTranscript(created);
    setSelectedTranscriptId(created.id);
    setTitle('');
    setLanguage('');
    setPolicySnapshot(await usagePolicyApi.get());
    await loadTranscriptEntries(created.id);
    setWorkspaceMode('transcript');
  }

  async function copyActiveContent() {
    const value =
      workspaceMode === 'transcript'
        ? selectedTranscript?.transcript_text
        : activeTab === 'summary'
          ? selectedMeeting?.summary_text
          : activeTab === 'minutes'
            ? selectedMeeting?.minutes_text
            : activeTab === 'actions'
              ? selectedMeeting?.action_items_text
              : selectedMeeting?.transcript_text;

    if (!value || typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(value);
    setNotice(workspaceMode === 'transcript' ? 'Transcript copied.' : 'Notes copied.');
  }

  function renderMeetingTab(meeting: MeetingRecord) {
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
        <EmptyState title="No to-do" description="This note set has no action items." />
      );
    }
    return <pre className="transcript-body meeting-body">{meeting.transcript_text}</pre>;
  }

  if (loading) {
    return (
      <div className="page">
        <Card className="section-card">
          <div className="spinner" />
          <p className="muted">Loading audio...</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="page">
      <PageIntro
        title="Audio"
        description={notesEnabled ? 'Transcript or notes.' : 'Transcript.'}
        actions={
          <>
            <button className="btn btn-primary" type="button" onClick={() => void handleRefresh()}>
              Refresh
            </button>
            {(selectedTranscript?.transcript_text || selectedMeeting) ? (
              <button className="btn btn-ghost" type="button" onClick={() => void copyActiveContent()}>
                Copy
              </button>
            ) : null}
          </>
        }
        aside={
          <div className="metric-strip">
            <MetricPill label="Transcripts" value={transcriptEntries.length} tone="info" />
            {notesEnabled ? <MetricPill label="Meetings" value={meetingEntries.length} tone="neutral" /> : null}
            <MetricPill label="Audio 24h" value={formatDuration(policySnapshot?.usage.audio_seconds_last_24h ?? null)} tone="success" />
            {notesEnabled ? (
              <MetricPill
                label="Text left"
                value={
                  policySnapshot
                    ? `${policySnapshot.usage.llm_runs_remaining}/${policySnapshot.policy.llm_runs_per_24h}`
                    : 'n/a'
                }
                tone="warning"
              />
            ) : null}
            <MetricPill label="Cap" value={formatDuration(policySnapshot?.policy.max_audio_seconds_per_request ?? null)} tone="neutral" />
          </div>
        }
      />

      {error ? <Notice title="Audio error" description={error} tone="danger" /> : null}
      {notice ? <Notice title={notice} tone="success" /> : null}

      {notesEnabled ? (
        <Card className="section-card">
          <SegmentedControl
            label="Audio mode"
            value={workspaceMode}
            onChange={(value) => setWorkspaceMode(value as WorkspaceMode)}
            options={[
              { value: 'transcript', label: 'Transcript', count: transcriptEntries.length },
              { value: 'meeting', label: 'Notes', count: meetingEntries.length }
            ]}
          />
        </Card>
      ) : null}

      <div className="grid two">
        <Card className="section-card">
          <SectionHeader
            title={workspaceMode === 'transcript' ? 'New transcript' : 'New notes'}
            description={workspaceMode === 'transcript' ? 'Live or file.' : 'Audio to summary, minutes, and to-do.'}
          />

          {workspaceMode === 'transcript' ? (
            <div className="form-grid">
              <SegmentedControl
                label="Transcript input"
                value={transcriptInputMode}
                onChange={(value) => setTranscriptInputMode(value as TranscriptInputMode)}
                options={[
                  { value: 'live', label: 'Live' },
                  { value: 'file', label: 'File' }
                ]}
              />
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
                  <span>ASR</span>
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
                  {asrProviders[0] ? `${asrProviders[0].name} · ${asrProviders[0].model_name}` : 'No ASR provider.'}
                </div>
              )}
              <div className="detail-row">
                <span className="capture-pill">Used {formatDuration(policySnapshot?.usage.audio_seconds_last_24h ?? null)}</span>
                <span className="capture-pill">Max {formatDuration(policySnapshot?.policy.max_audio_seconds_per_request ?? null)}</span>
              </div>

              {transcriptInputMode === 'live' ? (
                <LiveAsrPanel
                  providerId={asrProviderId}
                  providerLabel={asrProviders.find((provider) => provider.id === asrProviderId)?.name ?? asrProviders[0]?.name ?? 'ASR'}
                  language={language}
                  title={title}
                  maxDurationSeconds={policySnapshot?.policy.max_audio_seconds_per_request ?? null}
                  onSaved={handleLiveSaved}
                  onNotice={(message) => {
                    setNotice(message);
                    setError('');
                  }}
                  onError={(message) => {
                    setError(message);
                    setNotice('');
                  }}
                />
              ) : (
                <form className="form-grid" onSubmit={handleTranscriptSubmit}>
                  <AudioCapturePanel file={file} onChange={setFile} filenameBase="audio" disabled={submittingTranscript} />
                  <Button type="submit" disabled={submittingTranscript || !file || !asrProviders.length}>
                    {submittingTranscript ? 'Saving...' : 'Save transcript'}
                  </Button>
                </form>
              )}
            </div>
          ) : (
            <form className="form-grid" onSubmit={handleMeetingSubmit}>
              <AudioCapturePanel file={file} onChange={setFile} filenameBase="meeting" disabled={submittingMeeting} />
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
                  <span>ASR</span>
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
                  {asrProviders[0] ? `${asrProviders[0].name} · ${asrProviders[0].model_name}` : 'No ASR provider.'}
                </div>
              )}
              {llmProviders.length > 1 ? (
                <label className="field">
                  <span>LLM</span>
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
                  {llmProviders[0] ? `${llmProviders[0].name} · ${llmProviders[0].model_name}` : 'No LLM provider.'}
                </div>
              )}
              <div className="detail-row">
                <span className="capture-pill">
                  {policySnapshot
                    ? `${policySnapshot.usage.llm_runs_remaining} of ${policySnapshot.policy.llm_runs_per_24h} text runs left`
                    : 'Text budget loading'}
                </span>
                <span className="capture-pill">Max {formatDuration(policySnapshot?.policy.max_audio_seconds_per_request ?? null)}</span>
              </div>
              {!llmProviders.length ? <Notice title="Add one LLM provider in Control." tone="warning" /> : null}
              <Button type="submit" disabled={submittingMeeting || !file || !asrProviders.length || !canRunMeetingNotes}>
                {submittingMeeting ? 'Saving...' : 'Save notes'}
              </Button>
            </form>
          )}
        </Card>

        <Card className="section-card">
          <SectionHeader title={workspaceMode === 'transcript' ? 'Transcripts' : 'Meetings'} />
          <div className="list-table">
            {workspaceMode === 'transcript' ? (
              transcriptEntries.length ? (
                transcriptEntries.map((entry) => (
                  <div key={entry.id} className="list-row">
                    <div className="list-row-main">
                      <div className="list-row-header">
                        <h3 className="list-row-title line-clamp-1">{entry.title}</h3>
                        <div className="list-row-meta">
                          <Badge tone={selectedTranscriptId === entry.id ? 'info' : 'neutral'}>
                            {selectedTranscriptId === entry.id ? 'Open' : 'Saved'}
                          </Badge>
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
                        <Button variant="secondary" onClick={() => void handleSelectTranscript(entry.id)}>
                          View
                        </Button>
                        <Button
                          variant="danger"
                          disabled={deletingTranscriptId === entry.id}
                          onClick={() => void handleDeleteTranscript(entry.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState title="No transcripts" description="Save the first one." />
              )
            ) : meetingEntries.length ? (
              meetingEntries.map((entry) => (
                <div key={entry.id} className="list-row">
                  <div className="list-row-main">
                    <div className="list-row-header">
                      <h3 className="list-row-title line-clamp-1">{entry.title}</h3>
                      <div className="list-row-meta">
                        <Badge tone={selectedMeetingId === entry.id ? 'info' : 'neutral'}>
                          {selectedMeetingId === entry.id ? 'Open' : 'Saved'}
                        </Badge>
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
                      <Button variant="secondary" onClick={() => void handleSelectMeeting(entry.id)}>
                        View
                      </Button>
                      <Button
                        variant="danger"
                        disabled={deletingMeetingId === entry.id}
                        onClick={() => void handleDeleteMeeting(entry.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState title="No meetings" description="Save the first one." />
            )}
          </div>
        </Card>
      </div>

      <Card className="section-card">
        <SectionHeader
          title={
            workspaceMode === 'transcript'
              ? selectedTranscript?.title ?? 'Transcript'
              : selectedMeeting?.title ?? 'Meeting'
          }
          description={
            workspaceMode === 'transcript'
              ? selectedTranscript
                ? `${selectedTranscript.original_filename} · ${formatDateTime(selectedTranscript.created_at)}`
                : undefined
              : selectedMeeting
                ? `${selectedMeeting.audio_filename} · ${formatDateTime(selectedMeeting.created_at)}`
                : undefined
          }
        />

        {workspaceMode === 'transcript' ? (
          loadingTranscript ? (
            <div className="spinner" />
          ) : selectedTranscript ? (
            <div className="transcript-surface">
              <div className="detail-row">
                <Badge tone="neutral">{selectedTranscript.language || 'auto'}</Badge>
                <Badge tone="neutral">{formatDuration(selectedTranscript.duration_seconds)}</Badge>
                <Badge tone="neutral">{formatBytes(selectedTranscript.file_size_bytes)}</Badge>
                <Badge tone="info">{selectedTranscript.model_name}</Badge>
                <a className="btn btn-ghost" href={asrApi.audioUrl(selectedTranscript.id)}>
                  Audio
                </a>
              </div>
              <audio className="audio-player" controls preload="none" src={asrApi.audioUrl(selectedTranscript.id)} />
              <pre className="transcript-body">{selectedTranscript.transcript_text}</pre>
            </div>
          ) : (
            <EmptyState title="No transcript selected" description="Pick one from the list." />
          )
        ) : loadingMeeting ? (
          <div className="spinner" />
        ) : selectedMeeting ? (
          <div className="transcript-surface">
            <div className="detail-row">
              <Badge tone="neutral">{selectedMeeting.language || 'auto'}</Badge>
              <Badge tone="neutral">{formatDuration(selectedMeeting.duration_seconds)}</Badge>
              <Badge tone="neutral">{formatBytes(selectedMeeting.file_size_bytes)}</Badge>
              <Badge tone="info">{selectedMeeting.asr_model_name}</Badge>
              <Badge tone="warning">{selectedMeeting.llm_model_name}</Badge>
              <Badge tone="warning">{actionItemCount(selectedMeeting.action_items_text)} to-do</Badge>
              <a className="btn btn-ghost" href={meetingsApi.audioUrl(selectedMeeting.id)}>
                Audio
              </a>
            </div>
            <audio className="audio-player" controls preload="none" src={meetingsApi.audioUrl(selectedMeeting.id)} />
            <SegmentedControl
              label="Meeting view"
              value={activeTab}
              onChange={(value) => setActiveTab(value as MeetingTab)}
              options={[
                { value: 'summary', label: 'Summary' },
                { value: 'minutes', label: 'Minutes' },
                { value: 'actions', label: 'To-do', count: actionItemCount(selectedMeeting.action_items_text) },
                { value: 'transcript', label: 'Transcript' }
              ]}
            />
            {renderMeetingTab(selectedMeeting)}
          </div>
        ) : (
          <EmptyState title="No meeting selected" description="Pick one from the list." />
        )}
      </Card>

    </div>
  );
}
