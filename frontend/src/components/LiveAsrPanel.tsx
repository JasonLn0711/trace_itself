'use client';

import { useMemo } from 'react';
import { Badge, Button, Notice, ProgressBar } from './Primitives';
import { formatDuration } from '../lib/media';
import { useLiveAsr } from '../state/LiveAsrContext';

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

export function LiveAsrPanel() {
  const {
    discardLive,
    draft,
    error,
    liveLabel,
    notice,
    pendingSave,
    persistPendingLiveTake,
    snapshot,
    startLive,
    state,
    stopLive,
    supported
  } = useLiveAsr();

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
        <span className="capture-pill">Used {formatDuration(draft.usageAudioSeconds)}</span>
        {draft.maxDurationSeconds ? <span className="capture-pill">Max {formatDuration(draft.maxDurationSeconds)}</span> : null}
        <span className={`capture-pill ${state === 'live' ? 'live' : snapshot?.final_ready ? 'ready' : ''}`}>{liveLabel}</span>
        <span className="capture-pill">Live {draft.providerLabel}</span>
        <span className="capture-pill">Final {draft.finalProviderLabel}</span>
        <span className="capture-pill">{durationCaption}</span>
        {snapshot?.language ? <Badge tone="neutral">{snapshot.language}</Badge> : null}
        {(state === 'live' || state === 'connecting') ? <span className="capture-pill ready">Browse other pages safely</span> : null}
      </div>

      <ProgressBar
        label="Level"
        value={snapshot?.level ?? 0}
        max={1}
        caption={
          draft.maxDurationSeconds
            ? `${durationCaption} / ${formatDuration(draft.maxDurationSeconds)}`
            : durationCaption
        }
        tone={meterPercent >= 78 ? 'warning' : meterPercent >= 18 ? 'success' : 'info'}
      />

      <div className="live-asr-actions">
        <Button disabled={!supported || !draft.providerId || state !== 'idle'} onClick={() => void startLive()}>
          Start live
        </Button>
        <Button
          variant={state === 'live' || state === 'connecting' || state === 'stopping' ? 'danger' : 'secondary'}
          disabled={state !== 'live' && state !== 'connecting'}
          onClick={() => void stopLive()}
        >
          Stop
        </Button>
        <Button variant="ghost" disabled={state === 'saving' && !pendingSave} onClick={() => void discardLive()}>
          Reset
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
      {notice ? <Notice title={notice} tone="success" /> : null}
      {error ? <Notice title="Live ASR error" description={error} tone="danger" /> : null}

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
