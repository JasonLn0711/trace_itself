'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Badge, Button, Notice, ProgressBar } from './Primitives';
import { asrApi, extractApiErrorMessage } from '../lib/api';
import { formatDuration } from '../lib/media';
import type { AsrTranscript, LiveAsrSessionSnapshot } from '../types';
import { useAuth } from '../state/AuthContext';

type RecordingPreset = {
  mimeType: string;
  extension: string;
};

type LiveState = 'idle' | 'connecting' | 'live' | 'stopping' | 'saving';

type AudioContextLike = typeof AudioContext;

type LiveAsrPanelProps = {
  providerId: number | null;
  providerLabel: string;
  language: string;
  title: string;
  usageAudioSeconds: number | null;
  maxDurationSeconds: number | null;
  onSaved: (transcript: AsrTranscript) => Promise<void> | void;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
};

type PipelineRefs = {
  audioContext: AudioContext;
  stream: MediaStream;
  mediaRecorder: MediaRecorder;
  worklet: AudioWorkletNode;
  muteGain: GainNode;
};

const RECORDING_PRESETS: RecordingPreset[] = [
  { mimeType: 'audio/webm;codecs=opus', extension: 'webm' },
  { mimeType: 'audio/webm', extension: 'webm' },
  { mimeType: 'audio/mp4', extension: 'm4a' },
  { mimeType: 'audio/ogg;codecs=opus', extension: 'ogg' }
];

function getRecordingPreset(): RecordingPreset | null {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
    return null;
  }
  for (const preset of RECORDING_PRESETS) {
    if (typeof MediaRecorder.isTypeSupported !== 'function' || MediaRecorder.isTypeSupported(preset.mimeType)) {
      return preset;
    }
  }
  return null;
}

function padTwo(value: number) {
  return String(value).padStart(2, '0');
}

function formatLiveTitlePrefix(value: Date) {
  return `${padTwo(value.getFullYear() % 100)}${padTwo(value.getMonth() + 1)}${padTwo(value.getDate())}_${padTwo(value.getHours())}${padTwo(value.getMinutes())}`;
}

function normalizeTitleSlug(value: string) {
  const ascii = value.normalize('NFKD').replace(/[^\x00-\x7F]/g, '');
  const compact = ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
  return compact || 'record';
}

function buildLiveTranscriptName(startedAt: Date | null, rawTitle: string) {
  const baseDate = startedAt ?? new Date();
  return `${formatLiveTitlePrefix(baseDate)}_${normalizeTitleSlug(rawTitle)}`.slice(0, 200);
}

function mergeByteChunks(chunks: Uint8Array[]) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

function formatTranscriptTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '--:--:--';
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date);
}

