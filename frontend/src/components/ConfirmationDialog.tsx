'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from './Primitives';

type ConfirmationTone = 'danger' | 'warning' | 'neutral';

type ConfirmationOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmationTone;
};

type ConfirmationState = ConfirmationOptions & {
  open: boolean;
};

const defaultState: ConfirmationState = {
  open: false,
  title: '',
  description: '',
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
  tone: 'danger'
};

export function useConfirmationDialog() {
  const [state, setState] = useState<ConfirmationState>(defaultState);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  function closeWith(result: boolean) {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setState(defaultState);
  }

  useEffect(() => {
    return () => {
      resolverRef.current?.(false);
      resolverRef.current = null;
    };
  }, []);

  async function confirm(options: ConfirmationOptions) {
    if (resolverRef.current) {
      resolverRef.current(false);
    }

    setState({
      open: true,
      title: options.title,
      description: options.description ?? '',
      confirmLabel: options.confirmLabel ?? 'Delete',
      cancelLabel: options.cancelLabel ?? 'Cancel',
      tone: options.tone ?? 'danger'
    });

    return await new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }

  const dialog = state.open ? (
    <ConfirmationDialog
      title={state.title}
      description={state.description}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      tone={state.tone}
      onCancel={() => closeWith(false)}
      onConfirm={() => closeWith(true)}
    />
  ) : null;

  return { confirm, confirmationDialog: dialog };
}

function ConfirmationDialog({
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone,
  onCancel,
  onConfirm
}: ConfirmationOptions & {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    cancelButtonRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <div className="confirm-overlay" role="presentation" onClick={onCancel}>
      <div
        className={`confirm-dialog confirm-dialog-${tone}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="confirm-dialog-copy">
          <h2 id="confirm-dialog-title">{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        <div className="confirm-dialog-actions">
          <button ref={cancelButtonRef} className="btn btn-ghost" type="button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <Button variant={tone === 'danger' ? 'danger' : 'secondary'} type="button" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
