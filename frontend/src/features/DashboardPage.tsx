'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, Notice } from '../components/Primitives';
import { TimelineGantt } from '../components/TimelineGantt';
import { dashboardApi, extractApiErrorMessage } from '../lib/api';
import { todayIso } from '../lib/dates';
import type {
  DashboardActivityFeed,
  DashboardNextActionItem,
  DashboardNextActions,
  DashboardStagnation,
  DashboardSummary,
  DashboardTimeline
} from '../types';

type DashboardTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';
type DashboardGlyph = 'now' | 'alert' | 'timeline' | 'recent';

const commandDateFormatter = new Intl.DateTimeFormat('en', {
  weekday: 'short',
  month: 'short',
  day: 'numeric'
});

const recentTimeFormatter = new Intl.DateTimeFormat('en', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
});

const emptySummary: DashboardSummary = {
  active_projects: [],
  today_tasks: [],
  overdue_tasks: [],
  upcoming_milestones: [],
  recent_daily_logs: [],
  recent_product_updates: [],
  project_progress: [],
  task_status_breakdown: [],
  focus_hours_trend: []
};

const emptyTimeline: DashboardTimeline = {
  today: todayIso(),
  window_start: todayIso(),
  window_end: todayIso(),
  projects: []
};

const emptyNextActions: DashboardNextActions = {
  items: []
};

const emptyStagnation: DashboardStagnation = {
  alerts: [],
  project_health: [],
  tracking_notes: []
};

const emptyActivityFeed: DashboardActivityFeed = {
  items: []
};

function toneForUrgency(score: number): DashboardTone {
  if (score >= 95) {
    return 'danger';
  }
  if (score >= 78) {
    return 'warning';
  }
  return 'info';
}

function parseIsoDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function dueCompactLabel(value: string | null | undefined, today: string) {
  if (!value) {
    return '--';
  }

  const todayDate = parseIsoDate(today);
  const targetDate = parseIsoDate(value);
  const diff = Math.round((targetDate.getTime() - todayDate.getTime()) / 86400000);

  if (diff === 0) {
    return 'today';
  }
  if (diff < 0) {
    return `${Math.abs(diff)}d late`;
  }
  return `${diff}d`;
}

function nowReasonLabel(action: DashboardNextActionItem) {
  const reason = action.reason.toLowerCase();

  if (reason.includes('overdue')) {
    return 'Overdue';
  }
  if (reason.includes('due today')) {
    return 'Today';
  }
  if (reason.includes('due in')) {
    return 'Soon';
  }
  if (reason.includes('blocked')) {
    return 'Blocked';
  }
  if (reason.includes('high-priority')) {
    return 'Priority';
  }
  return 'Watch';
}

function recentTimeLabel(value: string) {
  return recentTimeFormatter.format(new Date(value));
}

function Glyph({ name }: { name: DashboardGlyph }) {
  switch (name) {
    case 'alert':
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M8 2.5 14 13H2L8 2.5Z" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round" />
          <path d="M8 6v3.2" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
          <circle cx="8" cy="11.3" r="0.75" fill="currentColor" />
        </svg>
      );
    case 'timeline':
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M3 4.5h10M3 8h10M3 11.5h10" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
          <circle cx="6" cy="4.5" r="1.2" fill="currentColor" />
          <circle cx="10" cy="8" r="1.2" fill="currentColor" />
          <circle cx="7.5" cy="11.5" r="1.2" fill="currentColor" />
        </svg>
      );
    case 'recent':
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M2 9h2.5l1.3-3 2.4 6 1.9-4H14" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'now':
    default:
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M3 8h7.5M8 4.5 12 8l-4 3.5" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
}

function PanelHeader({ icon, title, action }: { icon: DashboardGlyph; title: string; action?: ReactNode }) {
  return (
    <div className="panel-header">
      <div className="panel-title">
        <span className="panel-icon">
          <Glyph name={icon} />
        </span>
        <h2>{title}</h2>
      </div>
      {action ? <div className="section-action">{action}</div> : null}
    </div>
  );
}

