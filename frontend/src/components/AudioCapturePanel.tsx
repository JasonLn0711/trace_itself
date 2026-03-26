'use client';

import { ChangeEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button, Notice } from './Primitives';
import { formatBytes, formatDuration } from '../lib/media';
import { useAuth } from '../state/AuthContext';

type RecordingPreset = {
  mimeType: string;
  extension: string;
  label: string;
};

const RECORDING_PRESETS: RecordingPreset[] = [
  { mimeType: 'audio/webm;codecs=opus', extension: 'webm', label: 'webm / opus' },
  { mimeType: 'audio/webm', extension: 'webm', label: 'webm' },
  { mimeType: 'audio/mp4', extension: 'm4a', label: 'm4a' },
  { mimeType: 'audio/ogg;codecs=opus', extension: 'ogg', label: 'ogg / opus' }
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

function buildRecordedFile(blob: Blob, filenameBase: string, preset: RecordingPreset | null) {
  const extension = preset?.extension ?? 'webm';
  const mimeType = blob.type || preset?.mimeType || 'audio/webm';
  return new File([blob], `${filenameBase}-${Date.now()}.${extension}`, {
    type: mimeType,
    lastModified: Date.now()
  });
}

export function AudioCapturePanel({
  file,
  onChange,
  filenameBase,
  disabled = false
}: {
  file: File | null;
  onChange: (file: File | null) => void;
  filenameBase: string;
  disabled?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const { setSessionHold } = useAuth();
  const sessionHoldKey = useId();

  const [error, setError] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [previewUrl, setPreviewUrl] = useState('');

  const preset = useMemo(() => getRecordingPreset(), []);
  const canRecord =
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia;

  useEffect(() => {
    if (!file) {
      setPreviewUrl('');
      return undefined;
    }
    const nextUrl = URL.createObjectURL(file);
    setPreviewUrl(nextUrl);
    return () => {
      URL.revokeObjectURL(nextUrl);
    };
  }, [file]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    setSessionHold(`audio-capture:${sessionHoldKey}`, isRecording);
    return () => {
      setSessionHold(`audio-capture:${sessionHoldKey}`, false);
    };
  }, [isRecording, sessionHoldKey, setSessionHold]);

  function resetClock() {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setElapsedSeconds(0);
  }

  async function startRecording() {
    if (!canRecord || disabled) {
      return;
    }

    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = preset?.mimeType
        ? new MediaRecorder(stream, {
            mimeType: preset.mimeType,
            audioBitsPerSecond: 128000
          })
        : new MediaRecorder(stream);

      recorderRef.current = recorder;

      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      });

      recorder.addEventListener('stop', () => {
        const blob = new Blob(chunksRef.current, {
          type: preset?.mimeType || recorder.mimeType || 'audio/webm'
        });
        onChange(buildRecordedFile(blob, filenameBase, preset));
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        resetClock();
        setIsRecording(false);
      });

      recorder.start();
      setIsRecording(true);
      setElapsedSeconds(0);
      timerRef.current = window.setInterval(() => {
        setElapsedSeconds((current) => current + 1);
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Microphone access failed.');
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      resetClock();
      setIsRecording(false);
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
  }

  function handleFilePick(event: ChangeEvent<HTMLInputElement>) {
    onChange(event.target.files?.[0] ?? null);
    setError('');
  }

  function clearSelection() {
    onChange(null);
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  return (
    <div className="audio-capture">
      <div className="audio-capture-actions">
        <Button variant="secondary" disabled={disabled || isRecording} onClick={() => fileInputRef.current?.click()}>
          Upload
        </Button>
        <Button
          variant={isRecording ? 'danger' : 'primary'}
          disabled={disabled || (!isRecording && !canRecord)}
          onClick={() => (isRecording ? stopRecording() : void startRecording())}
        >
          {isRecording ? 'Stop' : 'Record'}
        </Button>
        {file ? (
          <Button variant="ghost" disabled={disabled || isRecording} onClick={clearSelection}>
            Clear
          </Button>
        ) : null}
        <input
          ref={fileInputRef}
          className="sr-only"
          type="file"
          accept=".aac,.flac,.m4a,.mp3,.mp4,.ogg,.wav,.webm,audio/*"
          onChange={handleFilePick}
        />
      </div>

      <div className="detail-row">
        <span className={`capture-pill ${isRecording ? 'live' : file ? 'ready' : ''}`}>
          {isRecording ? `REC ${formatDuration(elapsedSeconds)}` : file ? 'Ready' : 'Idle'}
        </span>
        <span className="capture-pill">{preset?.label ?? 'browser audio'}</span>
        {file ? <span className="capture-pill">{formatBytes(file.size)}</span> : null}
      </div>

      {error ? <Notice title="Audio error" description={error} tone="danger" /> : null}

      {file ? (
        <div className="surface-soft audio-capture-preview">
          <div className="audio-capture-copy">
            <strong className="line-clamp-1">{file.name}</strong>
            <div className="list-row-copy">
              {file.type || 'audio'} {file.lastModified ? `· ${new Date(file.lastModified).toLocaleString()}` : ''}
            </div>
          </div>
          {previewUrl ? <audio className="audio-player" controls preload="none" src={previewUrl} /> : null}
        </div>
      ) : (
        <div className="surface-soft">
          <div className="list-row-copy">Upload audio or record in-browser.</div>
        </div>
      )}
    </div>
  );
}
