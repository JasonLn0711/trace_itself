'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AudioCapturePanel } from '../components/AudioCapturePanel';
import { useConfirmationDialog } from '../components/ConfirmationDialog';
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
import { aiProvidersApi, asrApi, extractApiErrorMessage, meetingsApi, projectsApi, usagePolicyApi } from '../lib/api';
import { canUseFeature, canUseMeetingNotes } from '../lib/access';
import { formatDateTime, formatTimeOfDay } from '../lib/dates';
import { actionItemCount, formatBytes, formatDuration } from '../lib/media';
import { useAuth } from '../state/AuthContext';
import { useLiveAsr } from '../state/LiveAsrContext';
import type {
  AIProvider,
  AsrTranscript,
  AsrTranscriptEntry,
  AsrTranscriptSummary,
  MeetingRecord,
  MeetingRecordSummary,
  MeetingTranscriptEntry,
  Project,
  UsagePolicySnapshot
} from '../types';

type MeetingTab = 'summary' | 'minutes' | 'actions' | 'transcript';
type WorkspaceMode = 'transcript' | 'meeting';
type TranscriptInputMode = 'live' | 'file';

const LANGUAGE_OPTIONS = [
  { value: '', label: 'auto' },
  { value: 'zh', label: 'zh' },
  { value: 'ja', label: 'ja' },
  { value: 'ko', label: 'ko' },
  { value: 'en', label: 'en' }
] as const;

const SPEAKER_COUNT_OPTIONS = [2, 3, 4, 5, 6, 8] as const;

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

function normalizeLanguageCode(value: string | null | undefined) {
  const normalized = (value || '').trim().toLowerCase();
  if (!normalized || normalized === 'auto') {
    return '';
  }
  if (normalized === 'jp') {
    return 'ja';
  }
  if (normalized === 'kr') {
    return 'ko';
  }
  return normalized;
}

function languageLabel(value: string | null | undefined) {
  const normalized = normalizeLanguageCode(value);
  if (!normalized) {
    return 'auto';
  }
  if (normalized.startsWith('zh-')) {
    return normalized;
  }
  return LANGUAGE_OPTIONS.find((option) => option.value === normalized)?.label ?? normalized;
}

function parsePositiveIntegerParam(value: string | null) {
  const next = Number(value);
  return Number.isInteger(next) && next > 0 ? next : null;
}

function transcriptSourceLabel(value: 'live' | 'file' | string | null | undefined) {
  return (value || '').toLowerCase() === 'live' ? 'Live' : 'File';
}