export function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary>(emptySummary);
  const [timeline, setTimeline] = useState<DashboardTimeline>(emptyTimeline);
  const [nextActions, setNextActions] = useState<DashboardNextActions>(emptyNextActions);
  const [stagnation, setStagnation] = useState<DashboardStagnation>(emptyStagnation);
  const [activityFeed, setActivityFeed] = useState<DashboardActivityFeed>(emptyActivityFeed);
  const [loading, setLoading] = useState(true);
  const [moduleErrors, setModuleErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;

    async function load() {
      const [summaryResult, nextActionsResult, stagnationResult, activityFeedResult, timelineResult] =
        await Promise.allSettled([
          dashboardApi.summary(),
          dashboardApi.nextActions(),
          dashboardApi.stagnation(),
          dashboardApi.activityFeed(),
          dashboardApi.timeline()
        ]);

      if (!alive) {
        return;
      }

      const nextErrors: Record<string, string> = {};

      if (summaryResult.status === 'fulfilled') {
        setSummary(summaryResult.value);
      } else {
        nextErrors.summary = extractApiErrorMessage(summaryResult.reason);
      }

      if (nextActionsResult.status === 'fulfilled') {
        setNextActions(nextActionsResult.value);
      } else {
        nextErrors.nextActions = extractApiErrorMessage(nextActionsResult.reason);
      }

      if (stagnationResult.status === 'fulfilled') {
        setStagnation(stagnationResult.value);
      } else {
        nextErrors.stagnation = extractApiErrorMessage(stagnationResult.reason);
      }

      if (activityFeedResult.status === 'fulfilled') {
        setActivityFeed(activityFeedResult.value);
      } else {
        nextErrors.activityFeed = extractApiErrorMessage(activityFeedResult.reason);
      }

      if (timelineResult.status === 'fulfilled') {
        setTimeline(timelineResult.value);
      } else {
        nextErrors.timeline = extractApiErrorMessage(timelineResult.reason);
      }

      setModuleErrors(nextErrors);
      setLoading(false);
    }

    void load();
    return () => {
      alive = false;
    };
  }, []);

  const commandDate = useMemo(() => commandDateFormatter.format(new Date()), []);
  const todayToken = useMemo(() => todayIso(), []);
  const nowItems = nextActions.items.slice(0, 3);
  const recentItems = activityFeed.items.slice(0, 8);
  const overdueCount = 'summary' in moduleErrors ? null : summary.overdue_tasks.length;
  const driftCount = 'stagnation' in moduleErrors
    ? null
    : stagnation.alerts.filter((item) => item.category === 'drifting_project').length;
  const riskCount = 'stagnation' in moduleErrors
    ? null
    : stagnation.alerts.filter((item) => item.category === 'milestone_risk' || item.category === 'backlog_pressure').length;
  const highAlertCount = 'stagnation' in moduleErrors
    ? null
    : stagnation.alerts.filter((item) => item.severity === 'high').length;
  const activeAlertCount = 'stagnation' in moduleErrors ? null : stagnation.alerts.length;
  const alertFootnote = highAlertCount === null
    ? 'Partial'
    : highAlertCount > 0
      ? `${highAlertCount} high`
      : 'Clear';

  if (loading) {
    return (
      <div className="page">
        <Card className="section-card">
          <div className="spinner" />
          <p className="muted">Loading dashboard...</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="page dashboard-command-page dashboard-command-page-compact">
      <div className="dashboard-ops-bar">
        <div className="dashboard-ops-copy">
          <h1>Dashboard</h1>
          <span>{commandDate}</span>
        </div>

        <div className="dashboard-ops-actions">
          <Link className="btn btn-primary" href="/tasks">+ Task</Link>
          <Link className="btn btn-ghost" href="/daily-logs">+ Log</Link>
        </div>
      </div>

      <div className="dashboard-compact-grid">
        <Card className="section-card command-panel command-panel-now">
          <PanelHeader icon="now" title="Now" />
          {'nextActions' in moduleErrors ? (
            <Notice title="Now unavailable" description={moduleErrors.nextActions} tone="warning" />
          ) : nowItems.length ? (
            <div className="command-task-list">
              {nowItems.map((action) => {
                const tone = toneForUrgency(action.urgency_score);
                return (
                  <Link
                    key={`${action.entity_type}-${action.entity_id ?? action.action_title}`}
                    href={action.route}
                    className="command-task-row"
                  >
                    <div className="command-task-main">
                      <span className={`signal-dot signal-dot-${tone}`} aria-hidden="true" />
                      <span className="command-task-copy">
                        <strong className="command-task-title">{action.action_title}</strong>
                        {action.project_name ? <span className="command-task-project">{action.project_name}</span> : null}
                      </span>
                    </div>
                    <div className="command-task-meta">
                      <span className={`command-chip command-chip-${tone}`}>{nowReasonLabel(action)}</span>
                      {action.due_date ? <span className="command-chip command-chip-muted">{dueCompactLabel(action.due_date, todayToken)}</span> : null}
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="command-empty">No priority items.</div>
          )}
        </Card>

        <Card className="section-card command-panel command-panel-alerts">
          <PanelHeader icon="alert" title="Alerts" />
          <div className="alert-counter-grid" role="list" aria-label="Alert counts">
            <div className="alert-counter alert-counter-danger" role="listitem">
              <strong>{overdueCount ?? '--'}</strong>
              <span>OD</span>
            </div>
            <div className="alert-counter alert-counter-warning" role="listitem">
              <strong>{driftCount ?? '--'}</strong>
              <span>Drift</span>
            </div>
            <div className="alert-counter alert-counter-info" role="listitem">
              <strong>{riskCount ?? '--'}</strong>
              <span>Risk</span>
            </div>
          </div>
          <div className="alert-footnote">
            <span>{alertFootnote}</span>
            <span>{activeAlertCount ?? '--'} active</span>
          </div>
        </Card>

        <Card className="section-card command-panel command-panel-timeline">
          <PanelHeader icon="timeline" title="Timeline" action={<Link className="btn btn-ghost" href="/projects">Projects</Link>} />
          {'timeline' in moduleErrors ? (
            <Notice title="Timeline unavailable" description={moduleErrors.timeline} tone="warning" />
          ) : (
            <TimelineGantt timeline={timeline} />
          )}
        </Card>

        <Card className="section-card command-panel command-panel-recent">
          <PanelHeader icon="recent" title="Recent" />
          {'activityFeed' in moduleErrors ? (
            <Notice title="Recent unavailable" description={moduleErrors.activityFeed} tone="warning" />
          ) : recentItems.length ? (
            <div className="recent-feed-list">
              {recentItems.map((item) => (
                <Link key={item.id} href={item.route} className="recent-feed-row">
                  <span className="recent-feed-time">{recentTimeLabel(item.changed_at)}</span>
                  <span className="recent-feed-main">
                    <span className={`signal-dot signal-dot-${item.tone as DashboardTone}`} aria-hidden="true" />
                    <strong className="recent-feed-title">{item.title}</strong>
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="command-empty">No recent activity.</div>
          )}
        </Card>
      </div>
    </div>
  );
}