export function LiveAsrPanel({
  providerId,
  providerLabel,
  language,
  title,
  usageAudioSeconds,
  maxDurationSeconds,
  onSaved,
  onNotice,
  onError
}: LiveAsrPanelProps) {
  const [state, setState] = useState<LiveState>('idle');
  const [snapshot, setSnapshot] = useState<LiveAsrSessionSnapshot | null>(null);
  const [localError, setLocalError] = useState('');
  const [pendingSave, setPendingSave] = useState(false);
  const { resetIdleTimeout, setSessionHold } = useAuth();
  const sessionHoldKey = useId();

  const pipelineRef = useRef<PipelineRefs | null>(null);
  const chunkQueueRef = useRef<Uint8Array[]>([]);
  const recorderChunksRef = useRef<BlobPart[]>([]);
  const recorderStopPromiseRef = useRef<Promise<File | null> | null>(null);
  const recorderStopResolverRef = useRef<((file: File | null) => void) | null>(null);
  const sendingRef = useRef(false);
  const pendingFinalizeRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  const recordedFileRef = useRef<File | null>(null);
  const pendingPersistRef = useRef<{ sessionId: string; file: File } | null>(null);
  const startedAtRef = useRef<Date | null>(null);
  const titleRef = useRef(title);

  const preset = useMemo(() => getRecordingPreset(), []);
  const supported =
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    typeof AudioWorkletNode !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia;

  useEffect(() => {
    return () => {
      void teardownPipeline();
    };
  }, []);

  useEffect(() => {
    titleRef.current = title;
  }, [title]);

  useEffect(() => {
    const active = state !== 'idle';
    setSessionHold(`live-asr:${sessionHoldKey}`, active);
    return () => {
      setSessionHold(`live-asr:${sessionHoldKey}`, false);
    };
  }, [sessionHoldKey, setSessionHold, state]);

  const liveLabel =
    state === 'connecting'
      ? 'Linking'
      : state === 'live'
        ? 'Live'
        : state === 'stopping'
          ? 'Closing'
          : state === 'saving'
            ? 'Saving'
            : 'Idle';

  async function startLive() {
    if (!supported || !providerId || state !== 'idle') {
      return;
    }

    setLocalError('');
    resetIdleTimeout();
    startedAtRef.current = new Date();
    setSnapshot(null);
    pendingPersistRef.current = null;
    setPendingSave(false);
    recordedFileRef.current = null;
    recorderChunksRef.current = [];
    chunkQueueRef.current = [];
    pendingFinalizeRef.current = false;

    try {
      setState('connecting');
      const nextSnapshot = await asrApi.createLiveSession({
        provider_id: providerId,
        language
      });
      sessionIdRef.current = nextSnapshot.session_id;
      setSnapshot(nextSnapshot);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      const AudioContextCtor =
        window.AudioContext ||
        (window as Window & typeof globalThis & { webkitAudioContext?: AudioContextLike }).webkitAudioContext;

      if (!AudioContextCtor) {
        throw new Error('AudioContext is not available in this browser.');
      }

      const audioContext = new AudioContextCtor({
        latencyHint: 'interactive'
      });
      await audioContext.audioWorklet.addModule('/live-audio-stream-processor.js');

      const source = audioContext.createMediaStreamSource(stream);
      const highPass = audioContext.createBiquadFilter();
      highPass.type = 'highpass';
      highPass.frequency.value = 120;

      const compressor = audioContext.createDynamicsCompressor();
      compressor.threshold.value = -28;
      compressor.knee.value = 18;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.002;
      compressor.release.value = 0.2;

      const gain = audioContext.createGain();
      gain.gain.value = 1;

      const destination = audioContext.createMediaStreamDestination();
      const muteGain = audioContext.createGain();
      muteGain.gain.value = 0;

      const worklet = new AudioWorkletNode(audioContext, 'live-audio-stream-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: {
          targetSampleRate: 16000,
          emitFrameSamples: 3200,
          targetRms: 0.18,
          maxGain: 4,
          noiseFloor: 0.007,
          gateFloor: 0.003
        }
      });

      worklet.port.onmessage = (event: MessageEvent<{ pcm?: ArrayBuffer; level?: number }>) => {
        if (typeof event.data?.level === 'number') {
          setSnapshot((current) =>
            current
              ? {
                  ...current,
                  level: event.data.level ?? current.level
                }
              : current
          );
        }
        if (event.data?.pcm) {
          chunkQueueRef.current.push(new Uint8Array(event.data.pcm));
          void flushChunkQueue();
        }
      };

      const mediaRecorder = preset?.mimeType
        ? new MediaRecorder(destination.stream, {
            mimeType: preset.mimeType,
            audioBitsPerSecond: 128000
          })
        : new MediaRecorder(destination.stream);

      mediaRecorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) {
          recorderChunksRef.current.push(event.data);
        }
      });

      recorderStopPromiseRef.current = new Promise<File | null>((resolve) => {
        recorderStopResolverRef.current = resolve;
      });

      mediaRecorder.addEventListener('stop', () => {
        const blob = new Blob(recorderChunksRef.current, {
          type: preset?.mimeType || mediaRecorder.mimeType || 'audio/webm'
        });
        const generatedName = buildLiveTranscriptName(startedAtRef.current, titleRef.current);
        const file = blob.size
          ? new File([blob], `${generatedName}.${preset?.extension ?? 'webm'}`, {
              type: blob.type || preset?.mimeType || 'audio/webm',
              lastModified: Date.now()
            })
          : null;
        recordedFileRef.current = file;
        recorderStopResolverRef.current?.(file);
      });

      source.connect(highPass);
      highPass.connect(compressor);
      compressor.connect(gain);
      gain.connect(destination);
      gain.connect(worklet);
      worklet.connect(muteGain);
      muteGain.connect(audioContext.destination);

      mediaRecorder.start(1000);
      pipelineRef.current = {
        audioContext,
        stream,
        mediaRecorder,
        worklet,
        muteGain
      };

      setState('live');
    } catch (error) {
      await discardServerSession();
      await teardownPipeline();
      setState('idle');
      setLocalError(extractApiErrorMessage(error));
      onError(extractApiErrorMessage(error));
    }
  }

  async function stopLive() {
    if (state !== 'live' && state !== 'connecting') {
      return;
    }

    setState('stopping');
    await stopRecorderAndPipeline();

    if (sendingRef.current || chunkQueueRef.current.length) {
      pendingFinalizeRef.current = true;
      return;
    }

    await finalizeAndMaybePersist();
  }

  async function discardLive() {
    pendingFinalizeRef.current = false;
    await teardownPipeline();
    await discardServerSession();
    clearLiveState();
  }

  async function flushChunkQueue() {
    if (sendingRef.current || !sessionIdRef.current || !chunkQueueRef.current.length) {
      return;
    }

    const payload = mergeByteChunks(chunkQueueRef.current.splice(0));
    if (!payload.byteLength) {
      return;
    }

    sendingRef.current = true;
    try {
      const sessionId = sessionIdRef.current;
      if (!sessionId) {
        return;
      }
      const nextSnapshot = await asrApi.pushLiveChunk(sessionId, payload);
      setSnapshot(nextSnapshot);
    } catch (error) {
      setLocalError(extractApiErrorMessage(error));
      onError(extractApiErrorMessage(error));
      await discardLive();
      return;
    } finally {
      sendingRef.current = false;
    }

    if (chunkQueueRef.current.length) {
      void flushChunkQueue();
      return;
    }

    if (pendingFinalizeRef.current) {
      pendingFinalizeRef.current = false;
      await finalizeAndMaybePersist();
    }
  }

  async function finalizeAndMaybePersist() {
    const sessionId = sessionIdRef.current;
    if (!sessionId) {
      clearLiveState();
      return;
    }

    try {
      const finalSnapshot = await asrApi.finalizeLiveSession(sessionId);
      setSnapshot(finalSnapshot);
      const recordedFile = recordedFileRef.current ?? (recorderStopPromiseRef.current ? await recorderStopPromiseRef.current : null);

      if (!recordedFile || !finalSnapshot.preview_text.trim()) {
        await discardServerSession();
        clearLiveState();
        onNotice('Live session stopped.');
        return;
      }

      pendingPersistRef.current = {
        sessionId,
        file: recordedFile
      };
      setPendingSave(true);
      await persistPendingLiveTake();
    } catch (error) {
      setLocalError(extractApiErrorMessage(error));
      setState('idle');
      onError(extractApiErrorMessage(error));
    }
  }

  async function persistPendingLiveTake() {
    const pending = pendingPersistRef.current;
    if (!pending) {
      return;
    }

    try {
      setState('saving');
      const transcript = await asrApi.persistLiveSession({
        session_id: pending.sessionId,
        file: pending.file,
        title: buildLiveTranscriptName(startedAtRef.current, titleRef.current)
      });
      pendingPersistRef.current = null;
      setPendingSave(false);
      clearLiveState();
      await onSaved(transcript);
      onNotice('Live transcript saved.');
    } catch (error) {
      setLocalError(extractApiErrorMessage(error));
      setState('idle');
      onError(extractApiErrorMessage(error));
    }
  }

  async function stopRecorderAndPipeline() {
    const pipeline = pipelineRef.current;
    if (!pipeline) {
      return;
    }

    if (pipeline.mediaRecorder.state !== 'inactive') {
      pipeline.mediaRecorder.stop();
    }

    pipeline.stream.getTracks().forEach((track) => track.stop());
    pipeline.worklet.port.onmessage = null;
    try {
      pipeline.worklet.disconnect();
      pipeline.muteGain.disconnect();
    } catch {}

    await pipeline.audioContext.close().catch(() => undefined);
    pipelineRef.current = null;
  }

  async function teardownPipeline() {
    await stopRecorderAndPipeline();
    if (recorderStopResolverRef.current) {
      recorderStopResolverRef.current(recordedFileRef.current);
      recorderStopResolverRef.current = null;
    }
  }

  async function discardServerSession() {
    const sessionId = sessionIdRef.current;
    if (!sessionId) {
      return;
    }
    await asrApi.discardLiveSession(sessionId).catch(() => undefined);
  }

  function clearLiveState() {
    sessionIdRef.current = null;
    recordedFileRef.current = null;
    recorderStopPromiseRef.current = null;
    recorderStopResolverRef.current = null;
    chunkQueueRef.current = [];
    recorderChunksRef.current = [];
    pendingFinalizeRef.current = false;
    pendingPersistRef.current = null;
    startedAtRef.current = null;
    setPendingSave(false);
    setSnapshot(null);
    setState('idle');
  }

  const durationCaption = snapshot ? formatDuration(snapshot.duration_seconds) : '0s';
  const meterPercent = Math.round((snapshot?.level ?? 0) * 100);
  const transcriptEntries = useMemo(() => {
    if (!snapshot) {
      return [];
    }
    const items = [...snapshot.entries];
    if (snapshot.partial_entry?.text?.trim()) {
      return [snapshot.partial_entry, ...items];
    }
    return items;
  }, [snapshot]);
  const partialEntryId = snapshot?.partial_entry?.id ?? null;

  return (
    <div className="live-asr-panel">
      <div className="capture-strip">
        <span className="capture-pill">Used {formatDuration(usageAudioSeconds)}</span>
        {maxDurationSeconds ? <span className="capture-pill">Max {formatDuration(maxDurationSeconds)}</span> : null}
        <span className={`capture-pill ${state === 'live' ? 'live' : snapshot?.final_ready ? 'ready' : ''}`}>{liveLabel}</span>
        <span className="capture-pill">{providerLabel}</span>
        <span className="capture-pill">{durationCaption}</span>
        {snapshot?.language ? <Badge tone="neutral">{snapshot.language}</Badge> : null}
      </div>

      <ProgressBar
        label="Level"
        value={snapshot?.level ?? 0}
        max={1}
        caption={
          maxDurationSeconds
            ? `${durationCaption} / ${formatDuration(maxDurationSeconds)}`
            : durationCaption
        }
        tone={meterPercent >= 78 ? 'warning' : meterPercent >= 18 ? 'success' : 'info'}
      />

      <div className="live-asr-actions">
        <Button disabled={!supported || !providerId || state !== 'idle'} onClick={() => void startLive()}>
          Start live
        </Button>
        <Button variant="secondary" disabled={state !== 'live' && state !== 'connecting'} onClick={() => void stopLive()}>
          Stop
        </Button>
        <Button variant="ghost" disabled={state === 'saving' || (!sessionIdRef.current && !pendingSave)} onClick={() => void discardLive()}>
          Clear
        </Button>
        {pendingSave ? (
          <Button variant="secondary" disabled={state === 'saving'} onClick={() => void persistPendingLiveTake()}>
            Save last take
          </Button>
        ) : null}
      </div>

      {!supported ? (
        <Notice title="Live ASR unavailable" description="This browser does not expose the audio features needed for live streaming." tone="warning" />
      ) : null}
      {localError ? <Notice title="Live ASR error" description={localError} tone="danger" /> : null}

      <div className="transcript-surface live-transcript-surface">
        <div className="detail-row">
          <Badge tone={state === 'live' ? 'success' : 'neutral'}>{liveLabel}</Badge>
          <Badge tone="info">{transcriptEntries.length ? `${transcriptEntries.length} saved line${transcriptEntries.length === 1 ? '' : 's'}` : 'Streaming'}</Badge>
        </div>
        <div className="transcript-body live-transcript-log" role="log" aria-live="polite">
          {transcriptEntries.length ? (
            transcriptEntries.map((entry) => (
              <div
                key={`${entry.id}-${entry.recorded_at}`}
                className={`live-transcript-entry ${entry.id === partialEntryId ? 'is-live' : ''}`.trim()}
              >
                <span className="live-transcript-time">[{formatTranscriptTimestamp(entry.recorded_at)}]</span>
                <span className="live-transcript-text">{entry.text}</span>
              </div>
            ))
          ) : (
            <div className="live-transcript-empty">Start live to see timestamped transcript lines.</div>
          )}
        </div>
      </div>
    </div>
  );
}
