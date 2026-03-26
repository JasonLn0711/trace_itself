import type { DailyLog, Milestone, PrimitivePriority, PrimitiveStatus, Task } from '../types';
import { daysUntil } from './dates';

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const priorityRank: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3
};

const taskStatusRank: Record<string, number> = {
  blocked: 0,
  in_progress: 1,
  todo: 2,
  done: 3
};

const milestoneStatusRank: Record<string, number> = {
  active: 0,
  planned: 1,
  completed: 2
};

export function formatEnumLabel(value: string | null | undefined, fallback = 'Not set') {
  if (!value) {
    return fallback;
  }
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function toneForPriority(priority: PrimitivePriority | null | undefined): Tone {
  switch (priority) {
    case 'critical':
      return 'danger';
    case 'high':
      return 'warning';
    case 'medium':
      return 'info';
    case 'low':
    default:
      return 'neutral';
  }
}

export function toneForProjectStatus(status: PrimitiveStatus | null | undefined): Tone {
  switch (status) {
    case 'completed':
      return 'success';
    case 'paused':
      return 'warning';
    case 'archived':
      return 'neutral';
    case 'planned':
      return 'info';
    case 'active':
    default:
      return 'info';
  }
}

export function toneForTaskStatus(status: PrimitiveStatus | null | undefined): Exclude<Tone, 'neutral'> {
  switch (status) {
    case 'done':
      return 'success';
    case 'blocked':
      return 'danger';
    case 'in_progress':
      return 'warning';
    case 'todo':
    default:
      return 'info';
  }
}

export function toneForMilestoneStatus(status: PrimitiveStatus | null | undefined): Exclude<Tone, 'neutral'> {
  switch (status) {
    case 'completed':
      return 'success';
    case 'active':
      return 'info';
    case 'planned':
    default:
      return 'warning';
  }
}

export type DueState = 'none' | 'overdue' | 'today' | 'soon' | 'scheduled';

export function getDueState(value: string | null | undefined): DueState {
  const diff = daysUntil(value);
  if (diff === null) {
    return 'none';
  }
  if (diff < 0) {
    return 'overdue';
  }
  if (diff === 0) {
    return 'today';
  }
  if (diff <= 7) {
    return 'soon';
  }
  return 'scheduled';
}

export function toneForDueState(value: string | null | undefined): Tone {
  switch (getDueState(value)) {
    case 'overdue':
      return 'danger';
    case 'today':
      return 'warning';
    case 'soon':
      return 'info';
    case 'scheduled':
    case 'none':
    default:
      return 'neutral';
  }
}

export function shortDueLabel(value: string | null | undefined) {
  switch (getDueState(value)) {
    case 'overdue':
      return 'Overdue';
    case 'today':
      return 'Due today';
    case 'soon':
      return 'Due soon';
    case 'scheduled':
      return 'Scheduled';
    case 'none':
    default:
      return 'No due date';
  }
}

function dueSortRank(value: string | null | undefined) {
  const diff = daysUntil(value);
  if (diff === null) {
    return 9999;
  }
  if (diff < 0) {
    return diff;
  }
  return diff;
}

export function sortTasksForAttention(tasks: Task[]) {
  return [...tasks].sort((left, right) => {
    const statusDelta = (taskStatusRank[left.status] ?? 99) - (taskStatusRank[right.status] ?? 99);
    if (statusDelta !== 0) {
      return statusDelta;
    }

    const dueDelta = dueSortRank(left.due_date) - dueSortRank(right.due_date);
    if (dueDelta !== 0) {
      return dueDelta;
    }

    const priorityDelta = (priorityRank[left.priority] ?? 99) - (priorityRank[right.priority] ?? 99);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return left.title.localeCompare(right.title);
  });
}

export function sortMilestonesForAttention(milestones: Milestone[]) {
  return [...milestones].sort((left, right) => {
    const statusDelta = (milestoneStatusRank[left.status] ?? 99) - (milestoneStatusRank[right.status] ?? 99);
    if (statusDelta !== 0) {
      return statusDelta;
    }

    const dueDelta = dueSortRank(left.due_date) - dueSortRank(right.due_date);
    if (dueDelta !== 0) {
      return dueDelta;
    }

    return left.title.localeCompare(right.title);
  });
}

export function summarizeFocus(logs: DailyLog[]) {
  if (!logs.length) {
    return {
      totalHours: 0,
      averageHours: 0
    };
  }

  const totalHours = logs.reduce((sum, log) => sum + (log.total_focus_hours ?? 0), 0);
  return {
    totalHours,
    averageHours: totalHours / logs.length
  };
}
