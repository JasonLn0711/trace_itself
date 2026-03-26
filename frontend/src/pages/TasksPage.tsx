import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, Field, SectionHeader } from '../components/Primitives';
import { extractApiErrorMessage, milestonesApi, projectsApi, tasksApi } from '../lib/api';
import { formatDate, relativeDueLabel } from '../lib/dates';
import type { Milestone, Project, Task } from '../types';

type TaskFormState = {
  project_id: string;
  milestone_id: string;
  title: string;
  description: string;
  due_date: string;
  priority: string;
  status: string;
  estimated_hours: string;
  actual_hours: string;
};

function emptyTaskForm(): TaskFormState {
  return {
    project_id: '',
    milestone_id: '',
    title: '',
    description: '',
    due_date: '',
    priority: 'medium',
    status: 'todo',
    estimated_hours: '',
    actual_hours: ''
  };
}

function taskToForm(task: Task): TaskFormState {
  return {
    project_id: String(task.project_id),
    milestone_id: task.milestone_id ? String(task.milestone_id) : '',
    title: task.title,
    description: task.description ?? '',
    due_date: task.due_date ?? '',
    priority: task.priority ?? 'medium',
    status: task.status ?? 'todo',
    estimated_hours: task.estimated_hours == null ? '' : String(task.estimated_hours),
    actual_hours: task.actual_hours == null ? '' : String(task.actual_hours)
  };
}

