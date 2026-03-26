'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Badge,
  Card,
  EmptyState,
  MetricPill,
  MiniBarChart,
  Notice,
  PageIntro,
  ProgressBar,
  SectionHeader,
  Sparkline
} from '../components/Primitives';
import { dashboardApi, extractApiErrorMessage } from '../lib/api';
import { formatDate, formatDateTime, relativeDueLabel, todayIso } from '../lib/dates';
import {
  formatEnumLabel,
  shortDueLabel,
  sortMilestonesForAttention,
  sortTasksForAttention,
  summarizeFocus,
  toneForDueState,
  toneForMilestoneStatus,
  toneForProductUpdateType,
  toneForTaskStatus
} from '../lib/presentation';
import type { DashboardSummary } from '../types';

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

export function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary>(emptySummary);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const data = await dashboardApi.summary();
        if (alive) {
          setSummary(data);
          setError('');
        }
      } catch (err) {
        if (alive) {
          setError(extractApiErrorMessage(err));
        }
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      alive = false;
    };
  }, []);

  const projectProgress = summary.project_progress ?? [];
  const taskBreakdown = summary.task_status_breakdown ?? [];
  const focusTrend = summary.focus_hours_trend ?? [];
  const recentProductUpdates = summary.recent_product_updates ?? [];
  const recentLogs = useMemo(
    () => [...summary.recent_daily_logs].sort((left, right) => right.log_date.localeCompare(left.log_date)),
    [summary.recent_daily_logs]
  );
  const latestLog = recentLogs[0] ?? null;
  const hasTodayLog = recentLogs.some((log) => log.log_date === todayIso());
  const focusSummary = summarizeFocus(recentLogs.slice(0, 7));
  const todayTasksDone = summary.today_tasks.filter((task) => task.status === 'done').length;
  const todayTasksOpen = summary.today_tasks.filter((task) => task.status !== 'done');
  const overdueCount = summary.overdue_tasks.length;
  const urgentCount = overdueCount + todayTasksOpen.length;

  const attentionTasks = useMemo(() => {
    const uniqueTasks = Array.from(new Map([...summary.overdue_tasks, ...summary.today_tasks].map((task) => [task.id, task])).values());
    return sortTasksForAttention(uniqueTasks.filter((task) => task.status !== 'done')).slice(0, 4);
  }, [summary.overdue_tasks, summary.today_tasks]);

  const attentionMilestones = useMemo(
    () => sortMilestonesForAttention(summary.upcoming_milestones).slice(0, 3),
    [summary.upcoming_milestones]
  );

  const projectProgressItems = useMemo(
    () =>
      [...projectProgress]
        .sort((left, right) => right.overdue_tasks - left.overdue_tasks || left.completion_percent - right.completion_percent || left.project_name.localeCompare(right.project_name))
        .slice(0, 4),
    [projectProgress]
  );

  const todayTasksProgressValue = summary.today_tasks.length ? todayTasksDone : 1;
  const todayTasksProgressMax = summary.today_tasks.length || 1;
  const todayTasksTone = overdueCount ? 'danger' : todayTasksOpen.length ? 'warning' : 'success';
  const dailyLogTone = hasTodayLog ? 'success' : 'warning';
  const statusNotice = overdueCount
    ? {
        title: `${overdueCount} overdue task${overdueCount === 1 ? '' : 's'}`,
        tone: 'danger' as const
      }
    : !hasTodayLog
      ? {
          title: 'Today log missing',
          tone: 'warning' as const
        }
      : urgentCount
        ? {
            title: `${urgentCount} task${urgentCount === 1 ? '' : 's'} active today`,
            tone: 'info' as const
          }
        : {
            title: 'On track',
            tone: 'success' as const
          };

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
    <div className="page">
      <PageIntro
        title="Dashboard"
        actions={
          <>
            <Link className="btn btn-primary" href="/tasks">Tasks</Link>
            <Link className="btn btn-secondary" href="/asr">ASR</Link>
            <Link className="btn btn-ghost" href="/daily-logs">Log</Link>
            <Link className="btn btn-ghost" href="/projects">Projects</Link>
          </>
        }
        aside={
          <div className="metric-strip">
            <MetricPill label="Overdue" value={overdueCount} tone={overdueCount ? 'danger' : 'success'} />
            <MetricPill label="Due today" value={todayTasksOpen.length} tone={todayTasksOpen.length ? 'warning' : 'success'} />
            <MetricPill label="Active projects" value={summary.active_projects.length} tone="info" />
            <MetricPill label="Avg focus" value={`${focusSummary.averageHours.toFixed(1)}h`} tone="success" />
          </div>
        }
      />

      {error ? <Notice title="Dashboard data is incomplete" description={error} tone="danger" /> : null}
      {!error ? <Notice title={statusNotice.title} tone={statusNotice.tone} /> : null}

      <div className="grid three">
        <Card className="section-card">
          <SectionHeader title="Today" />
          <div className="stack compact-stack">
            <ProgressBar
              label="Due today"
              value={todayTasksProgressValue}
              max={todayTasksProgressMax}
              caption={
                summary.today_tasks.length
                  ? `${todayTasksDone} of ${summary.today_tasks.length} complete`
                  : 'Nothing due today'
              }
              tone={todayTasksTone}
            />
            <ProgressBar
              label="Log"
              value={hasTodayLog ? 1 : 0}
              max={1}
              caption={hasTodayLog ? 'Captured today' : 'Still missing'}
              tone={dailyLogTone}
            />
            <Sparkline values={focusTrend.map((item) => item.total_focus_hours)} colorClass="success" />
          </div>
        </Card>

        <Card className="section-card">
          <SectionHeader title="Task mix" />
          <MiniBarChart values={taskBreakdown.map((item) => item.count)} labels={['To', 'Now', 'Blk', 'Done']} />
          <div className="chart-legend">
            {taskBreakdown.length ? (
              taskBreakdown.map((item) => (
                <div key={item.status} className="legend-row">
                  <span>{formatEnumLabel(item.status)}</span>
                  <strong>{item.count}</strong>
                </div>
              ))
            ) : (
              <p className="muted">No tasks yet.</p>
            )}
          </div>
        </Card>

        <Card className="section-card">
          <SectionHeader title="Projects" />
          <div className="stack compact-stack">
            {projectProgressItems.length ? (
              projectProgressItems.map((item) => (
                <ProgressBar
                  key={item.project_id}
                  label={item.project_name}
                  value={item.completion_percent}
                  caption={`${item.completed_tasks}/${item.total_tasks} tasks · ${item.overdue_tasks} overdue`}
                  tone={item.overdue_tasks > 0 ? 'warning' : item.completion_percent >= 80 ? 'success' : 'info'}
                />
              ))
            ) : (
              <EmptyState title="No project progress yet" description="Add tasks to show progress." />
            )}
          </div>
        </Card>
      </div>

      <div className="grid two">
        <Card className="section-card">
          <SectionHeader
            title="Queue"
            action={<Link className="btn btn-ghost" href="/tasks">Open</Link>}
          />
          <div className="list-table">
            {attentionTasks.length ? (
              attentionTasks.map((task) => (
                <div key={task.id} className="list-row">
                  <div className="list-row-main">
                    <div className="list-row-header">
                      <h3 className="list-row-title line-clamp-1">{task.title}</h3>
                      <div className="list-row-meta">
                        <Badge tone={toneForTaskStatus(task.status)}>{formatEnumLabel(task.status)}</Badge>
                        <Badge tone={toneForDueState(task.due_date)}>{relativeDueLabel(task.due_date)}</Badge>
                      </div>
                    </div>
                    <div className="list-row-copy line-clamp-1">{formatDate(task.due_date)}</div>
                  </div>
                  <div className="list-row-side">
                    <Link className="btn btn-ghost" href="/tasks">Open</Link>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState title="Nothing urgent" description="No overdue or due-today tasks." />
            )}
          </div>
        </Card>

        <Card className="section-card">
          <SectionHeader title="Milestones" />
          <div className="list-table">
            {attentionMilestones.length ? (
              attentionMilestones.map((milestone) => (
                <div className="list-row" key={milestone.id}>
                  <div className="list-row-main">
                    <div className="list-row-header">
                      <h3 className="list-row-title line-clamp-1">{milestone.title}</h3>
                      <div className="list-row-meta">
                        <Badge tone={toneForMilestoneStatus(milestone.status)}>{formatEnumLabel(milestone.status)}</Badge>
                        <Badge tone={toneForDueState(milestone.due_date)}>{shortDueLabel(milestone.due_date)}</Badge>
                      </div>
                    </div>
                    <div className="list-row-progress">
                      <ProgressBar
                        label="Progress"
                        value={milestone.progress ?? 0}
                        caption={relativeDueLabel(milestone.due_date)}
                        tone={toneForMilestoneStatus(milestone.status)}
                      />
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState title="No upcoming milestones" description="Add a milestone." />
            )}
          </div>
        </Card>
      </div>

      <div className="grid two">
        <Card className="section-card">
          <SectionHeader
            title="Log"
            action={<Link className="btn btn-ghost" href="/daily-logs">Open</Link>}
          />
          {latestLog ? (
            <div className="list-row">
              <div className="list-row-main">
                <div className="list-row-header">
                  <h3 className="list-row-title">{formatDate(latestLog.log_date)}</h3>
                  <div className="list-row-meta">
                    <Badge tone="neutral">{(latestLog.total_focus_hours ?? 0).toFixed(1)}h</Badge>
                  </div>
                </div>
                <div className="list-row-copy line-clamp-1">{latestLog.summary || 'No summary.'}</div>
                <div className="list-row-copy line-clamp-1">{latestLog.next_step || latestLog.blockers || 'No next step.'}</div>
              </div>
            </div>
          ) : (
            <EmptyState
              title="No daily logs yet"
              description="Add today&apos;s log."
              action={<Link className="btn btn-primary" href="/daily-logs">Create log</Link>}
            />
          )}
        </Card>

        <Card className="section-card">
          <SectionHeader
            title="Updates"
            action={<Link className="btn btn-ghost" href="/updates">Open</Link>}
          />
          <div className="list-table">
            {recentProductUpdates.length ? (
              recentProductUpdates.map((entry) => (
                <div key={entry.id} className="list-row">
                  <div className="list-row-main">
                    <div className="list-row-header">
                      <h3 className="list-row-title line-clamp-1">
                        {entry.version_tag ? `${entry.version_tag} · ` : ''}
                        {entry.title}
                      </h3>
                      <div className="list-row-meta">
                        {entry.version_tag ? <Badge tone="success">{entry.version_tag}</Badge> : null}
                        <Badge tone={toneForProductUpdateType(entry.change_type)}>{formatEnumLabel(entry.change_type)}</Badge>
                        <Badge tone="neutral">{formatEnumLabel(entry.area)}</Badge>
                      </div>
                    </div>
                    <div className="list-row-copy line-clamp-1">{entry.summary}</div>
                  </div>
                  <div className="list-row-side">
                    <div className="muted small">{formatDateTime(entry.changed_at)}</div>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState title="No updates yet" description="New changes will appear here." />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
