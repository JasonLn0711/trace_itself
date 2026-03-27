'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge, Card, EmptyState, Notice, SectionHeader, Sparkline } from '../components/Primitives';
import { TimelineGantt } from '../components/TimelineGantt';
import { dashboardApi, extractApiErrorMessage } from '../lib/api';
import { formatDateTime, relativeDueLabel, todayIso } from '../lib/dates';
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

function toneForHealth(health: string): DashboardTone {
  switch (health) {
    case 'critical':
      return 'danger';
    case 'watch':
      return 'warning';
    case 'healthy':
      return 'success';
    default:
      return 'neutral';
  }
}

function eventLabel(eventType: string) {
  switch (eventType) {
    case 'task_completed':
      return 'Completed';
    case 'task_blocked':
      return 'Blocked';
    case 'task_in_progress':
      return 'In progress';
    case 'daily_log':
      return 'Daily log';
    case 'milestone_completed':
      return 'Milestone';
    case 'milestone_progress':
      return 'Milestone';
    case 'project_updated':
      return 'Project';
    default:
      return formatEnumLabel(eventType);
  }
}

function idleLabel(daysSinceActivity: number | null) {
  if (daysSinceActivity === null || daysSinceActivity === undefined) {
    return 'No activity signal';
  }
  if (daysSinceActivity === 0) {
    return 'Active today';
  }
  if (daysSinceActivity === 1) {
    return 'Idle 1 day';
  }
  return `Idle ${daysSinceActivity} days`;
}

function hoursDeltaLabel(realityGap: DashboardRealityGap) {
  const delta = realityGap.actual_hours_this_week - realityGap.estimated_hours_this_week;
  if (delta === 0) {
    return 'On estimate';
  }
  return delta > 0 ? `+${delta.toFixed(1)}h over` : `${Math.abs(delta).toFixed(1)}h under`;
}

