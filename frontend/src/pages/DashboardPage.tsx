import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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
import { formatDate, relativeDueLabel, todayIso } from '../lib/dates';
import {
  formatEnumLabel,
  shortDueLabel,
  sortMilestonesForAttention,
  sortTasksForAttention,
  summarizeFocus,
  toneForDueState,
  toneForMilestoneStatus,
  toneForTaskStatus
} from '../lib/presentation';
import type { DashboardSummary } from '../types';

const emptySummary: DashboardSummary = {
  active_projects: [],
  today_tasks: [],
  overdue_tasks: [],
  upcoming_milestones: [],
  recent_daily_logs: [],
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
        title: `${overdueCount} overdue task${overdueCount === 1 ? '' : 's'} need attention`,
        description: 'Clear, reschedule, or break down the oldest blocked work first.',
        tone: 'danger' as const
      }
    : !hasTodayLog
      ? {
          title: 'Today’s log is still missing',
          description: 'Capture a short note before the day fades.',
          tone: 'warning' as const
        }
      : urgentCount
        ? {
            title: `${urgentCount} task${urgentCount === 1 ? '' : 's'} still active today`,
            description: 'Keep the queue honest as work moves.',
            tone: 'info' as const
          }
        : {
            title: 'Dashboard looks healthy',
            description: 'No overdue work and today is recorded.',
            tone: 'success' as const
          };

  if (loading) {
    return (
      <div className="page">
        <Card className="section-card">
          <div className="spinner" />
          <p className="muted">Loading dashboard summary...</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="page">
      <PageIntro
        eyebrow="Today"
        title="Dashboard"
        description="A fast read on what matters now."
        actions={
          <>
            <Link className="btn btn-primary" to="/tasks">Open tasks</Link>
            <Link className="btn btn-secondary" to="/daily-logs">Write log</Link>
            <Link className="btn btn-ghost" to="/projects">Projects</Link>
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
      {!error ? <Notice title={statusNotice.title} description={statusNotice.description} tone={statusNotice.tone} /> : null}

      <div className="grid three">
        <Card className="section-card">
          <SectionHeader title="Today" description="Keep the daily signal current." />
          <div className="stack compact-stack">
            <ProgressBar
              label="Tasks due today"
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
              label="Daily log"
              value={hasTodayLog ? 1 : 0}
              max={1}
              caption={hasTodayLog ? 'Captured today' : 'Still missing'}
              tone={dailyLogTone}
            />
            <Sparkline values={focusTrend.map((item) => item.total_focus_hours)} colorClass="success" />
          </div>
        </Card>

        <Card className="section-card">
          <SectionHeader title="Task mix" description="What the queue looks like." />
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
          <SectionHeader title="Project progress" description="Tracks that still need steering." />
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
              <EmptyState title="No project progress yet" description="Add tasks to start measuring progress." />
            )}
          </div>
        </Card>
      </div>

      <div className="grid two">
        <Card className="section-card">
          <SectionHeader
            title="Needs attention"
            description="The shortest queue worth reading."
            action={<Link className="btn btn-ghost" to="/tasks">Open tasks</Link>}
          />
          <div className="cluster-grid">
            {attentionTasks.length ? (
              attentionTasks.map((task) => (
                <div key={task.id} className="surface-soft">
                  <div className="entity-top">
                    <div className="entity-copy">
                      <h3 className="entity-title">{task.title}</h3>
                    </div>
                    <Badge tone={toneForTaskStatus(task.status)}>{formatEnumLabel(task.status)}</Badge>
                  </div>
                  <div className="entity-meta">
                    <Badge tone={toneForDueState(task.due_date)}>{relativeDueLabel(task.due_date)}</Badge>
                    <Badge tone="neutral">{formatDate(task.due_date)}</Badge>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState title="Nothing urgent" description="No overdue tasks and no unfinished tasks due today." />
            )}
          </div>
        </Card>

        <Card className="section-card">
          <SectionHeader title="Upcoming milestones" description="Next checkpoints." />
          <div className="cluster-grid">
            {attentionMilestones.length ? (
              attentionMilestones.map((milestone) => (
                <div className="surface-soft" key={milestone.id}>
                  <div className="entity-top">
                    <div className="entity-copy">
                      <h3 className="entity-title">{milestone.title}</h3>
                    </div>
                    <Badge tone={toneForMilestoneStatus(milestone.status)}>{formatEnumLabel(milestone.status)}</Badge>
                  </div>
                  <div className="entity-meta">
                    <Badge tone={toneForDueState(milestone.due_date)}>{shortDueLabel(milestone.due_date)}</Badge>
                    <Badge tone="neutral">{formatDate(milestone.due_date)}</Badge>
                  </div>
                  <ProgressBar
                    label="Progress"
                    value={milestone.progress ?? 0}
                    caption={relativeDueLabel(milestone.due_date)}
                    tone={toneForMilestoneStatus(milestone.status)}
                  />
                </div>
              ))
            ) : (
              <EmptyState title="No upcoming milestones" description="Add milestones to map the next checkpoint." />
            )}
          </div>
        </Card>
      </div>

      <Card className="section-card">
        <SectionHeader
          title="Latest log"
          description="The last note that explains recent movement."
          action={<Link className="btn btn-ghost" to="/daily-logs">Open logs</Link>}
        />
        {latestLog ? (
          <div className="surface-soft">
            <div className="entity-top">
              <div className="entity-copy">
                <h3 className="entity-title">{formatDate(latestLog.log_date)}</h3>
                <p className="muted">{latestLog.summary || 'No summary yet.'}</p>
              </div>
              <Badge tone="neutral">{(latestLog.total_focus_hours ?? 0).toFixed(1)}h focus</Badge>
            </div>
            <div className="detail-grid">
              <div>
                <div className="muted small">Blockers</div>
                <div>{latestLog.blockers || 'No blockers recorded.'}</div>
              </div>
              <div>
                <div className="muted small">Next step</div>
                <div>{latestLog.next_step || 'No next step recorded.'}</div>
              </div>
            </div>
          </div>
        ) : (
          <EmptyState
            title="No daily logs yet"
            description="A short daily note makes the dashboard easier to trust."
            action={<Link className="btn btn-primary" to="/daily-logs">Create log</Link>}
          />
        )}
      </Card>
    </div>
  );
}
