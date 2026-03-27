'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge, Card, EmptyState, Notice, Sparkline } from '../components/Primitives';
import { TimelineGantt } from '../components/TimelineGantt';
import { dashboardApi, extractApiErrorMessage } from '../lib/api';
import { formatDateTime, todayIso } from '../lib/dates';
import { formatEnumLabel } from '../lib/presentation';
import { useAuth } from '../state/AuthContext';
import type {
  DashboardActivityFeed,
  DashboardActivityFeedItem,
  DashboardNextActions,
  DashboardProjectHealthItem,
  DashboardRealityGap,
  DashboardStagnation,
  DashboardSummary,
  DashboardTimeline,
  DashboardWeeklyReview
} from '../types';

type DashboardTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';
type DashboardGlyph = 'now' | 'alert' | 'timeline' | 'flow' | 'radar' | 'gap' | 'week' | 'overdue' | 'today' | 'tracks' | 'rate';

const commandDateFormatter = new Intl.DateTimeFormat('en', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric'
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

const emptyRealityGap: DashboardRealityGap = {
  planned_tasks_this_week: 0,
  completed_tasks_this_week: 0,
  weekly_completion_rate: 0,
  estimated_hours_this_week: 0,
  actual_hours_this_week: 0,
  overdue_ratio: 0,
  delay_rate: 0,
  trend: []
};

const emptyWeeklyReview: DashboardWeeklyReview = {
  completed_tasks_this_week: 0,
  overdue_tasks: 0,
  most_active_project: null,
  most_active_project_id: null,
  inactive_projects: [],
  total_focus_hours: 0,
  focus_days_logged: 0,
  biggest_progress: null,
  biggest_blocker: null,
  summary_text: 'No weekly execution data yet.',
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

function toneForSeverity(severity: string): DashboardTone {
  switch (severity) {
    case 'high':
      return 'danger';
    case 'medium':
      return 'warning';
    case 'low':
      return 'info';
    default:
      return 'neutral';
  }
}

function eventLabel(eventType: string) {
  switch (eventType) {
    case 'task_completed':
      return 'Done';
    case 'task_blocked':
      return 'Block';
    case 'task_in_progress':
      return 'Move';
    case 'daily_log':
      return 'Log';
    case 'milestone_completed':
      return 'MS';
    case 'milestone_progress':
      return 'MS';
    case 'project_updated':
      return 'Proj';
    default:
      return formatEnumLabel(eventType);
  }
}

function idleLabel(daysSinceActivity: number | null) {
  if (daysSinceActivity === null || daysSinceActivity === undefined) {
    return '--';
  }
  if (daysSinceActivity === 0) {
    return '0d';
  }
  return `${daysSinceActivity}d`;
}

function hoursDeltaLabel(realityGap: DashboardRealityGap) {
  const delta = realityGap.actual_hours_this_week - realityGap.estimated_hours_this_week;
  if (delta === 0) {
    return '0h';
  }
  return delta > 0 ? `+${delta.toFixed(1)}h` : `-${Math.abs(delta).toFixed(1)}h`;
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

function compactText(value: string | null | undefined, fallback: string) {
  if (!value || !value.trim()) {
    return fallback;
  }
  return value.trim();
}

function compactSentence(value: string | null | undefined, fallback: string) {
  const source = compactText(value, fallback);
  const firstSentence = source.split(/[.!?]\s/)[0]?.trim() || source;
  return firstSentence.endsWith('.') ? firstSentence : firstSentence;
}

function DashboardMetric({
  label,
  value,
  caption,
  tone = 'neutral'
}: {
  label: ReactNode;
  value: string | number;
  caption?: string;
  tone?: DashboardTone;
}) {
  return (
    <div className={`dashboard-metric dashboard-metric-${tone}`}>
      <span className="dashboard-metric-label">{label}</span>
      <strong>{value}</strong>
      {caption ? <span className="dashboard-metric-caption">{caption}</span> : null}
    </div>
  );
}

function projectProgressTone(project: DashboardProjectHealthItem): DashboardTone {
  if (project.overdue_tasks > 0) {
    return 'danger';
  }
  if (project.health === 'watch') {
    return 'warning';
  }
  return project.completion_percent >= 75 ? 'success' : 'info';
}

function Glyph({ name }: { name: DashboardGlyph }) {
  switch (name) {
    case 'alert':
    case 'overdue':
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
    case 'flow':
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M2 9h2.5l1.3-3 2.4 6 1.9-4H14" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'radar':
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <circle cx="8" cy="8" r="5.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="8" cy="8" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path d="M8 8 12.2 5.8" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
          <circle cx="8" cy="8" r="1" fill="currentColor" />
        </svg>
      );
    case 'gap':
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M3 12V7M8 12V4M13 12V9" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
          <path d="M2.5 12.5h11" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        </svg>
      );
    case 'week':
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <rect x="2.2" y="3" width="11.6" height="10.2" rx="2" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path d="M2.8 6.4h10.4M5.7 2.4v2.2M10.3 2.4v2.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case 'today':
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <circle cx="8" cy="8" r="5.4" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path d="M8 5.2v3.1l2 1.3" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'tracks':
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <rect x="2.2" y="3" width="4.2" height="4.2" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <rect x="9.6" y="3" width="4.2" height="4.2" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <rect x="5.9" y="8.8" width="4.2" height="4.2" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    case 'rate':
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M2.5 11.2 6 7.7l2.3 2.3 4-4" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10.4 6h2v2" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
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

function MetricLabel({ icon, label }: { icon: DashboardGlyph; label: string }) {
  return (
    <span className="metric-label-with-icon">
      <span className="metric-label-icon">
        <Glyph name={icon} />
      </span>
      <span>{label}</span>
    </span>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary>(emptySummary);
  const [timeline, setTimeline] = useState<DashboardTimeline>(emptyTimeline);
  const [nextActions, setNextActions] = useState<DashboardNextActions>(emptyNextActions);
  const [stagnation, setStagnation] = useState<DashboardStagnation>(emptyStagnation);
  const [realityGap, setRealityGap] = useState<DashboardRealityGap>(emptyRealityGap);
  const [weeklyReview, setWeeklyReview] = useState<DashboardWeeklyReview>(emptyWeeklyReview);
  const [activityFeed, setActivityFeed] = useState<DashboardActivityFeed>(emptyActivityFeed);
  const [loading, setLoading] = useState(true);
  const [moduleErrors, setModuleErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;

    async function load() {
      const [
        summaryResult,
        nextActionsResult,
        stagnationResult,
        realityGapResult,
        weeklyReviewResult,
        activityFeedResult,
        timelineResult
      ] = await Promise.allSettled([
        dashboardApi.summary(),
        dashboardApi.nextActions(),
        dashboardApi.stagnation(),
        dashboardApi.realityGap(),
        dashboardApi.weeklyReview(),
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

      if (realityGapResult.status === 'fulfilled') {
        setRealityGap(realityGapResult.value);
      } else {
        nextErrors.realityGap = extractApiErrorMessage(realityGapResult.reason);
      }

      if (weeklyReviewResult.status === 'fulfilled') {
        setWeeklyReview(weeklyReviewResult.value);
      } else {
        nextErrors.weeklyReview = extractApiErrorMessage(weeklyReviewResult.reason);
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

  const latestLog = useMemo(
    () => [...summary.recent_daily_logs].sort((left, right) => right.log_date.localeCompare(left.log_date))[0] ?? null,
    [summary.recent_daily_logs]
  );
  const leadAction = nextActions.items[0] ?? null;
  const queuedActions = nextActions.items.slice(1, 4);
  const alertCards = stagnation.alerts.slice(0, 5);
  const projectHealth = stagnation.project_health.slice(0, 6);
  const feedItems = activityFeed.items.slice(0, 8);
  const trendTail = realityGap.trend.slice(-4);
  const commandDate = useMemo(() => commandDateFormatter.format(new Date()), []);
  const todayToken = useMemo(() => todayIso(), []);
  const activeTrackCount = projectHealth.length || summary.active_projects.length;
  const errorLabels = Object.keys(moduleErrors);
  const nextStepText = latestLog?.next_step || latestLog?.summary || '';
  const reviewRows = [
    { label: 'Win', value: compactSentence(weeklyReview.biggest_progress, 'No clear win') },
    { label: 'Block', value: compactSentence(weeklyReview.biggest_blocker, 'No blocker logged') },
    {
      label: 'Idle',
      value: weeklyReview.inactive_projects.length ? weeklyReview.inactive_projects.slice(0, 3).join(', ') : 'Clear'
    }
  ];
  const trendPercentValues = trendTail.map((point) => (
    point.planned_tasks > 0 ? Math.round((point.completed_tasks / point.planned_tasks) * 100) : point.completed_tasks > 0 ? 100 : 0
  ));

  if (loading) {
    return (
      <div className="page">
        <Card className="section-card">
          <div className="spinner" />
          <p className="muted">Loading mission control...</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="page dashboard-command-page">
      <section className="mission-header card">
        <div className="mission-header-copy">
          <div className="mission-brand-line">
            <div className="mission-kicker">trace_itself</div>
            <Badge tone="warning">beta</Badge>
          </div>
          <h1>Mission Control</h1>
        </div>

        <div className="mission-header-side">
          <div className="mission-status-row">
            <div className="mission-date">{commandDate}</div>
            <div className="mission-user">
              <Badge tone={user?.role === 'admin' ? 'warning' : 'info'}>{user?.display_name ?? 'Operator'}</Badge>
              <Badge tone="neutral">{user?.role ?? 'member'}</Badge>
            </div>
          </div>

          <div className="mission-action-row">
            <Link className="btn btn-primary" href="/tasks">+ Task</Link>
            <Link className="btn btn-secondary" href="/daily-logs">+ Log</Link>
            <Link className="btn btn-ghost" href="/projects">Tracks</Link>
          </div>

          <div className="dashboard-metric-grid dashboard-metric-grid-top">
            <DashboardMetric
              label={<MetricLabel icon="overdue" label="OD" />}
              value={summary.overdue_tasks.length}
              tone={summary.overdue_tasks.length ? 'danger' : 'success'}
            />
            <DashboardMetric
              label={<MetricLabel icon="today" label="Today" />}
              value={summary.today_tasks.length}
              tone={summary.today_tasks.length ? 'warning' : 'success'}
            />
            <DashboardMetric
              label={<MetricLabel icon="tracks" label="Tracks" />}
              value={activeTrackCount}
              tone="info"
            />
            <DashboardMetric
              label={<MetricLabel icon="rate" label="Rate" />}
              value={`${realityGap.weekly_completion_rate}%`}
              tone={realityGap.weekly_completion_rate >= 70 ? 'success' : 'warning'}
            />
          </div>
        </div>
      </section>

      {errorLabels.length ? (
        <Notice
          title="Partial data"
          description={`Unavailable panels: ${errorLabels.join(', ')}`}
          tone="warning"
        />
      ) : null}

      <div className="mission-grid">
        <div className="mission-column">
          <Card className="section-card mission-panel">
            <PanelHeader icon="now" title="Now" />
            {leadAction ? (
              <div className="hero-action-card hero-action-card-compact">
                <div className="hero-action-head">
                  <div className="hero-action-title-row">
                    <span className={`signal-dot signal-dot-${toneForUrgency(leadAction.urgency_score)}`} aria-hidden="true" />
                    <h3>{leadAction.action_title}</h3>
                  </div>
                  <Badge tone={toneForUrgency(leadAction.urgency_score)}>{leadAction.urgency_score}</Badge>
                </div>
                <div className="hero-action-meta hero-action-meta-compact">
                  {leadAction.project_name ? <Badge tone="neutral">{leadAction.project_name}</Badge> : null}
                  {leadAction.status ? <Badge tone="neutral">{formatEnumLabel(leadAction.status)}</Badge> : null}
                  {leadAction.due_date ? <Badge tone={toneForUrgency(leadAction.urgency_score)}>{dueCompactLabel(leadAction.due_date, todayToken)}</Badge> : null}
                </div>
                <div className="hero-action-reason line-clamp-1">{leadAction.reason}</div>
                <Link className="btn btn-primary hero-action-open" href={leadAction.route}>Open</Link>
              </div>
            ) : (
              <EmptyState title="Clear" description="No urgent item." />
            )}

            {queuedActions.length ? (
              <div className="compact-list compact-list-dense">
                {queuedActions.map((action) => (
                  <Link key={`${action.entity_type}-${action.entity_id ?? action.action_title}`} href={action.route} className="compact-list-item">
                    <div className="compact-list-copy">
                      <strong>{action.action_title}</strong>
                      <span>{action.project_name || formatEnumLabel(action.entity_type)}</span>
                    </div>
                    <div className="compact-list-side">
                      {action.due_date ? <span className="compact-pill">{dueCompactLabel(action.due_date, todayToken)}</span> : null}
                      <Badge tone={toneForUrgency(action.urgency_score)}>{action.urgency_score}</Badge>
                    </div>
                  </Link>
                ))}
              </div>
            ) : null}

            {nextStepText ? (
              <div className="mission-inline-strip">
                <span>Next</span>
                <strong className="line-clamp-1">{nextStepText}</strong>
              </div>
            ) : null}
          </Card>

          <Card className="section-card mission-panel">
            <PanelHeader icon="alert" title="Alerts" />
            {alertCards.length ? (
              <div className="signal-table">
                {alertCards.map((alert) => (
                  <Link key={alert.id} href={alert.route} className="signal-row">
                    <span className={`signal-dot signal-dot-${toneForSeverity(alert.severity)}`} aria-hidden="true" />
                    <div className="signal-main">
                      <strong>{alert.title}</strong>
                      <span>{alert.project_name || formatEnumLabel(alert.category)}</span>
                    </div>
                    <span className="signal-side">
                      {alert.due_date ? dueCompactLabel(String(alert.due_date), todayToken) : alert.days_since_activity ? `${alert.days_since_activity}d` : formatEnumLabel(alert.category)}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState title="Clear" description="No active alert." />
            )}
          </Card>
        </div>

        <div className="mission-column mission-column-center">
          <Card className="section-card mission-panel">
            <PanelHeader icon="timeline" title="Timeline" action={<Link className="btn btn-ghost" href="/projects">View</Link>} />
            {'timeline' in moduleErrors ? (
              <Notice title="Timeline unavailable" description={moduleErrors.timeline} tone="warning" />
            ) : (
              <TimelineGantt timeline={timeline} />
            )}
          </Card>

          <Card className="section-card mission-panel">
            <PanelHeader icon="flow" title="Flow" />
            {feedItems.length ? (
              <div className="feed-table">
                {feedItems.map((item: DashboardActivityFeedItem) => (
                  <Link key={item.id} href={item.route} className={`feed-row feed-row-${item.tone}`}>
                    <div className="feed-row-main">
                      <div className="feed-row-title">
                        <span className={`signal-dot signal-dot-${item.tone as DashboardTone}`} aria-hidden="true" />
                        <strong>{item.title}</strong>
                      </div>
                      <span>{item.project_name || eventLabel(item.event_type)}</span>
                    </div>
                    <span className="feed-row-time">{formatDateTime(item.changed_at)}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState title="Quiet" description="No recent flow." />
            )}
          </Card>
        </div>

        <div className="mission-column">
          <Card className="section-card mission-panel">
            <PanelHeader icon="radar" title="Radar" />
            {projectHealth.length ? (
              <div className="radar-table">
                <div className="data-table-head radar-table-head">
                  <span>Track</span>
                  <span>%</span>
                  <span>OD</span>
                  <span>Idle</span>
                </div>
                {projectHealth.map((project) => (
                  <Link key={project.project_id} href={`/projects/${project.project_id}`} className="radar-table-row">
                    <div className="radar-track-cell">
                      <strong>{project.project_name}</strong>
                      <div className="radar-progress-track">
                        <div
                          className={`radar-progress-fill radar-progress-fill-${projectProgressTone(project)}`}
                          style={{ width: `${project.completion_percent}%` }}
                        />
                      </div>
                    </div>
                    <span>{project.completion_percent}</span>
                    <span className={`table-stat ${project.overdue_tasks ? 'table-stat-danger' : ''}`}>{project.overdue_tasks}</span>
                    <span>{idleLabel(project.days_since_activity)}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState title="Empty" description="No track data." />
            )}
          </Card>

          <Card className="section-card mission-panel">
            <PanelHeader icon="gap" title="Gap" />
            <div className="dashboard-metric-grid">
              <DashboardMetric label="Plan" value={realityGap.planned_tasks_this_week} tone="info" />
              <DashboardMetric label="Done" value={realityGap.completed_tasks_this_week} tone={realityGap.completed_tasks_this_week >= realityGap.planned_tasks_this_week ? 'success' : 'warning'} />
              <DashboardMetric label="Slip" value={`${realityGap.delay_rate}%`} tone={realityGap.delay_rate >= 40 ? 'danger' : realityGap.delay_rate >= 20 ? 'warning' : 'success'} />
              <DashboardMetric label="OD" value={`${realityGap.overdue_ratio}%`} tone={realityGap.overdue_ratio >= 35 ? 'danger' : realityGap.overdue_ratio >= 15 ? 'warning' : 'success'} />
            </div>

            <div className="reality-strip">
              <div className="reality-strip-metrics">
                <span>Est {realityGap.estimated_hours_this_week.toFixed(1)}h</span>
                <span>Act {realityGap.actual_hours_this_week.toFixed(1)}h</span>
                <strong>{hoursDeltaLabel(realityGap)}</strong>
              </div>
              {trendPercentValues.length ? (
                <Sparkline values={trendPercentValues} colorClass={realityGap.delay_rate >= 35 ? 'warning' : 'success'} />
              ) : (
                <div className="muted small">No trend</div>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Card className="section-card mission-panel weekly-review-panel">
        <PanelHeader icon="week" title="Week" />
        <div className="dashboard-metric-grid weekly-review-metrics">
          <DashboardMetric label="Done" value={weeklyReview.completed_tasks_this_week} tone="success" />
          <DashboardMetric label="OD" value={weeklyReview.overdue_tasks} tone={weeklyReview.overdue_tasks ? 'danger' : 'success'} />
          <DashboardMetric label="Focus" value={`${weeklyReview.total_focus_hours.toFixed(1)}h`} tone="info" />
          <DashboardMetric label="Track" value={weeklyReview.most_active_project || 'None'} tone="neutral" />
        </div>

        <div className="weekly-review-grid weekly-review-grid-compact">
          <div className="weekly-review-summary weekly-review-summary-compact">
            {summary.focus_hours_trend?.length ? (
              <Sparkline values={summary.focus_hours_trend.map((point) => point.total_focus_hours)} colorClass="success" />
            ) : (
              <div className="muted small">No focus trend</div>
            )}
          </div>

          <div className="weekly-review-notes weekly-review-notes-compact">
            {reviewRows.map((item) => (
              <div key={item.label} className="weekly-review-note weekly-review-note-compact">
                <span className="weekly-review-label">{item.label}</span>
                <strong className="line-clamp-1">{item.value}</strong>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
