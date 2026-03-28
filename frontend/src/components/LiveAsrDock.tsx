'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Badge, Button, Notice } from './Primitives';
import { formatDuration } from '../lib/media';
import { useLiveAsr } from '../state/LiveAsrContext';

function excerpt(value: string, max = 140) {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (!compact) {
    return '';
  }
  if (compact.length <= max) {
    return compact;
  }
  return `${compact.slice(0, max - 1).trimEnd()}…`;
}

export function LiveAsrDock() {
  const pathname = usePathname() ?? '';
  const {
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
    state,
    stopLive
  } = useLiveAsr();

  const active = state !== 'idle';
  const visible = !pathname.startsWith('/meetings') && (active || pendingSave || !!error || !!notice || !!lastSavedTranscript);
  if (!visible) {
    return null;
  }

  const preview = excerpt(snapshot?.partial_entry?.text || snapshot?.preview_text || snapshot?.entries[0]?.text || notice || error);
  const openHref = lastSavedTranscript ? `/meetings?mode=transcript&transcript=${lastSavedTranscript.id}` : '/meetings?mode=transcript';

  return (
    <div className="live-asr-dock">
      <section className="card live-asr-dock-card">
        <div className="live-asr-dock-head">
          <div className="live-asr-dock-copy">
            <strong>Live audio stays on</strong>
            <span>{active ? 'You can keep browsing while recording continues.' : 'The live session is waiting for your next step.'}</span>
          </div>
          <div className="live-asr-dock-meta">
            <Badge tone={state === 'live' ? 'success' : pendingSave ? 'warning' : error ? 'danger' : 'neutral'}>{liveLabel}</Badge>
            <span className="capture-pill">{draft.providerLabel}</span>
            <span className="capture-pill">{formatDuration(snapshot?.duration_seconds ?? null)}</span>
          </div>
        </div>

        {snapshot?.language ? (
          <div className="live-asr-dock-tags">
            <Badge tone="info">{snapshot.language}</Badge>
          </div>
        ) : null}

        {preview ? <div className="live-asr-dock-preview">{preview}</div> : null}
        {notice ? <Notice title={notice} tone="success" /> : null}
        {error ? <Notice title="Live ASR error" description={error} tone="danger" /> : null}

        <div className="live-asr-dock-actions">
          <Link href={openHref} className="btn btn-secondary">
            Open audio
          </Link>
          {active ? (
            <Button variant="danger" onClick={() => void stopLive()}>
              Stop
            </Button>
          ) : null}
          {pendingSave ? (
            <Button variant="secondary" onClick={() => void persistPendingLiveTake()}>
              Save last take
            </Button>
          ) : null}
          {pendingSave || error ? (
            <Button variant="ghost" onClick={() => void discardLive()}>
              Reset
            </Button>
          ) : null}
          {!active && !pendingSave && (notice || lastSavedTranscript || error) ? (
            <Button
              variant="ghost"
              onClick={() => {
                clearFeedback();
                clearLastSavedTranscript();
              }}
            >
              Dismiss
            </Button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