function formatAudioTimestamp(seconds: number | null | undefined) {
  if (seconds == null || Number.isNaN(seconds)) {
    return '';
  }
  const wholeSeconds = Math.max(0, Math.round(seconds));
  const totalMinutes = Math.floor(wholeSeconds / 60);
  const remainingSeconds = wholeSeconds % 60;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

function renderMeetingTranscriptEntries(entries: MeetingTranscriptEntry[]) {
  return (
    <div className="transcript-body live-transcript-log">
      {entries.map((entry) => (
        <div key={`${entry.id}-${entry.started_at_seconds ?? 'start'}`} className="live-transcript-entry">
          <span className="live-transcript-text">{formatMeetingTranscriptLine(entry)}</span>
        </div>
      ))}
    </div>
  );
}

function buildMeetingTranscriptText(entries: MeetingTranscriptEntry[]) {
  return entries.map((entry) => formatMeetingTranscriptLine(entry)).join('\n');
}

function hasSpeakerAttributedTranscriptEntries(entries: AsrTranscriptEntry[]) {
  return entries.some((entry) => !!entry.speaker_label || entry.started_at_seconds != null);
}

function formatAsrTranscriptLine(entry: AsrTranscriptEntry) {
  const parts: string[] = [];
  const timestamp = formatAudioTimestamp(entry.started_at_seconds) || '--:--';
  if (timestamp) {
    parts.push(`[${timestamp}]`);
  }
  if (entry.speaker_label) {
    parts.push(`${entry.speaker_label}:`);
  }
  parts.push(entry.text);
  return parts.join(' ').trim();
}

function buildAsrTranscriptText(entries: AsrTranscriptEntry[]) {
  return entries.map((entry) => formatAsrTranscriptLine(entry)).join('\n');
}

function renderAsrTranscriptEntries(entries: AsrTranscriptEntry[]) {
  return (
    <div className="transcript-body live-transcript-log">
      {entries.map((entry) => (
        <div
          key={`${entry.id}-${entry.started_at_seconds ?? entry.recorded_at ?? 'entry'}`}
          className="live-transcript-entry"
        >
          <span className="live-transcript-text">{formatAsrTranscriptLine(entry)}</span>
        </div>
      ))}
    </div>
  );
}

function formatMeetingTranscriptLine(entry: MeetingTranscriptEntry) {
  const parts: string[] = [];
  const timestamp = formatAudioTimestamp(entry.started_at_seconds) || '--:--';
  if (timestamp) {
    parts.push(`[${timestamp}]`);
  }
  if (entry.speaker_label) {
    parts.push(`${entry.speaker_label}:`);
  }
  parts.push(entry.text);
  return parts.join(' ').trim();
}

function SaveMarkIcon() {
  return (
    <svg className="btn-save-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M3 2.5A1.5 1.5 0 0 1 4.5 1h5.379c.398 0 .78.158 1.06.44l1.621 1.62c.281.282.44.664.44 1.061V13.5A1.5 1.5 0 0 1 11.5 15h-7A1.5 1.5 0 0 1 3 13.5v-11Zm1.5-.5a.5.5 0 0 0-.5.5v11a.5.5 0 0 0 .5.5H5V10.5A1.5 1.5 0 0 1 6.5 9h3A1.5 1.5 0 0 1 11 10.5V14h.5a.5.5 0 0 0 .5-.5V4.121a.5.5 0 0 0-.146-.353l-1.621-1.621A.5.5 0 0 0 9.879 2H9v2.25A.75.75 0 0 1 8.25 5h-2.5A.75.75 0 0 1 5 4.25V2h-.5Zm1.5 0v2h2V2H6Zm.5 8a.5.5 0 0 0-.5.5V14h4v-3.5a.5.5 0 0 0-.5-.5h-3Z"
      />
    </svg>
  );
}

function AudioMarkIcon() {
  return (
    <svg className="btn-save-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M10.5 1.5a.5.5 0 0 1 .639-.48l.5.143A2.5 2.5 0 0 1 13.5 3.57v6.805a2.25 2.25 0 1 1-1-1.873V5.244L7 6.618v5.757a2.25 2.25 0 1 1-1-1.873V4.5a.5.5 0 0 1 .379-.485l4.121-1.03V1.5Zm2 2.07a1.5 1.5 0 0 0-1.118-1.45l-.382-.109v4.943l1.5-.375V3.57ZM6 11.625a1.25 1.25 0 1 0 .001 2.499A1.25 1.25 0 0 0 6 11.625Zm6.5 0a1.25 1.25 0 1 0 .001 2.499 1.25 1.25 0 0 0-.001-2.499Z"
      />
    </svg>
  );
}

export function MeetingsPage() {
  const { confirm, confirmationDialog } = useConfirmationDialog();
  const { resetIdleTimeout, user } = useAuth();
  const searchParams = useSearchParams();
  const notesEnabled = canUseMeetingNotes(user);
  const canLinkMeetingsToProjects = notesEnabled && canUseFeature(user, 'project_tracer');
  const requestedMode = searchParams.get('mode');
  const requestedProjectId = parsePositiveIntegerParam(searchParams.get('project'));
  const requestedMeetingId = parsePositiveIntegerParam(searchParams.get('meeting'));
  const requestedTranscriptId = parsePositiveIntegerParam(searchParams.get('transcript'));
  const {
    clearLastSavedTranscript,
    draft: liveAsrDraft,
    lastSavedTranscript,
    updateDraft: updateLiveAsrDraft
  } = useLiveAsr();

  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('transcript');
  const [transcriptInputMode, setTranscriptInputMode] = useState<TranscriptInputMode>('live');
  const [transcriptEntries, setTranscriptEntries] = useState<AsrTranscriptSummary[]>([]);
  const [meetingEntries, setMeetingEntries] = useState<MeetingRecordSummary[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedTranscript, setSelectedTranscript] = useState<AsrTranscript | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<MeetingRecord | null>(null);
  const [asrProviders, setAsrProviders] = useState<AIProvider[]>([]);
  const [llmProviders, setLlmProviders] = useState<AIProvider[]>([]);
  const [policySnapshot, setPolicySnapshot] = useState<UsagePolicySnapshot | null>(null);
  const [asrProviderId, setAsrProviderId] = useState<number | null>(liveAsrDraft.providerId);
  const [llmProviderId, setLlmProviderId] = useState<number | null>(null);
  const [selectedTranscriptId, setSelectedTranscriptId] = useState<number | null>(null);
  const [selectedMeetingId, setSelectedMeetingId] = useState<number | null>(null);
  const [title, setTitle] = useState(liveAsrDraft.title);
  const [language, setLanguage] = useState(liveAsrDraft.language);
  const [meetingProjectId, setMeetingProjectId] = useState('');
  const [transcriptSpeakerDiarization, setTranscriptSpeakerDiarization] = useState(false);
  const [transcriptMaxSpeakerCount, setTranscriptMaxSpeakerCount] = useState('4');
  const [meetingSpeakerDiarization, setMeetingSpeakerDiarization] = useState(false);
  const [meetingMaxSpeakerCount, setMeetingMaxSpeakerCount] = useState('4');
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
  const activeAsrProviderLabel = (asrProviders.find((provider) => provider.id === asrProviderId)?.name ?? asrProviders[0]?.name ?? 'ASR')
    .replace(/^Local Breeze ASR$/i, 'Local ASR');

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
          nextLlmProviders,
          nextProjects
        ] = await Promise.all([
          asrApi.list({ limit: 100 }),
          aiProvidersApi.list({ kind: 'asr' }),
          usagePolicyApi.get(),
          notesEnabled ? meetingsApi.list({ limit: 24 }) : Promise.resolve([] as MeetingRecordSummary[]),
          notesEnabled ? aiProvidersApi.list({ kind: 'llm' }) : Promise.resolve([] as AIProvider[]),
          canLinkMeetingsToProjects ? projectsApi.list().catch(() => [] as Project[]) : Promise.resolve([] as Project[])
        ]);

        if (!alive) {
          return;
        }

        setTranscriptEntries(nextTranscriptEntries);
        setMeetingEntries(nextMeetingEntries);
        setProjects(nextProjects);
        setAsrProviders(nextAsrProviders);
        setLlmProviders(nextLlmProviders);
        setPolicySnapshot(nextPolicySnapshot);
        setAsrProviderId((current) => current ?? nextAsrProviders[0]?.id ?? null);
        setLlmProviderId((current) => current ?? nextLlmProviders[0]?.id ?? null);
        setMeetingProjectId(
          canLinkMeetingsToProjects && requestedProjectId && nextProjects.some((project) => project.id === requestedProjectId)
            ? String(requestedProjectId)
            : ''
        );

        const nextTranscriptId = requestedTranscriptId ?? nextTranscriptEntries[0]?.id ?? null;
        const nextMeetingId = notesEnabled ? requestedMeetingId ?? nextMeetingEntries[0]?.id ?? null : null;
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
        if (notesEnabled && (requestedMeetingId || requestedMode === 'meeting')) {
          setWorkspaceMode('meeting');
        } else if (requestedMode === 'transcript') {
          setWorkspaceMode('transcript');
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
  }, [canLinkMeetingsToProjects, notesEnabled, requestedMeetingId, requestedMode, requestedProjectId, requestedTranscriptId]);

  useEffect(() => {
    updateLiveAsrDraft({
      providerId: asrProviderId,
      providerLabel: activeAsrProviderLabel,
      language,
      title,
      usageAudioSeconds: policySnapshot?.usage.audio_seconds_last_24h ?? null,
      maxDurationSeconds: policySnapshot?.policy.max_audio_seconds_per_request ?? null
    });
  }, [
    activeAsrProviderLabel,
    asrProviderId,
    language,
    policySnapshot?.policy.max_audio_seconds_per_request,
    policySnapshot?.usage.audio_seconds_last_24h,
    title,
    updateLiveAsrDraft
  ]);

  useEffect(() => {
    if (!lastSavedTranscript) {
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        await handleLiveSaved(lastSavedTranscript);
      } finally {
        if (!cancelled) {
          clearLastSavedTranscript();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clearLastSavedTranscript, lastSavedTranscript]);

  const canRunMeetingNotes =
    notesEnabled &&
    llmProviders.length > 0 &&
    (policySnapshot?.usage.llm_runs_remaining ?? 1) > 0;

  async function loadTranscriptEntries(targetId?: number | null) {
    const items = await asrApi.list({ limit: 100 });
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

    resetIdleTimeout();
    setSubmittingTranscript(true);
    setError('');
    setNotice('');
    try {
      const created = await asrApi.transcribe({
        file,
        title,
        language,
        provider_id: asrProviderId,
        speaker_diarization: transcriptSpeakerDiarization,
        max_speaker_count: transcriptSpeakerDiarization ? Number(transcriptMaxSpeakerCount) : null
      });
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

    resetIdleTimeout();
    setSubmittingMeeting(true);
    setError('');
    setNotice('');
    try {
      const created = await meetingsApi.create({
        file,
        title,
        language,
        asr_provider_id: asrProviderId,
        llm_provider_id: llmProviderId,
        project_id: meetingProjectId ? Number(meetingProjectId) : null,
        speaker_diarization: meetingSpeakerDiarization,
        max_speaker_count: meetingSpeakerDiarization ? Number(meetingMaxSpeakerCount) : null
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
    const confirmed = await confirm({
      title: 'Delete this transcript?',
      description: 'The saved transcript and its audio file will be removed.',
      confirmLabel: 'Delete transcript'
    });
    if (!confirmed) {
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
    const confirmed = await confirm({
      title: 'Delete this meeting record?',
      description: 'The transcript, notes, summary, and saved audio will be removed.',
      confirmLabel: 'Delete notes'
    });
    if (!confirmed) {
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
    setWorkspaceMode('transcript');
    setLoadingTranscript(false);
    setSelectedTranscript(created);
    setSelectedTranscriptId(created.id);
    setTitle('');
    setLanguage('');
    try {
      const [nextPolicy, items] = await Promise.all([
        usagePolicyApi.get(),
        asrApi.list({ limit: 100 })
      ]);
      setPolicySnapshot(nextPolicy);
      setTranscriptEntries(items);
      setNotice(
        created.speaker_diarization_enabled
          ? 'Live transcript saved with speaker tags.'
          : created.audio_mime_type
            ? 'Live transcript saved.'
            : 'Live transcript saved without replay audio.'
      );
    } catch (err) {
      setError(extractApiErrorMessage(err));
    }
  }

  async function copyActiveContent() {
    const value =
      workspaceMode === 'transcript'
        ? selectedTranscript?.speaker_diarization_enabled && selectedTranscript.transcript_entries.length
          ? buildAsrTranscriptText(selectedTranscript.transcript_entries)
          : selectedTranscript?.transcript_text
        : activeTab === 'summary'
          ? selectedMeeting?.summary_text
          : activeTab === 'minutes'
            ? selectedMeeting?.minutes_text
            : activeTab === 'actions'
              ? selectedMeeting?.action_items_text
              : selectedMeeting?.transcript_entries.length
                ? buildMeetingTranscriptText(selectedMeeting.transcript_entries)
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
    if (meeting.transcript_entries.length) {
      return renderMeetingTranscriptEntries(meeting.transcript_entries);
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
      {confirmationDialog}
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
            title={workspaceMode === 'transcript' ? 'New Recording...' : 'New notes'}
            description={workspaceMode === 'transcript' ? undefined : 'Audio to summary, minutes, and to-do.'}
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
                  <select value={language} onChange={(event) => setLanguage(event.target.value)}>
                    {LANGUAGE_OPTIONS.map((option) => (
                      <option key={option.label} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
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
              ) : null}

              {transcriptInputMode === 'live' ? (
                <>
                  <LiveAsrPanel />
                  <div className="list-row-copy">
                    Saved live takes try speaker diarization automatically after stop when replay audio uploads successfully.
                  </div>
                </>
              ) : (
                <form className="form-grid" onSubmit={handleTranscriptSubmit}>
                  <div className="capture-strip">
                    <span className="capture-pill">Used {formatDuration(policySnapshot?.usage.audio_seconds_last_24h ?? null)}</span>
                    <span className="capture-pill">Max {formatDuration(policySnapshot?.policy.max_audio_seconds_per_request ?? null)}</span>
                    <span className="capture-pill">{activeAsrProviderLabel}</span>
                  </div>
                  <AudioCapturePanel file={file} onChange={setFile} filenameBase="audio" disabled={submittingTranscript} />
                  <div className="field">
                    <span>Transcript mode</span>
                    <label className="list-row-copy" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <input
                        type="checkbox"
                        checked={transcriptSpeakerDiarization}
                        onChange={(event) => setTranscriptSpeakerDiarization(event.target.checked)}
                      />
                      Multi-speaker diarization
                    </label>
                    <div className="list-row-copy">
                      Use this only when more than one person is talking. It keeps the default transcript path unchanged unless you opt in.
                    </div>
                  </div>
                  {transcriptSpeakerDiarization ? (
                    <label className="field">
                      <span>Max speakers</span>
                      <select value={transcriptMaxSpeakerCount} onChange={(event) => setTranscriptMaxSpeakerCount(event.target.value)}>
                        {SPEAKER_COUNT_OPTIONS.map((count) => (
                          <option key={count} value={count}>
                            {count}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <div className="detail-row">
                    {transcriptSpeakerDiarization ? <span className="capture-pill">Speaker tags on</span> : null}
                  </div>
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
                  <select value={language} onChange={(event) => setLanguage(event.target.value)}>
                    {LANGUAGE_OPTIONS.map((option) => (
                      <option key={option.label} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {canLinkMeetingsToProjects ? (
                <label className="field">
                  <span>Project</span>
                  <select value={meetingProjectId} onChange={(event) => setMeetingProjectId(event.target.value)}>
                    <option value="">No project</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <div className="field">
                <span>Meeting mode</span>
                <label className="list-row-copy" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <input
                    type="checkbox"
                    checked={meetingSpeakerDiarization}
                    onChange={(event) => setMeetingSpeakerDiarization(event.target.checked)}
                  />
                  Multi-speaker diarization
                </label>
                <div className="list-row-copy">
                  Use this only when more than one person is talking. It runs on the optional NeMo diarizer path and is slower than the default single-speaker flow.
                </div>
              </div>
              {meetingSpeakerDiarization ? (
                <label className="field">
                  <span>Max speakers</span>
                  <select value={meetingMaxSpeakerCount} onChange={(event) => setMeetingMaxSpeakerCount(event.target.value)}>
                    {SPEAKER_COUNT_OPTIONS.map((count) => (
                      <option key={count} value={count}>
                        {count}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
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
                {meetingSpeakerDiarization ? <span className="capture-pill">Speaker tags on</span> : null}
              </div>
              {!llmProviders.length ? <Notice title="Add one LLM provider in Control." tone="warning" /> : null}
              <Button type="submit" disabled={submittingMeeting || !file || !asrProviders.length || !canRunMeetingNotes}>
                {submittingMeeting ? 'Saving...' : 'Save notes'}
              </Button>
            </form>
          )}
        </Card>

        <Card className="section-card">
          <SectionHeader title={workspaceMode === 'transcript' ? 'Your transcripts' : 'Your meetings'} />
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
                          <Badge tone={entry.capture_mode === 'live' ? 'success' : 'neutral'}>
                            {transcriptSourceLabel(entry.capture_mode)}
                          </Badge>
                          <Badge tone="neutral">{languageLabel(entry.language)}</Badge>
                          <Badge tone="neutral">{formatDuration(entry.duration_seconds)}</Badge>
                          {entry.speaker_diarization_enabled ? (
                            <Badge tone="info">
                              {entry.speaker_count ? `${entry.speaker_count} speakers` : 'Multi-speaker'}
                            </Badge>
                          ) : null}
                          {entry.capture_mode === 'live' && entry.live_entry_count ? (
                            <Badge tone="neutral">{entry.live_entry_count} lines</Badge>
                          ) : null}
                        </div>
                      </div>
                      <div className="list-row-copy line-clamp-1">{entry.excerpt || 'No transcript text.'}</div>
                      <div className="list-row-copy line-clamp-1">
                        {entry.original_filename} · {entry.audio_mime_type ? formatBytes(entry.file_size_bytes) : 'No audio'} · {formatDateTime(entry.created_at)}
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
                        {entry.project_name ? <Badge tone="info">{entry.project_name}</Badge> : null}
                        <Badge tone="neutral">{languageLabel(entry.language)}</Badge>
                        <Badge tone="neutral">{formatDuration(entry.duration_seconds)}</Badge>
                        {entry.speaker_diarization_enabled ? (
                          <Badge tone="info">
                            {entry.speaker_count ? `${entry.speaker_count} speakers` : 'Multi-speaker'}
                          </Badge>
                        ) : null}
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
                ? `${selectedTranscript.original_filename} · ${selectedTranscript.audio_mime_type ? formatBytes(selectedTranscript.file_size_bytes) : 'No audio'} · ${formatDateTime(selectedTranscript.created_at)}`
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
                <Badge tone={selectedTranscript.capture_mode === 'live' ? 'success' : 'neutral'}>
                  {transcriptSourceLabel(selectedTranscript.capture_mode)}
                </Badge>
                <Badge tone="neutral">{languageLabel(selectedTranscript.language)}</Badge>
                <Badge tone="neutral">{formatDuration(selectedTranscript.duration_seconds)}</Badge>
                <Badge tone={selectedTranscript.audio_mime_type ? 'neutral' : 'warning'}>
                  {selectedTranscript.audio_mime_type ? formatBytes(selectedTranscript.file_size_bytes) : 'No audio file'}
                </Badge>
                <Badge tone="info">{selectedTranscript.model_name}</Badge>
                {selectedTranscript.speaker_diarization_enabled ? (
                  <Badge tone="info">
                    {selectedTranscript.speaker_count ? `${selectedTranscript.speaker_count} speakers` : 'Multi-speaker'}
                  </Badge>
                ) : null}
                {selectedTranscript.speaker_diarization_model_name ? (
                  <Badge tone="neutral">{selectedTranscript.speaker_diarization_model_name}</Badge>
                ) : null}
                {selectedTranscript.audio_mime_type ? (
                  <a className="btn btn-save-action" href={asrApi.audioUrl(selectedTranscript.id)} download>
                    <AudioMarkIcon />
                    Save audio
                  </a>
                ) : null}
                <a className="btn btn-save-action" href={asrApi.textUrl(selectedTranscript.id)} download>
                  <SaveMarkIcon />
                  Save transcript
                </a>
              </div>
              {selectedTranscript.audio_mime_type ? (
                <audio className="audio-player" controls preload="none" src={asrApi.audioUrl(selectedTranscript.id)} />
              ) : (
                <Notice
                  title="Audio unavailable"
                  description="This transcript was saved without an audio file, but the transcript text and live lines were preserved."
                  tone="warning"
                />
              )}
              {selectedTranscript.transcript_entries.length ? (
                selectedTranscript.speaker_diarization_enabled && hasSpeakerAttributedTranscriptEntries(selectedTranscript.transcript_entries) ? (
                  renderAsrTranscriptEntries(selectedTranscript.transcript_entries)
                ) : (
                  <div className="transcript-body live-transcript-log">
                    {selectedTranscript.transcript_entries.map((entry) => (
                      <div key={`${entry.id}-${entry.recorded_at ?? entry.started_at_seconds ?? 'entry'}`} className="live-transcript-entry">
                        {entry.recorded_at ? <span className="live-transcript-time">[{formatTimeOfDay(entry.recorded_at)}]</span> : null}
                        <span className="live-transcript-text">{entry.text}</span>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <pre className="transcript-body">{selectedTranscript.transcript_text}</pre>
              )}
            </div>
          ) : (
            <EmptyState title="No transcript selected" description="Pick one from the list." />
          )
        ) : loadingMeeting ? (
          <div className="spinner" />
        ) : selectedMeeting ? (
          <div className="transcript-surface">
            <div className="detail-row">
              <Badge tone="neutral">{languageLabel(selectedMeeting.language)}</Badge>
              <Badge tone="neutral">{formatDuration(selectedMeeting.duration_seconds)}</Badge>
              <Badge tone="neutral">{formatBytes(selectedMeeting.file_size_bytes)}</Badge>
              <Badge tone="info">{selectedMeeting.asr_model_name}</Badge>
              {selectedMeeting.speaker_diarization_enabled ? (
                <Badge tone="info">
                  {selectedMeeting.speaker_count ? `${selectedMeeting.speaker_count} speakers` : 'Multi-speaker'}
                </Badge>
              ) : null}
              {selectedMeeting.speaker_diarization_model_name ? (
                <Badge tone="neutral">{selectedMeeting.speaker_diarization_model_name}</Badge>
              ) : null}
              <Badge tone="warning">{selectedMeeting.llm_model_name}</Badge>
              {selectedMeeting.project_name ? <Badge tone="info">{selectedMeeting.project_name}</Badge> : null}
              <Badge tone="warning">{actionItemCount(selectedMeeting.action_items_text)} to-do</Badge>
              {selectedMeeting.project_id && canLinkMeetingsToProjects ? (
                <Link className="btn btn-ghost" href={`/projects/${selectedMeeting.project_id}`}>
                  View project
                </Link>
              ) : null}
              <a className="btn btn-save-action" href={meetingsApi.transcriptTextUrl(selectedMeeting.id)} download>
                <SaveMarkIcon />
                Save transcript
              </a>
              <a className="btn btn-save-action" href={meetingsApi.audioUrl(selectedMeeting.id)} download>
                <AudioMarkIcon />
                Save audio
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
