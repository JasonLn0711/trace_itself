'use client';

import { FormEvent, useDeferredValue, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  MetricPill,
  Notice,
  PageIntro,
  SectionHeader,
  SegmentedControl
} from '../components/Primitives';
import { useConfirmationDialog } from '../components/ConfirmationDialog';
import { extractApiErrorMessage, milestonesApi, projectsApi, tasksApi } from '../lib/api';
import { formatDate, relativeDueLabel } from '../lib/dates';
import {
  formatEnumLabel,
  getDueState,
  shortDueLabel,
  sortTasksForAttention,
  toneForDueState,
  toneForPriority,
  toneForTaskStatus
} from '../lib/presentation';
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

function emptyTaskForm(defaultProjectId = ''): TaskFormState {
  return {
    project_id: defaultProjectId,
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

function taskToPayload(task: Task, status = task.status) {
  return {
    project_id: task.project_id,
    milestone_id: task.milestone_id,
    title: task.title,
    description: task.description,
    due_date: task.due_date,
    priority: task.priority,
    status,
    estimated_hours: task.estimated_hours,
    actual_hours: task.actual_hours
  };
}

type QueueFilter = 'attention' | 'in_progress' | 'blocked' | 'done' | 'all';

export function TasksPage() {
  const { confirm, confirmationDialog } = useConfirmationDialog();
  const [projects, setProjects] = useState<Project[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [form, setForm] = useState<TaskFormState>(emptyTaskForm());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actingTaskId, setActingTaskId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('attention');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

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
          const defaultProjectId = projectItems[0] ? String(projectItems[0].id) : '';
          setForm((current) => (current.project_id ? current : emptyTaskForm(defaultProjectId)));
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

  useEffect(() => {
    if (editingId) {
      return;
    }
    const defaultProjectId = projectFilter || (projects[0] ? String(projects[0].id) : '');
    setForm((current) => {
      if (current.project_id === defaultProjectId) {
        return current;
      }
      return { ...current, project_id: defaultProjectId, milestone_id: '' };
    });
  }, [editingId, projectFilter, projects]);

  const milestoneOptions = useMemo(() => {
    if (!form.project_id) {
      return milestones;
    }
    return milestones.filter((milestone) => String(milestone.project_id) === form.project_id);
  }, [milestones, form.project_id]);

  const visibleTasks = useMemo(() => {
    let items = sortTasksForAttention(tasks);

    if (projectFilter) {
      items = items.filter((task) => String(task.project_id) === projectFilter);
    }

    if (deferredSearch) {
      items = items.filter((task) => {
        const milestoneName = task.milestone_id
          ? milestones.find((item) => item.id === task.milestone_id)?.title ?? ''
          : '';
        const projectName = projects.find((item) => item.id === task.project_id)?.name ?? '';
        return [task.title, task.description ?? '', milestoneName, projectName]
          .join(' ')
          .toLowerCase()
          .includes(deferredSearch);
      });
    }

    switch (queueFilter) {
      case 'attention':
        items = items.filter((task) => {
          const dueState = getDueState(task.due_date);
          return task.status !== 'done' && (task.status === 'blocked' || dueState === 'overdue' || dueState === 'today' || dueState === 'soon');
        });
        break;
      case 'in_progress':
        items = items.filter((task) => task.status === 'in_progress');
        break;
      case 'blocked':
        items = items.filter((task) => task.status === 'blocked');
        break;
      case 'done':
        items = items.filter((task) => task.status === 'done');
        break;
      case 'all':
      default:
        break;
    }

    return items;
  }, [deferredSearch, milestones, projectFilter, projects, queueFilter, tasks]);

  const overdueCount = tasks.filter((task) => getDueState(task.due_date) === 'overdue' && task.status !== 'done').length;
  const inProgressCount = tasks.filter((task) => task.status === 'in_progress').length;
  const blockedCount = tasks.filter((task) => task.status === 'blocked').length;
  const doneCount = tasks.filter((task) => task.status === 'done').length;

  const queueOptions = [
    { value: 'attention', label: 'Needs attention', count: tasks.filter((task) => task.status !== 'done' && (task.status === 'blocked' || ['overdue', 'today', 'soon'].includes(getDueState(task.due_date)))).length },
    { value: 'in_progress', label: 'In progress', count: inProgressCount },
    { value: 'blocked', label: 'Blocked', count: blockedCount },
    { value: 'done', label: 'Done', count: doneCount },
    { value: 'all', label: 'All', count: tasks.length }
  ] satisfies Array<{ value: QueueFilter; label: string; count: number }>;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');

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
        setNotice('Task updated.');
      } else {
        await tasksApi.create(payload);
        setNotice('Task created.');
      }
      await loadData();
      const defaultProjectId = projectFilter || String(payload.project_id);
      setForm(emptyTaskForm(defaultProjectId));
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
    setNotice('');
    setError('');
  }

  async function removeTask(task: Task) {
    const confirmed = await confirm({
      title: `Delete "${task.title}"?`,
      description: 'This task will be removed from your queue.',
      confirmLabel: 'Delete task'
    });
    if (!confirmed) {
      return;
    }

    setError('');
    setNotice('');
    try {
      await tasksApi.remove(task.id);
      if (editingId === task.id) {
        setEditingId(null);
        setForm(emptyTaskForm(projectFilter || (projects[0] ? String(projects[0].id) : '')));
      }
      await loadData();
      setNotice('Task deleted.');
    } catch (err) {
      setError(extractApiErrorMessage(err));
    }
  }

  async function changeTaskStatus(task: Task, status: string) {
    setActingTaskId(task.id);
    setError('');
    setNotice('');
    try {
      await tasksApi.update(task.id, taskToPayload(task, status));
      await loadData();
      setNotice(`Task moved to ${formatEnumLabel(status)}.`);
    } catch (err) {
      setError(extractApiErrorMessage(err));
    } finally {
      setActingTaskId(null);
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

  const formDisabled = projects.length === 0;

  return (
    <div className="page">
      {confirmationDialog}
      <PageIntro
        title="Tasks"
        actions={
          <>
            <Link className="btn btn-primary" href="/projects">Projects</Link>
            <Link className="btn btn-ghost" href="/daily-logs">Daily Logs</Link>
          </>
        }
        aside={
          <div className="metric-strip">
            <MetricPill label="Overdue" value={overdueCount} tone={overdueCount ? 'danger' : 'success'} />
            <MetricPill label="In progress" value={inProgressCount} tone="info" />
            <MetricPill label="Blocked" value={blockedCount} tone={blockedCount ? 'warning' : 'neutral'} />
            <MetricPill label="Done" value={doneCount} tone="success" />
          </div>
        }
      />

      {error ? <Notice title="Could not update tasks" description={error} tone="danger" /> : null}
      {notice ? <Notice title={notice} tone="success" /> : null}

      <div className="grid two">
        <Card className="section-card">
          <SectionHeader title={editingId ? 'Edit' : 'New'} />
          {formDisabled ? (
            <EmptyState
              title="Create a project first"
              description="Tasks need a project."
              action={<Link className="btn btn-primary" href="/projects">Create project</Link>}
            />
          ) : (
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
                <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Task title" required />
              </Field>

              <Field label="Description">
                <textarea
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  placeholder="Short note"
                />
              </Field>

              <div className="form-grid cols-2">
                <Field label="Due date">
                  <input type="date" value={form.due_date} onChange={(event) => setForm({ ...form, due_date: event.target.value })} />
                </Field>
                <Field label="Status">
                  <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                    <option value="todo">To do</option>
                    <option value="in_progress">In progress</option>
                    <option value="blocked">Blocked</option>
                    <option value="done">Done</option>
                  </select>
                </Field>
              </div>

              <div className="form-grid cols-2">
                <Field label="Priority">
                  <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </Field>
                <Field label="Estimated hours">
                  <input type="number" min="0" step="0.25" value={form.estimated_hours} onChange={(event) => setForm({ ...form, estimated_hours: event.target.value })} />
                </Field>
              </div>

              <Field label="Actual hours">
                <input type="number" min="0" step="0.25" value={form.actual_hours} onChange={(event) => setForm({ ...form, actual_hours: event.target.value })} />
              </Field>

              <div className="helper-row">
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving...' : editingId ? 'Update task' : 'Create task'}
                </Button>
                {editingId ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setEditingId(null);
                      setForm(emptyTaskForm(projectFilter || (projects[0] ? String(projects[0].id) : '')));
                    }}
                  >
                    Cancel edit
                  </Button>
                ) : null}
              </div>
            </form>
          )}
        </Card>

        <Card className="section-card">
          <SectionHeader title="Queue" />

          <div className="toolbar">
            <SegmentedControl label="Task queue filter" value={queueFilter} onChange={(value) => setQueueFilter(value as QueueFilter)} options={queueOptions} />
            <div className="toolbar-row">
              <Field label="Search">
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find task" />
              </Field>
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
            </div>
          </div>

          <div className="divider" />

          <div className="list-table">
            {visibleTasks.length ? (
              visibleTasks.map((task) => {
                const project = projects.find((item) => item.id === task.project_id);
                const milestone = task.milestone_id ? milestones.find((item) => item.id === task.milestone_id) : null;
                return (
                  <div key={task.id} className="list-row">
                    <div className="list-row-main">
                      <div className="list-row-header">
                        <h3 className="list-row-title line-clamp-1">{task.title}</h3>
                        <div className="list-row-meta">
                          <Badge tone={toneForTaskStatus(task.status)}>{formatEnumLabel(task.status)}</Badge>
                          <Badge tone={toneForPriority(task.priority)}>{formatEnumLabel(task.priority)}</Badge>
                          <Badge tone={toneForDueState(task.due_date)}>{shortDueLabel(task.due_date)}</Badge>
                        </div>
                      </div>
                      <div className="list-row-copy line-clamp-1">
                        {(project?.name ?? `Project ${task.project_id}`)}
                        {milestone ? ` · ${milestone.title}` : ''}
                        {` · ${formatDate(task.due_date)}`}
                        {` · ${relativeDueLabel(task.due_date)}`}
                        {` · ${task.estimated_hours ?? 0}h / ${task.actual_hours ?? 0}h`}
                      </div>
                    </div>
                    <div className="list-row-actions">
                      {task.status !== 'in_progress' ? (
                        <Button variant="secondary" disabled={actingTaskId === task.id} onClick={() => void changeTaskStatus(task, 'in_progress')}>
                          Start
                        </Button>
                      ) : null}
                      {task.status !== 'done' ? (
                        <Button disabled={actingTaskId === task.id} onClick={() => void changeTaskStatus(task, 'done')}>
                          Mark done
                        </Button>
                      ) : null}
                      {task.status !== 'blocked' ? (
                        <Button variant="ghost" disabled={actingTaskId === task.id} onClick={() => void changeTaskStatus(task, 'blocked')}>
                          Blocked
                        </Button>
                      ) : null}
                      <Button variant="secondary" onClick={() => editTask(task)}>
                        Edit
                      </Button>
                      <Button variant="danger" onClick={() => void removeTask(task)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                );
              })
            ) : (
              <EmptyState
                title="No tasks match this view"
                description="Clear a filter or add one."
              />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
