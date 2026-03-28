'use client';

import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { asrApi, extractApiErrorMessage } from '../lib/api';
import type { AsrTranscript, LiveAsrSessionSnapshot } from '../types';
import { useAuth } from './AuthContext';

type RecordingPreset = {
  mimeType: string;
  extension: string;
};

export type LiveState = 'idle' | 'connecting' | 'live' | 'stopping' | 'saving';

export type LiveAsrDraft = {
  providerId: number | null;
  providerLabel: string;
  language: string;
  title: string;
  usageAudioSeconds: number | null;
  maxDurationSeconds: number | null;
};

type PipelineRefs = {
  audioContext: AudioContext;
  stream: MediaStream;
  mediaRecorder: MediaRecorder;
  worklet: AudioWorkletNode;
  muteGain: GainNode;
};

type LiveAsrContextValue = {
  supported: boolean;
  draft: LiveAsrDraft;
  state: LiveState;
  liveLabel: string;
  snapshot: LiveAsrSessionSnapshot | null;
  pendingSave: boolean;
  error: string;
  notice: string;
  lastSavedTranscript: AsrTranscript | null;
  updateDraft: (partial: Partial<LiveAsrDraft>) => void;
  clearFeedback: () => void;
  clearLastSavedTranscript: () => void;
  startLive: () => Promise<void>;
  stopLive: () => Promise<void>;
  discardLive: () => Promise<void>;
  persistPendingLiveTake: () => Promise<void>;
};

const RECORDING_PRESETS: RecordingPreset[] = [
  { mimeType: 'audio/webm;codecs=opus', extension: 'webm' },
  { mimeType: 'audio/webm', extension: 'webm' },
  { mimeType: 'audio/mp4', extension: 'm4a' },
  { mimeType: 'audio/ogg;codecs=opus', extension: 'ogg' }
];

const DEFAULT_LIVE_BATCH_TARGET_KB = 512;
const INITIAL_DRAFT: LiveAsrDraft = {
  providerId: null,
  providerLabel: 'ASR',
  language: '',
  title: '',
  usageAudioSeconds: null,
  maxDurationSeconds: null
};

const LiveAsrContext = createContext<LiveAsrContextValue | undefined>(undefined);

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

function resolveLiveBatchTargetBytes() {
  const rawValue = process.env.NEXT_PUBLIC_ASR_LIVE_BATCH_TARGET_KB;
  const parsedValue = rawValue ? Number.parseInt(rawValue, 10) : Number.NaN;
  const sizeKb = Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : DEFAULT_LIVE_BATCH_TARGET_KB;
  return sizeKb * 1024;
}

function dequeueChunkBatch(queue: Uint8Array[], maxBytes: number) {
  const selected: Uint8Array[] = [];
  let totalBytes = 0;
  while (queue.length) {
    const nextChunk = queue[0];
    if (selected.length && totalBytes + nextChunk.byteLength > maxBytes) {
      break;
    }
    selected.push(queue.shift()!);
    totalBytes += nextChunk.byteLength;
    if (totalBytes >= maxBytes) {
      break;
    }
  }
  return mergeByteChunks(selected);
}

const LIVE_BATCH_TARGET_BYTES = resolveLiveBatchTargetBytes();

