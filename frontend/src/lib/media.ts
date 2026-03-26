export function formatDuration(seconds: number | null) {
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

export function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function actionItemCount(value: string | null | undefined) {
  if (!value) {
    return 0;
  }
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean).length;
}