export function TasksPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [form, setForm] = useState<TaskFormState>(emptyTaskForm());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [projectFilter, setProjectFilter] = useState('');

  async function loadData() {
    const [projectItems, milestoneItems, taskItems] = await Promise.all([
      projectsApi.list(),
      milestonesApi.list(),
      tasksApi.list()
    ]);
    setProjects(projectItems);
    setMilestones(milestoneItems);
    setTasks(taskItems);
  }

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const [projectItems, milestoneItems, taskItems] = await Promise.all([
          projectsApi.list(),
          milestonesApi.list(),
          tasksApi.list()
        ]);
        if (alive) {
          setProjects(projectItems);
          setMilestones(milestoneItems);
          setTasks(taskItems);
          if (projectItems[0]) {
            setForm((current) => ({ ...current, project_id: current.project_id || String(projectItems[0].id) }));
          }
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

  const visibleTasks = useMemo(() => {
    if (!projectFilter) {
      return tasks;
    }
    return tasks.filter((task) => String(task.project_id) === projectFilter);
  }, [tasks, projectFilter]);

  const milestoneOptions = useMemo(() => {
    if (!form.project_id) {
      return milestones;
    }
    return milestones.filter((milestone) => String(milestone.project_id) === form.project_id);
  }, [milestones, form.project_id]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const payload = {
      project_id: Number(form.project_id),
      milestone_id: form.milestone_id ? Number(form.milestone_id) : null,
      title: form.title,
      description: form.description || null,
      due_date: form.due_date || null,
      priority: form.priority,
      status: form.status,
      estimated_hours: form.estimated_hours ? Number(form.estimated_hours) : null,
      actual_hours: form.actual_hours ? Number(form.actual_hours) : null
    };

    try {
      if (editingId) {
        await tasksApi.update(editingId, payload);
      } else {
        await tasksApi.create(payload);
      }
      await loadData();
      setForm(emptyTaskForm());
      setEditingId(null);
    } catch (err) {
      setError(extractApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function editTask(task: Task) {
    setEditingId(task.id);
    setForm(taskToForm(task));
  }

  async function removeTask(id: number) {
    if (!window.confirm('Delete this task?')) {
      return;
    }
    try {
      await tasksApi.remove(id);
      await loadData();
    } catch (err) {
      setError(extractApiErrorMessage(err));
    }
  }

  if (loading) {
    return (
      <div className="page">
        <Card className="section-card">
          <div className="spinner" />
          <p className="muted">Loading tasks...</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Tasks</h1>
          <p className="muted">Everything that still needs to happen.</p>
        </div>
        <Link className="btn btn-ghost" to="/projects">
          Organize by project
        </Link>
      </div>

      <div className="grid two">
        <Card className="section-card">
          <SectionHeader title={editingId ? 'Edit task' : 'Create task'} description="Use tasks to capture concrete next actions." />
          <form className="form-grid" onSubmit={handleSubmit}>
            <div className="form-grid cols-2">
              <Field label="Project">
                <select value={form.project_id} onChange={(event) => setForm({ ...form, project_id: event.target.value, milestone_id: '' })} required>
                  <option value="">Select a project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Milestone">
                <select value={form.milestone_id} onChange={(event) => setForm({ ...form, milestone_id: event.target.value })}>
                  <option value="">None</option>
                  {milestoneOptions.map((milestone) => (
                    <option key={milestone.id} value={milestone.id}>
                      {milestone.title}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Title">
              <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
            </Field>
            <Field label="Description">
              <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
            </Field>
            <div className="form-grid cols-2">
              <Field label="Due date">
                <input type="date" value={form.due_date} onChange={(event) => setForm({ ...form, due_date: event.target.value })} />
              </Field>
              <Field label="Status">
                <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                  <option value="todo">todo</option>
                  <option value="in_progress">in_progress</option>
                  <option value="blocked">blocked</option>
                  <option value="done">done</option>
                </select>
              </Field>
            </div>
            <div className="form-grid cols-2">
              <Field label="Priority">
                <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                  <option value="critical">critical</option>
                </select>
              </Field>
              <Field label="Estimated hours">
                <input type="number" min="0" step="0.25" value={form.estimated_hours} onChange={(event) => setForm({ ...form, estimated_hours: event.target.value })} />
              </Field>
            </div>
            <Field label="Actual hours">
              <input type="number" min="0" step="0.25" value={form.actual_hours} onChange={(event) => setForm({ ...form, actual_hours: event.target.value })} />
            </Field>
            {error ? <EmptyState title="Could not save task" description={error} /> : null}
            <div className="helper-row">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving...' : editingId ? 'Update task' : 'Create task'}
              </Button>
              {editingId ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setEditingId(null);
                    setForm(emptyTaskForm());
                  }}
                >
                  Cancel
                </Button>
              ) : null}
            </div>
          </form>
        </Card>

        <Card className="section-card">
          <SectionHeader title="Task list" description="Use the filter to focus on one project." />
          <div className="form-grid cols-2">
            <Field label="Project filter">
              <select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}>
                <option value="">All projects</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Hint">
              <input readOnly value="Overdue tasks appear in the dashboard" />
            </Field>
          </div>

          <div className="divider" />

          <div className="list-grid">
            {visibleTasks.length ? (
              visibleTasks.map((task) => {
                const project = projects.find((item) => item.id === task.project_id);
                return (
                  <div key={task.id} className="entity">
                    <div className="entity-top">
                      <div>
                        <h3 className="entity-title">{task.title}</h3>
                        <p className="muted">{task.description || 'No description yet.'}</p>
                      </div>
                      <Badge tone={task.status === 'done' ? 'success' : task.status === 'blocked' ? 'danger' : 'info'}>
                        {task.status}
                      </Badge>
                    </div>
                    <div className="entity-meta">
                      <Badge tone="neutral">{project?.name ?? `Project ${task.project_id}`}</Badge>
                      <Badge tone={relativeDueLabel(task.due_date).startsWith('Overdue') ? 'danger' : 'neutral'}>
                        {relativeDueLabel(task.due_date)}
                      </Badge>
                      <Badge tone="neutral">Due {formatDate(task.due_date)}</Badge>
                    </div>
                    <div className="entity-actions">
                      <Button variant="secondary" onClick={() => editTask(task)}>
                        Edit
                      </Button>
                      <Button variant="danger" onClick={() => void removeTask(task.id)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                );
              })
            ) : (
              <EmptyState title="No tasks found" description="Create a task or clear the filter." />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
