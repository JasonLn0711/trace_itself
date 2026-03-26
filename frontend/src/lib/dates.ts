export function formatDate(value: string | null | undefined) {
  if (!value) {
    return 'Unscheduled';
  }
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(`${value}T00:00:00`));
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return 'Unknown';
  }
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value));
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function daysUntil(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${value}T00:00:00`);
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  return diff;
}

export function relativeDueLabel(value: string | null | undefined) {
  const diff = daysUntil(value);
  if (diff === null) {
    return 'No due date';
  }
  if (diff < 0) {
    return `Overdue by ${Math.abs(diff)} day${Math.abs(diff) === 1 ? '' : 's'}`;
  }
  if (diff === 0) {
    return 'Due today';
  }
  return `Due in ${diff} day${diff === 1 ? '' : 's'}`;
}

export function clampPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, value));
}