function DashboardMetric({
  label,
  value,
  caption,
  tone = 'neutral'
}: {
  label: string;
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
  const activeTrackCount = projectHealth.length || summary.active_projects.length;
  const errorLabels = Object.keys(moduleErrors);

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
          <div className="mission-kicker">trace_itself / personal execution intelligence</div>
          <h1>Mission Control</h1>
          <p className="muted">
            A self-hosted personal execution operating system for long-horizon learning, project delivery, and daily accountability.
          </p>
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
            <Link className="btn btn-primary" href="/tasks">Quick Add</Link>
            <Link className="btn btn-secondary" href="/daily-logs">Quick Log</Link>
            <Link className="btn btn-ghost" href="/projects">Projects</Link>
          </div>

          <div className="dashboard-metric-grid dashboard-metric-grid-top">
            <DashboardMetric label="Overdue" value={summary.overdue_tasks.length} tone={summary.overdue_tasks.length ? 'danger' : 'success'} />
            <DashboardMetric label="Due today" value={summary.today_tasks.length} tone={summary.today_tasks.length ? 'warning' : 'success'} />
            <DashboardMetric label="Active tracks" value={activeTrackCount} tone="info" />
            <DashboardMetric label="Weekly rate" value={`${realityGap.weekly_completion_rate}%`} caption="completion" tone={realityGap.weekly_completion_rate >= 70 ? 'success' : 'warning'} />
          </div>
        </div>
      </section>

      {errorLabels.length ? (
        <Notice
          title="Mission control is partially degraded"
          description={`Unavailable panels: ${errorLabels.join(', ')}`}
          tone="warning"
        />
      ) : null}

      <div className="mission-grid">
        <div className="mission-column">
          <Card className="section-card mission-panel">
            <SectionHeader title="Now" description="What deserves immediate attention." />
            {leadAction ? (
              <div className="hero-action-card">
                <div className="hero-action-head">
                  <Badge tone={toneForUrgency(leadAction.urgency_score)}>{formatEnumLabel(leadAction.entity_type)}</Badge>
                  <span className="hero-action-score">{leadAction.urgency_score}</span>
                </div>
                <h3>{leadAction.action_title}</h3>
                <p>{leadAction.reason}</p>
                <div className="hero-action-meta">
                  {leadAction.project_name ? <Badge tone="neutral">{leadAction.project_name}</Badge> : null}
                  {leadAction.status ? <Badge tone="neutral">{formatEnumLabel(leadAction.status)}</Badge> : null}
                  {leadAction.due_date ? <Badge tone={toneForUrgency(leadAction.urgency_score)}>{relativeDueLabel(leadAction.due_date)}</Badge> : null}
                </div>
                <Link className="btn btn-primary" href={leadAction.route}>Open</Link>
              </div>
            ) : (
              <EmptyState title="Nothing urgent" description="The next-action engine did not surface any pressing work." />
            )}

            {queuedActions.length ? (
              <div className="compact-list">
                {queuedActions.map((action) => (
                  <Link key={`${action.entity_type}-${action.entity_id ?? action.action_title}`} href={action.route} className="compact-list-item">
                    <div className="compact-list-copy">
                      <strong>{action.action_title}</strong>
                      <span>{action.reason}</span>
                    </div>
                    <Badge tone={toneForUrgency(action.urgency_score)}>{action.urgency_score}</Badge>
                  </Link>
                ))}
              </div>
            ) : null}

            <div className="mission-note">
              <span className="mission-note-label">Declared next step</span>
              <p>{latestLog?.next_step || latestLog?.summary || 'No next step recorded yet.'}</p>
            </div>
          </Card>

          <Card className="section-card mission-panel">
            <SectionHeader title="Alerts" description="Drift, risk, and stalled tracks." />
            {alertCards.length ? (
              <div className="alert-stack">
                {alertCards.map((alert) => (
                  <Link key={alert.id} href={alert.route} className={`alert-card alert-card-${alert.severity}`}>
                    <div className="alert-card-head">
                      <Badge tone={toneForSeverity(alert.severity)}>{formatEnumLabel(alert.category)}</Badge>
                      {alert.project_name ? <span className="muted small">{alert.project_name}</span> : null}
                    </div>
                    <strong>{alert.title}</strong>
                    <p>{alert.description}</p>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState title="No active warnings" description="No drift or milestone risk signals are firing right now." />
            )}
            {stagnation.tracking_notes.length ? (
              <div className="mission-footnote muted small">{stagnation.tracking_notes[0]}</div>
            ) : null}
          </Card>
        </div>

        <div className="mission-column mission-column-center">
          <Card className="section-card mission-panel">
            <SectionHeader
              title="Mission Timeline"
              description="Strategic 60-day view of active projects and milestones."
              action={<Link className="btn btn-ghost" href="/projects">Open</Link>}
            />
            {'timeline' in moduleErrors ? (
              <Notice title="Timeline unavailable" description={moduleErrors.timeline} tone="warning" />
            ) : (
              <TimelineGantt timeline={timeline} />
            )}
          </Card>

          <Card className="section-card mission-panel">
            <SectionHeader title="Execution Flow" description="Recent completions, logs, and movement across the system." />
            {feedItems.length ? (
              <div className="feed-stack">
                {feedItems.map((item: DashboardActivityFeedItem) => (
                  <Link key={item.id} href={item.route} className={`feed-item feed-item-${item.tone}`}>
                    <div className="feed-item-meta">
                      <Badge tone={item.tone as DashboardTone}>{eventLabel(item.event_type)}</Badge>
                      <span className="muted small">{formatDateTime(item.changed_at)}</span>
                    </div>
                    <strong>{item.title}</strong>
                    <p>{item.detail || item.project_name || 'Execution event logged.'}</p>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState title="No recent execution feed" description="Recent logs and status changes will appear here." />
            )}
          </Card>
        </div>

        <div className="mission-column">
          <Card className="section-card mission-panel">
            <SectionHeader title="Project Radar" description="Which long-horizon tracks are moving and which are stuck." />
            {projectHealth.length ? (
              <div className="radar-stack">
                {projectHealth.map((project) => (
                  <Link key={project.project_id} href={`/projects/${project.project_id}`} className="radar-item">
                    <div className="radar-head">
                      <strong>{project.project_name}</strong>
                      <Badge tone={toneForHealth(project.health)}>{project.health}</Badge>
                    </div>
                    <div className="radar-progress">
                      <div className="radar-progress-track">
                        <div
                          className={`radar-progress-fill radar-progress-fill-${projectProgressTone(project)}`}
                          style={{ width: `${project.completion_percent}%` }}
                        />
                      </div>
                      <span>{project.completion_percent}%</span>
                    </div>
                    <div className="radar-meta">
                      <span>{project.open_tasks} open</span>
                      <span>{project.overdue_tasks} overdue</span>
                      <span>{idleLabel(project.days_since_activity)}</span>
                    </div>
                    <p>{project.note}</p>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState title="No project radar data" description="Active projects will appear here once tracked work exists." />
            )}
          </Card>

          <Card className="section-card mission-panel">
            <SectionHeader title="Reality Gap" description="Where plan and execution diverge this week." />
            <div className="dashboard-metric-grid">
              <DashboardMetric label="Planned" value={realityGap.planned_tasks_this_week} tone="info" />
              <DashboardMetric label="Completed" value={realityGap.completed_tasks_this_week} tone={realityGap.completed_tasks_this_week >= realityGap.planned_tasks_this_week ? 'success' : 'warning'} />
              <DashboardMetric label="Delay rate" value={`${realityGap.delay_rate}%`} tone={realityGap.delay_rate >= 40 ? 'danger' : realityGap.delay_rate >= 20 ? 'warning' : 'success'} />
              <DashboardMetric label="Overdue ratio" value={`${realityGap.overdue_ratio}%`} tone={realityGap.overdue_ratio >= 35 ? 'danger' : realityGap.overdue_ratio >= 15 ? 'warning' : 'success'} />
            </div>

            <div className="dashboard-metric-grid dashboard-metric-grid-secondary">
              <DashboardMetric label="Estimated" value={`${realityGap.estimated_hours_this_week.toFixed(1)}h`} caption="planned hours" tone="neutral" />
              <DashboardMetric label="Actual" value={`${realityGap.actual_hours_this_week.toFixed(1)}h`} caption={hoursDeltaLabel(realityGap)} tone="neutral" />
            </div>

            <div className="trend-strip">
              {trendTail.length ? (
                trendTail.map((point) => (
                  <div key={point.week_start} className="trend-chip">
                    <span>{point.label}</span>
                    <strong>{point.completed_tasks}/{point.planned_tasks}</strong>
                  </div>
                ))
              ) : (
                <div className="muted small">Weekly trend will appear once tasks carry due dates and completions.</div>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Card className="section-card mission-panel weekly-review-panel">
        <SectionHeader title="Weekly Command Review" description="Operational summary of this week’s execution state." />
        <div className="dashboard-metric-grid weekly-review-metrics">
          <DashboardMetric label="Completed" value={weeklyReview.completed_tasks_this_week} tone="success" />
          <DashboardMetric label="Overdue" value={weeklyReview.overdue_tasks} tone={weeklyReview.overdue_tasks ? 'danger' : 'success'} />
          <DashboardMetric label="Focus" value={`${weeklyReview.total_focus_hours.toFixed(1)}h`} caption={`${weeklyReview.focus_days_logged} logs`} tone="info" />
          <DashboardMetric label="Most active" value={weeklyReview.most_active_project || 'None'} tone="neutral" />
        </div>

        <div className="weekly-review-grid">
          <div className="weekly-review-summary">
            <p>{weeklyReview.summary_text}</p>
            {summary.focus_hours_trend?.length ? (
              <Sparkline values={summary.focus_hours_trend.map((point) => point.total_focus_hours)} colorClass="success" />
            ) : null}
          </div>

          <div className="weekly-review-notes">
            <div className="weekly-review-note">
              <span className="weekly-review-label">Biggest progress</span>
              <strong>{weeklyReview.biggest_progress || 'No standout progress captured yet.'}</strong>
            </div>
            <div className="weekly-review-note">
              <span className="weekly-review-label">Biggest blocker</span>
              <strong>{weeklyReview.biggest_blocker || 'No explicit blocker recorded this week.'}</strong>
            </div>
            <div className="weekly-review-note">
              <span className="weekly-review-label">Inactive tracks</span>
              <strong>{weeklyReview.inactive_projects.length ? weeklyReview.inactive_projects.join(', ') : 'None flagged.'}</strong>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
