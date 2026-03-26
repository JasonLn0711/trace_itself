import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Badge,
  Callout,
  Card,
  EmptyState,
  MetricPill,
  MiniBarChart,
  PageIntro,
  ProgressBar,
  SectionHeader,
  Sparkline,
  StatCard
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
  toneForProjectStatus,
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
  const focusSummary = summarizeFocus(summary.recent_daily_logs.slice(0, 7));
  const hasTodayLog = summary.recent_daily_logs.some((log) => log.log_date === todayIso());
  const todayTasksDone = summary.today_tasks.filter((task) => task.status === 'done').length;
  const attentionTasks = useMemo(() => {
    const uniqueTasks = Array.from(new Map([...summary.overdue_tasks, ...summary.today_tasks].map((task) => [task.id, task])).values());
    return sortTasksForAttention(uniqueTasks.filter((task) => task.status !== 'done')).slice(0, 6);
  }, [summary.overdue_tasks, summary.today_tasks]);
  const attentionMilestones = useMemo(
    () => sortMilestonesForAttention(summary.upcoming_milestones).slice(0, 4),
    [summary.upcoming_milestones]
  );
  const recommendation = summary.overdue_tasks.length
    ? {
        title: 'Resolve the overdue queue first',
        description: `You have ${summary.overdue_tasks.length} overdue task${summary.overdue_tasks.length === 1 ? '' : 's'} pulling focus backward. Clear or reschedule the most important one before taking on new work.`,
        tone: 'danger' as const,
        action: <Link className="btn btn-danger" to="/tasks">Review overdue tasks</Link>
      }
    : !hasTodayLog
      ? {
          title: 'Capture today before the details fade',
          description: 'A short daily log keeps the dashboard honest and makes tomorrow easier to start.',
          tone: 'warning' as const,
          action: <Link className="btn btn-primary" to="/daily-logs">Write today&apos;s log</Link>
        }
      : summary.today_tasks.length
        ? {
            title: 'Push the current task set over the line',
            description: `${todayTasksDone}/${summary.today_tasks.length} task${summary.today_tasks.length === 1 ? '' : 's'} due today are already done.`,
            tone: 'info' as const,
            action: <Link className="btn btn-primary" to="/tasks">Update task status</Link>
          }
        : {
            title: 'Use today to move the next milestone',
            description: 'Your urgent queue is clear. A good next move is to tighten the next milestone or prepare the next task.',
            tone: 'success' as const,
            action: <Link className="btn btn-primary" to="/projects">Review projects</Link>
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
        eyebrow="Control center"
        title="Dashboard"
        description="See what needs attention first, where momentum is building, and what the next smart move should be."
        actions={
          <>
            <Link className="btn btn-primary" to="/tasks">Plan next actions</Link>
            <Link className="btn btn-secondary" to="/daily-logs">Capture daily log</Link>
            <Link className="btn btn-ghost" to="/projects">Review tracks</Link>
          </>
        }
        aside={
          <div className="metric-strip">
            <MetricPill label="Active projects" value={summary.active_projects.length} tone="info" />
            <MetricPill label="Urgent tasks" value={summary.overdue_tasks.length + summary.today_tasks.filter((task) => task.status !== 'done').length} tone={summary.overdue_tasks.length ? 'danger' : 'warning'} />
            <MetricPill label="Avg focus this week" value={`${focusSummary.averageHours.toFixed(1)}h`} tone="success" />
            <MetricPill label="Today log" value={hasTodayLog ? 'Captured' : 'Missing'} tone={hasTodayLog ? 'success' : 'warning'} />
          </div>
        }
      />

      {error ? <Callout title="Dashboard data is incomplete" description={error} tone="danger" /> : null}

      <Callout
        title={recommendation.title}
        description={recommendation.description}
        tone={recommendation.tone}
        action={recommendation.action}
      />

      <div className="grid stats">
        <StatCard label="Today tasks" value={summary.today_tasks.length} hint={`${todayTasksDone} done`} />
        <StatCard label="Overdue tasks" value={summary.overdue_tasks.length} hint="Clear or reschedule these first" />
        <StatCard label="Upcoming milestones" value={summary.upcoming_milestones.length} hint="Next 14 days" />
        <StatCard label="Recent logs" value={summary.recent_daily_logs.length} hint="Latest work notes" />
      </div>

      <div className="grid two">
        <Card className="section-card">
          <SectionHeader
            title="Attention queue"
            description="The shortest list that keeps the system trustworthy."
            action={<Link className="btn btn-ghost" to="/tasks">Open tasks</Link>}
          />
          <div className="cluster-grid">
            {attentionTasks.length ? (
              attentionTasks.map((task) => (
                <div key={task.id} className="surface-soft">
                  <div className="entity-top">
                    <div className="entity-copy">
                      <h3 className="entity-title">{task.title}</h3>
                      <p className="muted">{task.description || 'No note yet. Use the task page to add context if this still feels vague.'}</p>
                    </div>
                    <Badge tone={toneForTaskStatus(task.status)}>{formatEnumLabel(task.status)}</Badge>
                  </div>
                  <div className="entity-meta">
                    <Badge tone={toneForDueState(task.due_date)}>{relativeDueLabel(task.due_date)}</Badge>
                    <Badge tone="neutral">Due {formatDate(task.due_date)}</Badge>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState
                title="Urgent queue is clear"
                description="No overdue work and no incomplete tasks due today."
                action={<Link className="btn btn-primary" to="/tasks">Plan the next task</Link>}
              />
            )}
          </div>
        </Card>

        <Card className="section-card">
          <SectionHeader
            title="Active projects"
            description="Tracks that still need active steering."
            action={<Link className="btn btn-ghost" to="/projects">Open projects</Link>}
          />
          <div className="cluster-grid">
            {summary.active_projects.length ? (
              summary.active_projects.map((project) => {
                const progress = projectProgress.find((item) => item.project_id === project.id);
                return (
                  <div className="surface-soft" key={project.id}>
                    <div className="entity-top">
                      <div className="entity-copy">
                        <h3 className="entity-title">{project.name}</h3>
                        <p className="muted">{project.description || 'No description yet.'}</p>
                      </div>
                      <Badge tone={toneForProjectStatus(project.status)}>{formatEnumLabel(project.status)}</Badge>
                    </div>
                    <div className="entity-meta">
                      <Badge tone="neutral">{formatDate(project.target_date)}</Badge>
                      <Badge tone={progress && progress.overdue_tasks > 0 ? 'warning' : 'neutral'}>
                        {progress?.overdue_tasks ?? 0} overdue
                      </Badge>
                    </div>
                    <ProgressBar
                      label="Completion"
                      value={progress?.completion_percent ?? 0}
                      caption={
                        progress
                          ? `${progress.completed_tasks}/${progress.total_tasks} tasks complete`
                          : 'Add tasks to start measuring progress.'
                      }
                      tone={progress && progress.overdue_tasks > 0 ? 'warning' : 'info'}
                    />
                  </div>
                );
              })
            ) : (
              <EmptyState
                title="No active projects"
                description="Create a project to give the dashboard something to steer."
                action={<Link className="btn btn-primary" to="/projects">Create project</Link>}
              />
            )}
          </div>
        </Card>
      </div>

      <div className="grid three">
        <Card className="section-card">
          <SectionHeader title="Project progress" description="How far each active track has moved." />
          <div className="stack">
            {projectProgress.length ? (
              projectProgress.slice(0, 5).map((item) => (
                <ProgressBar
                  key={item.project_id}
                  label={item.project_name}
                  value={item.completion_percent}
                  caption={`${item.completed_tasks}/${item.total_tasks} tasks complete · ${item.overdue_tasks} overdue`}
                  tone={item.completion_percent >= 80 ? 'success' : item.overdue_tasks > 0 ? 'warning' : 'info'}
                />
              ))
            ) : (
              <EmptyState title="No progress data yet" description="Once tasks exist, project progress will show up here." />
            )}
          </div>
        </Card>

        <Card className="section-card">
          <SectionHeader title="Task mix" description="A quick read on task status distribution." />
          <MiniBarChart values={taskBreakdown.map((item) => item.count)} labels={taskBreakdown.map((item) => item.status.slice(0, 3).toUpperCase())} />
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
          <SectionHeader title="Focus trend" description="Recent daily focus hours at a glance." />
          <Sparkline values={focusTrend.map((item) => item.total_focus_hours)} colorClass="success" />
          <div className="chart-legend">
            {focusTrend.length ? (
              focusTrend.slice(-4).map((item) => (
                <div key={item.log_date} className="legend-row">
                  <span>{formatDate(item.log_date)}</span>
                  <strong>{item.total_focus_hours.toFixed(1)}h</strong>
                </div>
              ))
            ) : (
              <p className="muted">No daily logs yet.</p>
            )}
          </div>
        </Card>
      </div>

      <div className="grid two">
        <Card className="section-card">
          <SectionHeader title="Upcoming milestones" description="Checkpoints approaching soonest." />
          <div className="cluster-grid">
            {attentionMilestones.length ? (
              attentionMilestones.map((milestone) => (
                <div className="surface-soft" key={milestone.id}>
                  <div className="entity-top">
                    <div className="entity-copy">
                      <h3 className="entity-title">{milestone.title}</h3>
                      <p className="muted">{milestone.description || 'No description yet.'}</p>
                    </div>
                    <Badge tone={toneForMilestoneStatus(milestone.status)}>{formatEnumLabel(milestone.status)}</Badge>
                  </div>
                  <div className="entity-meta">
                    <Badge tone={toneForDueState(milestone.due_date)}>{shortDueLabel(milestone.due_date)}</Badge>
                    <Badge tone="neutral">{formatDate(milestone.due_date)}</Badge>
                  </div>
                  <ProgressBar
                    label="Milestone progress"
                    value={milestone.progress ?? 0}
                    caption={relativeDueLabel(milestone.due_date)}
                    tone={toneForMilestoneStatus(milestone.status)}
                  />
                </div>
              ))
            ) : (
              <EmptyState title="No upcoming milestones" description="Add milestones to plan the next checkpoint." />
            )}
          </div>
        </Card>

        <Card className="section-card">
          <SectionHeader
            title="Recent daily logs"
            description="Short notes that explain recent movement."
            action={<Link className="btn btn-ghost" to="/daily-logs">Open logs</Link>}
          />
          <div className="cluster-grid">
            {summary.recent_daily_logs.length ? (
              summary.recent_daily_logs.map((log) => (
                <div className="surface-soft" key={log.id}>
                  <div className="entity-top">
                    <div className="entity-copy">
                      <h3 className="entity-title">{formatDate(log.log_date)}</h3>
                      <p className="muted">{log.summary || 'No summary yet.'}</p>
                    </div>
                    <Badge tone="neutral">{(log.total_focus_hours ?? 0).toFixed(1)}h focus</Badge>
                  </div>
                  <div className="detail-grid">
                    <div>
                      <div className="muted small">Blockers</div>
                      <div>{log.blockers || 'No blockers recorded.'}</div>
                    </div>
                    <div>
                      <div className="muted small">Next step</div>
                      <div>{log.next_step || 'No next step recorded.'}</div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState
                title="No daily logs yet"
                description="Use the daily log page to capture progress each day."
                action={<Link className="btn btn-primary" to="/daily-logs">Create log</Link>}
              />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
