import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Card, EmptyState, MiniBarChart, ProgressBar, SectionHeader, Sparkline, StatCard } from '../components/Primitives';
import { dashboardApi } from '../lib/api';
import { formatDate, relativeDueLabel } from '../lib/dates';
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

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const data = await dashboardApi.summary();
        if (alive) {
          setSummary(data);
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

  const stats = [
    { label: 'Active projects', value: summary.active_projects.length },
    { label: 'Today tasks', value: summary.today_tasks.length },
    { label: 'Overdue tasks', value: summary.overdue_tasks.length, hint: 'Needs attention' },
    { label: 'Upcoming milestones', value: summary.upcoming_milestones.length }
  ];

  const projectProgress = summary.project_progress ?? [];
  const taskBreakdown = summary.task_status_breakdown ?? [];
  const focusTrend = summary.focus_hours_trend ?? [];
  const completedProjects = projectProgress.filter((item) => item.completion_percent >= 100).length;
  const completedTodayTasks = summary.today_tasks.filter((task) => task.status === 'done').length;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p className="muted">A quick read on what matters today.</p>
        </div>
      </div>

      <div className="grid stats">
        {stats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>

      <div className="grid three">
        <Card className="section-card">
          <SectionHeader title="Project progress" description="How far each active track has moved." />
          <div className="stack">
            {projectProgress.length ? (
              projectProgress.slice(0, 4).map((item) => (
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
            <div className="chart-legend">
              <div className="legend-row">
                <span>Completed projects</span>
                <strong>{completedProjects}</strong>
              </div>
              <div className="legend-row">
                <span>Today tasks done</span>
                <strong>{completedTodayTasks}</strong>
              </div>
            </div>
          </div>
        </Card>

        <Card className="section-card">
          <SectionHeader title="Task mix" description="A quick read on task status distribution." />
          <MiniBarChart values={taskBreakdown.map((item) => item.count)} labels={taskBreakdown.map((item) => item.status.slice(0, 3))} />
          <div className="chart-legend">
            {taskBreakdown.length ? (
              taskBreakdown.map((item) => (
                <div key={item.status} className="legend-row">
                  <span>{item.status}</span>
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
          <Sparkline values={focusTrend.map((item) => item.total_focus_hours)} />
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
          <SectionHeader
            title="Active projects"
            description="Projects that are still moving."
            action={<Link className="btn btn-ghost" to="/projects">Open projects</Link>}
          />
          <div className="list-grid">
            {summary.active_projects.length ? (
              summary.active_projects.map((project) => (
                <div className="entity" key={project.id}>
                  <div className="entity-top">
                    <div>
                      <h3 className="entity-title">{project.name}</h3>
                      <p className="muted">{project.description || 'No description yet.'}</p>
                    </div>
                    <Badge tone={project.status === 'completed' ? 'success' : 'info'}>{project.status}</Badge>
                  </div>
                  <div className="entity-meta">
                    <Badge tone="neutral">Priority: {project.priority}</Badge>
                    <Badge tone="neutral">Target {formatDate(project.target_date)}</Badge>
                  </div>
                  <ProgressBar
                    label="Completion"
                    value={projectProgress.find((item) => item.project_id === project.id)?.completion_percent ?? 0}
                    caption="Based on completed tasks."
                  />
                </div>
              ))
            ) : (
              <EmptyState
                title="No active projects"
                description="Create a project to start tracking work."
                action={<Link className="btn btn-primary" to="/projects">Create project</Link>}
              />
            )}
          </div>
        </Card>

        <Card className="section-card">
          <SectionHeader title="Today at a glance" description="Tasks and milestones that need movement." />
          <div className="stack">
            <div>
              <p className="muted small">Today tasks</p>
              <div className="mini-list">
                {summary.today_tasks.length ? (
                  summary.today_tasks.map((task) => (
                    <div key={task.id} className="mini-item">
                      <div>
                        <strong>{task.title}</strong>
                        <span className="muted small">{relativeDueLabel(task.due_date)}</span>
                      </div>
                      <Badge tone="info">{task.status}</Badge>
                    </div>
                  ))
                ) : (
                  <EmptyState title="Nothing due today" description="Today's list is clear." />
                )}
              </div>
            </div>

            <div className="divider" />

            <div>
              <p className="muted small">Overdue tasks</p>
              <div className="mini-list">
                {summary.overdue_tasks.length ? (
                  summary.overdue_tasks.map((task) => (
                    <div key={task.id} className="mini-item">
                      <div>
                        <strong>{task.title}</strong>
                        <span className="muted small">{relativeDueLabel(task.due_date)}</span>
                      </div>
                      <Badge tone="danger">Overdue</Badge>
                    </div>
                  ))
                ) : (
                  <EmptyState title="No overdue tasks" description="Everything is on track for now." />
                )}
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid two">
        <Card className="section-card">
          <SectionHeader title="Upcoming milestones" description="Near-term checkpoints." />
          <div className="list-grid">
            {summary.upcoming_milestones.length ? (
              summary.upcoming_milestones.map((milestone) => (
                <div className="entity" key={milestone.id}>
                  <div className="entity-top">
                    <div>
                      <h3 className="entity-title">{milestone.title}</h3>
                      <p className="muted">{milestone.description || 'No description yet.'}</p>
                    </div>
                    <Badge tone="warning">{relativeDueLabel(milestone.due_date)}</Badge>
                  </div>
                  <div className="entity-meta">
                    <Badge tone="neutral">Progress {milestone.progress ?? 0}%</Badge>
                  </div>
                  <ProgressBar label="Milestone progress" value={milestone.progress ?? 0} caption={formatDate(milestone.due_date)} />
                </div>
              ))
            ) : (
              <EmptyState title="No upcoming milestones" description="Add milestones to plan the next checkpoint." />
            )}
          </div>
        </Card>

        <Card className="section-card">
          <SectionHeader title="Recent daily logs" description="What you planned, did, and learned." action={<Link className="btn btn-ghost" to="/daily-logs">Open logs</Link>} />
          <div className="list-grid">
            {summary.recent_daily_logs.length ? (
              summary.recent_daily_logs.map((log) => (
                <div className="entity" key={log.id}>
                  <div className="entity-top">
                    <div>
                      <h3 className="entity-title">{formatDate(log.log_date)}</h3>
                      <p className="muted">{log.summary || 'No summary yet.'}</p>
                    </div>
                    <Badge tone="neutral">{log.total_focus_hours ?? 0}h focus</Badge>
                  </div>
                  <div className="entity-meta">
                    <Badge tone="neutral">Next: {log.next_step || 'Not set'}</Badge>
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
