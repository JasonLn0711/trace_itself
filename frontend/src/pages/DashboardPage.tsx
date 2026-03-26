import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, EmptyState, SectionHeader, StatCard, Badge } from '../components/Primitives';
import { dashboardApi } from '../lib/api';
import { formatDate, relativeDueLabel } from '../lib/dates';
import type { DashboardSummary } from '../types';

const emptySummary: DashboardSummary = {
  active_projects: [],
  today_tasks: [],
  overdue_tasks: [],
  upcoming_milestones: [],
  recent_daily_logs: []
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