function isLiveAsrSupported() {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    typeof AudioWorkletNode !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

function liveLabelForState(state: LiveState) {
  if (state === 'connecting') {
    return 'Linking';
  }
  if (state === 'live') {
    return 'Live';
  }
  if (state === 'stopping') {
    return 'Closing';
  }
  if (state === 'saving') {
    return 'Saving';
  }
  return 'Idle';
}

export function LiveAsrProvider({ children }: { children: ReactNode }) {
  const { resetIdleTimeout, setSessionHold } = useAuth();
  const [draft, setDraft] = useState<LiveAsrDraft>(INITIAL_DRAFT);
  const [state, setState] = useState<LiveState>('idle');
  const [snapshot, setSnapshot] = useState<LiveAsrSessionSnapshot | null>(null);
  const [pendingSave, setPendingSave] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [lastSavedTranscript, setLastSavedTranscript] = useState<AsrTranscript | null>(null);

  const draftRef = useRef(draft);
  const pipelineRef = useRef<PipelineRefs | null>(null);
  const chunkQueueRef = useRef<Uint8Array[]>([]);
  const recorderChunksRef = useRef<BlobPart[]>([]);
  const recorderStopPromiseRef = useRef<Promise<File | null> | null>(null);
  const recorderStopResolverRef = useRef<((file: File | null) => void) | null>(null);
  const sendingRef = useRef(false);
  const startInFlightRef = useRef(false);
  const pendingFinalizeRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  const recordedFileRef = useRef<File | null>(null);
  const pendingPersistRef = useRef<{ sessionId: string; file: File | null } | null>(null);
  const startedAtRef = useRef<Date | null>(null);
  const preset = useMemo(() => getRecordingPreset(), []);
  const supported = isLiveAsrSupported();
  const liveLabel = liveLabelForState(state);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const clearFeedback = useCallback(() => {
    setError('');
    setNotice('');
  }, []);

  const clearLastSavedTranscript = useCallback(() => {
    setLastSavedTranscript(null);
  }, []);

  const updateDraft = useCallback((partial: Partial<LiveAsrDraft>) => {
    setDraft((current) => {
      const next = { ...current, ...partial };
      return Object.is(current.providerId, next.providerId) &&
        current.providerLabel === next.providerLabel &&
        current.language === next.language &&
        current.title === next.title &&
        Object.is(current.usageAudioSeconds, next.usageAudioSeconds) &&
        Object.is(current.maxDurationSeconds, next.maxDurationSeconds)
        ? current
        : next;
    });
  }, []);

  useEffect(() => {
    const active = state !== 'idle' || pendingSave;
    setSessionHold('live-asr:global', active);
    return () => {
      setSessionHold('live-asr:global', false);
    };
  }, [pendingSave, setSessionHold, state]);

  const clearLiveState = useCallback(() => {
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
  }, []);

  const stopRecorderAndPipeline = useCallback(async () => {
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
  }, []);

  const teardownPipeline = useCallback(async () => {
    await stopRecorderAndPipeline();
    if (recorderStopResolverRef.current) {
      recorderStopResolverRef.current(recordedFileRef.current);
      recorderStopResolverRef.current = null;
    }
  }, [stopRecorderAndPipeline]);

  const discardServerSession = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) {
      return;
    }
    await asrApi.discardLiveSession(sessionId).catch(() => undefined);
  }, []);

  const persistPendingLiveTake = useCallback(async () => {
    const pending = pendingPersistRef.current;
    if (!pending) {
      return;
    }

    try {
      clearFeedback();
      setState('saving');
      const transcript = await asrApi.persistLiveSession({
        session_id: pending.sessionId,
        file: pending.file,
        title: buildLiveTranscriptName(startedAtRef.current, draftRef.current.title)
      });
      pendingPersistRef.current = null;
      setPendingSave(false);
      clearLiveState();
      setLastSavedTranscript(transcript);
      setNotice(transcript.audio_mime_type ? 'Live transcript saved.' : 'Live transcript saved without audio.');
    } catch (nextError) {
      setError(extractApiErrorMessage(nextError));
      setNotice('');
      setState('idle');
    }
  }, [clearFeedback, clearLiveState]);

  const finalizeAndMaybePersist = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) {
      clearLiveState();
      return;
    }

    try {
      clearFeedback();
      const finalSnapshot = await asrApi.finalizeLiveSession(sessionId);
      setSnapshot(finalSnapshot);
      const recordedFile = recordedFileRef.current ?? (recorderStopPromiseRef.current ? await recorderStopPromiseRef.current : null);

      if (!finalSnapshot.preview_text.trim()) {
        await discardServerSession();
        clearLiveState();
        setNotice('Live session stopped.');
        return;
      }

      pendingPersistRef.current = {
        sessionId,
        file: recordedFile
      };
      setPendingSave(true);
      await persistPendingLiveTake();
    } catch (nextError) {
      setError(extractApiErrorMessage(nextError));
      setNotice('');
      setState('idle');
    }
  }, [clearFeedback, clearLiveState, discardServerSession, persistPendingLiveTake]);

  const discardLive = useCallback(async () => {
    pendingFinalizeRef.current = false;
    clearFeedback();
    clearLastSavedTranscript();
    await teardownPipeline();
    await discardServerSession();
    clearLiveState();
  }, [clearFeedback, clearLastSavedTranscript, clearLiveState, discardServerSession, teardownPipeline]);

  const flushChunkQueue = useCallback(async () => {
    if (sendingRef.current || !sessionIdRef.current || !chunkQueueRef.current.length) {
      return;
    }

    const payload = dequeueChunkBatch(chunkQueueRef.current, LIVE_BATCH_TARGET_BYTES);
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
    } catch (nextError) {
      setError(extractApiErrorMessage(nextError));
      setNotice('');
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
  }, [discardLive, finalizeAndMaybePersist]);

  const startLive = useCallback(async () => {
    if (startInFlightRef.current || !supported || !draftRef.current.providerId || state !== 'idle') {
      return;
    }

    startInFlightRef.current = true;
    clearFeedback();
    setLastSavedTranscript(null);
    resetIdleTimeout();
    startedAtRef.current = new Date();
    setSnapshot(null);
    pendingPersistRef.current = null;
    setPendingSave(false);
    recordedFileRef.current = null;
    recorderChunksRef.current = [];
    chunkQueueRef.current = [];
    pendingFinalizeRef.current = false;

    let createdSessionId: string | null = null;
    try {
      setState('connecting');
      const nextSnapshot = await asrApi.createLiveSession({
        provider_id: draftRef.current.providerId,
        language: draftRef.current.language
      });
      createdSessionId = nextSnapshot.session_id;
      sessionIdRef.current = createdSessionId;
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
        (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

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
        const generatedName = buildLiveTranscriptName(startedAtRef.current, draftRef.current.title);
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
    } catch (nextError) {
      if (createdSessionId) {
        await asrApi.discardLiveSession(createdSessionId).catch(() => undefined);
        if (sessionIdRef.current === createdSessionId) {
          sessionIdRef.current = null;
        }
      } else {
        await discardServerSession();
      }
      await teardownPipeline();
      clearLiveState();
      setError(extractApiErrorMessage(nextError));
      setNotice('');
    } finally {
      startInFlightRef.current = false;
    }
  }, [clearFeedback, clearLiveState, discardServerSession, flushChunkQueue, preset, resetIdleTimeout, state, supported, teardownPipeline]);

  const stopLive = useCallback(async () => {
    if (state !== 'live' && state !== 'connecting') {
      return;
    }

    clearFeedback();
    setState('stopping');
    await stopRecorderAndPipeline();

    if (sendingRef.current || chunkQueueRef.current.length) {
      pendingFinalizeRef.current = true;
      return;
    }

    await finalizeAndMaybePersist();
  }, [clearFeedback, finalizeAndMaybePersist, state, stopRecorderAndPipeline]);

  useEffect(() => {
    return () => {
      void stopRecorderAndPipeline();
      void discardServerSession();
    };
  }, [discardServerSession, stopRecorderAndPipeline]);

  const value = useMemo<LiveAsrContextValue>(
    () => ({
      supported,
      draft,
      state,
      liveLabel,
      snapshot,
      pendingSave,
      error,
      notice,
      lastSavedTranscript,
      updateDraft,
      clearFeedback,
      clearLastSavedTranscript,
      startLive,
      stopLive,
      discardLive,
      persistPendingLiveTake
    }),
    [
      clearFeedback,
      clearLastSavedTranscript,
      discardLive,
      draft,
      error,
      lastSavedTranscript,
      liveLabel,
      notice,
      pendingSave,
      persistPendingLiveTake,
      snapshot,
      startLive,
      state,
      stopLive,
      supported,
      updateDraft
    ]
  );

  return <LiveAsrContext.Provider value={value}>{children}</LiveAsrContext.Provider>;
}

export function useLiveAsr() {
  const value = useContext(LiveAsrContext);
  if (!value) {
    throw new Error('useLiveAsr must be used within LiveAsrProvider');
  }
  return value;
}
