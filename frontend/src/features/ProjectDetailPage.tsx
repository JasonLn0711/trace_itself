'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  MetricPill,
  MiniBarChart,
  Notice,
  PageIntro,
  ProgressBar,
  SectionHeader
} from '../components/Primitives';
import { useConfirmationDialog } from '../components/ConfirmationDialog';
import { extractApiErrorMessage, milestonesApi, projectsApi, tasksApi } from '../lib/api';
import { clampPercent, formatDate, relativeDueLabel } from '../lib/dates';
import {
  formatEnumLabel,
  getDueState,
  sortMilestonesForAttention,
  sortTasksForAttention,
  toneForDueState,
  toneForMilestoneStatus,
  toneForPriority,
  toneForProjectStatus,
  toneForTaskStatus
} from '../lib/presentation';
import type { Milestone, Project, Task } from '../types';

type MilestoneFormState = {
  title: string;
  description: string;
  due_date: string;
  status: string;
  progress: string;
};

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

function milestoneToForm(milestone: Milestone): MilestoneFormState {
  return {
    title: milestone.title,
    description: milestone.description ?? '',
    due_date: milestone.due_date ?? '',
    status: milestone.status ?? 'active',
    progress: String(milestone.progress ?? 0)
  };
}

function emptyMilestoneForm(): MilestoneFormState {
  return {
    title: '',
    description: '',
    due_date: '',
    status: 'active',
    progress: '0'
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

function emptyTaskForm(projectId: number): TaskFormState {
  return {
    project_id: String(projectId),
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

export function ProjectDetailPage({ projectId }: { projectId: number }) {
  const { confirm, confirmationDialog } = useConfirmationDialog();
  const [project, setProject] = useState<Project | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectError, setProjectError] = useState('');
  const [notice, setNotice] = useState('');
  const [milestoneForm, setMilestoneForm] = useState<MilestoneFormState>(emptyMilestoneForm());
  const [taskForm, setTaskForm] = useState<TaskFormState>(emptyTaskForm(projectId));
  const [editingMilestoneId, setEditingMilestoneId] = useState<number | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [savingProject, setSavingProject] = useState(false);
  const [savingMilestone, setSavingMilestone] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [actingTaskId, setActingTaskId] = useState<number | null>(null);
  const [error, setError] = useState('');

  async function loadAll() {
    const [projectData, milestoneData, taskData] = await Promise.all([
      projectsApi.get(projectId),
      milestonesApi.list({ project_id: projectId }),
      tasksApi.list({ project_id: projectId })
    ]);
    setProject(projectData);
    setMilestones(milestoneData);
    setTasks(taskData);
    setTaskForm((current) => ({ ...current, project_id: String(projectId) }));
  }

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const [projectData, milestoneData, taskData] = await Promise.all([
          projectsApi.get(projectId),
          milestonesApi.list({ project_id: projectId }),
          tasksApi.list({ project_id: projectId })
        ]);
        if (alive) {
          setProject(projectData);
          setMilestones(milestoneData);
          setTasks(taskData);
          setTaskForm(emptyTaskForm(projectId));
        }
      } catch (err) {
        if (alive) {
          setProjectError(extractApiErrorMessage(err));
        }
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    }

    if (Number.isFinite(projectId)) {
      void load();
    } else {
      setLoading(false);
      setProjectError('Invalid project id.');
    }

    return () => {
      alive = false;
    };
  }, [projectId]);

  const milestoneOptions = useMemo(
    () => sortMilestonesForAttention(milestones).map((milestone) => ({ id: milestone.id, title: milestone.title })),
    [milestones]
  );
  const orderedMilestones = useMemo(() => sortMilestonesForAttention(milestones), [milestones]);
  const orderedTasks = useMemo(() => sortTasksForAttention(tasks), [tasks]);
  const completedTaskCount = tasks.filter((task) => task.status === 'done').length;
  const blockedCount = tasks.filter((task) => task.status === 'blocked').length;
  const overdueCount = tasks.filter((task) => getDueState(task.due_date) === 'overdue' && task.status !== 'done').length;
  const projectCompletion = tasks.length ? Math.round((completedTaskCount / tasks.length) * 100) : 0;
  const totalEstimatedHours = tasks.reduce((sum, task) => sum + (task.estimated_hours ?? 0), 0);
  const totalActualHours = tasks.reduce((sum, task) => sum + (task.actual_hours ?? 0), 0);
  const taskStatusBreakdown = useMemo(() => {
    const base = [
      { status: 'todo', count: 0 },
      { status: 'in_progress', count: 0 },
      { status: 'blocked', count: 0 },
      { status: 'done', count: 0 }
    ];
    tasks.forEach((task) => {
      const entry = base.find((item) => item.status === task.status);
      if (entry) {
        entry.count += 1;
      }
    });
    return base;
  }, [tasks]);

  async function refresh() {
    await loadAll();
  }

  async function handleProjectSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project) {
      return;
    }

    setSavingProject(true);
    setError('');
    setNotice('');
    try {
      await projectsApi.update(project.id, {
        name: project.name,
        description: project.description || null,
        priority: project.priority,
        status: project.status,
        start_date: project.start_date || null,
        target_date: project.target_date || null
      });
      await refresh();
      setNotice('Project details updated.');
    } catch (err) {
      setError(extractApiErrorMessage(err));
    } finally {
      setSavingProject(false);
    }
  }

  async function handleMilestoneSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingMilestone(true);
    setError('');
    setNotice('');

    const payload = {
      project_id: projectId,
      title: milestoneForm.title,
      description: milestoneForm.description || null,
      due_date: milestoneForm.due_date || null,
      status: milestoneForm.status,
      progress: Number(milestoneForm.progress || 0)
    };

    try {
      if (editingMilestoneId) {
        await milestonesApi.update(editingMilestoneId, payload);
        setNotice('Milestone updated.');
      } else {
        await milestonesApi.create(payload);
        setNotice('Milestone created.');
      }
      setMilestoneForm(emptyMilestoneForm());
      setEditingMilestoneId(null);
      await refresh();
    } catch (err) {
      setError(extractApiErrorMessage(err));
    } finally {
      setSavingMilestone(false);
    }
  }

  async function handleTaskSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingTask(true);
    setError('');
    setNotice('');

    const payload = {
      project_id: Number(taskForm.project_id),
      milestone_id: taskForm.milestone_id ? Number(taskForm.milestone_id) : null,
      title: taskForm.title,
      description: taskForm.description || null,
      due_date: taskForm.due_date || null,
      priority: taskForm.priority,
      status: taskForm.status,
      estimated_hours: taskForm.estimated_hours ? Number(taskForm.estimated_hours) : null,
      actual_hours: taskForm.actual_hours ? Number(taskForm.actual_hours) : null
    };

    try {
      if (editingTaskId) {
        await tasksApi.update(editingTaskId, payload);
        setNotice('Task updated.');
      } else {
        await tasksApi.create(payload);
        setNotice('Task created.');
      }
      setTaskForm(emptyTaskForm(projectId));
      setEditingTaskId(null);
      await refresh();
    } catch (err) {
      setError(extractApiErrorMessage(err));
    } finally {
      setSavingTask(false);
    }
  }

  function editMilestone(milestone: Milestone) {
    setEditingMilestoneId(milestone.id);
    setMilestoneForm(milestoneToForm(milestone));
    setError('');
    setNotice('');
  }

  function editTask(task: Task) {
    setEditingTaskId(task.id);
    setTaskForm(taskToForm(task));
    setError('');
    setNotice('');
  }

  async function removeMilestone(milestone: Milestone) {
    const confirmed = await confirm({
      title: `Delete milestone "${milestone.title}"?`,
      description: 'This milestone and its related task links will be removed.',
      confirmLabel: 'Delete milestone'
    });
    if (!confirmed) {
      return;
    }
    setError('');
    setNotice('');
    try {
      await milestonesApi.remove(milestone.id);
      if (editingMilestoneId === milestone.id) {
        setEditingMilestoneId(null);
        setMilestoneForm(emptyMilestoneForm());
      }
      await refresh();
      setNotice('Milestone deleted.');
    } catch (err) {
      setError(extractApiErrorMessage(err));
    }
  }

  async function removeTask(task: Task) {
    const confirmed = await confirm({
      title: `Delete task "${task.title}"?`,
      description: 'This task will be removed from the project.',
      confirmLabel: 'Delete task'
    });
    if (!confirmed) {
      return;
    }
    setError('');
    setNotice('');
    try {
      await tasksApi.remove(task.id);
      if (editingTaskId === task.id) {
        setEditingTaskId(null);
        setTaskForm(emptyTaskForm(projectId));
      }
      await refresh();
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
      await refresh();
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
          <p className="muted">Loading project detail...</p>
        </Card>
      </div>
    );
  }

  if (projectError || !project) {
    return (
      <div className="page">
        <Card className="section-card">
          <EmptyState title="Project unavailable" description={projectError || 'Could not load this project.'} />
          <Link className="btn btn-primary" href="/projects">
            Back to projects
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="page">
      {confirmationDialog}
      <PageIntro
        title={project.name}
        description={project.description || undefined}
        actions={
          <>
            <Link className="btn btn-primary" href="/projects">Projects</Link>
            <Link className="btn btn-ghost" href="/tasks">Tasks</Link>
          </>
        }
        aside={
          <div className="metric-strip">
            <MetricPill label="Completion" value={`${projectCompletion}%`} tone={projectCompletion >= 80 ? 'success' : 'info'} />
            <MetricPill label="Overdue tasks" value={overdueCount} tone={overdueCount ? 'danger' : 'success'} />
            <MetricPill label="Blocked" value={blockedCount} tone={blockedCount ? 'warning' : 'neutral'} />
            <MetricPill label="Hours" value={`${totalActualHours.toFixed(1)}/${totalEstimatedHours.toFixed(1)}`} tone="neutral" />
          </div>
        }
      />

      {error ? <Notice title="Could not update this project" description={error} tone="danger" /> : null}
      {notice ? <Notice title={notice} tone="success" /> : null}

      <div className="grid three">
        <Card className="section-card">
          <SectionHeader title="Progress" />
          <ProgressBar
            label="Done"
            value={projectCompletion}
            caption={tasks.length ? `${completedTaskCount}/${tasks.length} tasks complete` : 'No tasks yet'}
            tone={projectCompletion >= 80 ? 'success' : projectCompletion >= 50 ? 'info' : 'warning'}
          />
        </Card>

        <Card className="section-card">
          <SectionHeader title="Task mix" />
          <MiniBarChart values={taskStatusBreakdown.map((item) => item.count)} labels={taskStatusBreakdown.map((item) => item.status.slice(0, 3).toUpperCase())} />
        </Card>

        <Card className="section-card">
          <SectionHeader title="Milestones" />
          <div className="stack">
            {orderedMilestones.slice(0, 3).length ? (
              orderedMilestones.slice(0, 3).map((milestone) => (
                <ProgressBar
                  key={milestone.id}
                  label={milestone.title}
                  value={clampPercent(milestone.progress)}
                  caption={relativeDueLabel(milestone.due_date)}
                  tone={toneForMilestoneStatus(milestone.status)}
                />
              ))
            ) : (
              <EmptyState title="No milestones yet" description="Add one to mark progress." />
            )}
          </div>
        </Card>
      </div>

      <Card className="section-card">
        <SectionHeader title="Project" />
        <form className="form-grid" onSubmit={handleProjectSubmit}>
          <div className="form-grid cols-2">
            <Field label="Name">
              <input value={project.name} onChange={(event) => setProject({ ...project, name: event.target.value })} />
            </Field>
            <Field label="Status">
              <select value={project.status} onChange={(event) => setProject({ ...project, status: event.target.value })}>
                <option value="planned">Planned</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
              </select>
            </Field>
          </div>
          <Field label="Description">
            <textarea value={project.description ?? ''} onChange={(event) => setProject({ ...project, description: event.target.value })} placeholder="Short note" />
          </Field>
          <div className="form-grid cols-2">
            <Field label="Priority">
              <select value={project.priority} onChange={(event) => setProject({ ...project, priority: event.target.value })}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </Field>
            <Field label="Target date">
              <input type="date" value={project.target_date ?? ''} onChange={(event) => setProject({ ...project, target_date: event.target.value || null })} />
            </Field>
          </div>
          <div className="form-grid cols-2">
            <Field label="Start date">
              <input type="date" value={project.start_date ?? ''} onChange={(event) => setProject({ ...project, start_date: event.target.value || null })} />
            </Field>
            <Field label="Last updated">
              <input value={formatDate(project.updated_at)} readOnly />
            </Field>
          </div>
          <div className="entity-meta">
            <Badge tone={toneForProjectStatus(project.status)}>{formatEnumLabel(project.status)}</Badge>
            <Badge tone={toneForPriority(project.priority)}>{formatEnumLabel(project.priority)}</Badge>
          </div>
          <Button type="submit" disabled={savingProject}>
            {savingProject ? 'Saving...' : 'Save project'}
          </Button>
        </form>
      </Card>

      <div className="grid two">
        <Card className="section-card">
          <SectionHeader title={editingMilestoneId ? 'Edit milestone' : 'New milestone'} />
          <form className="form-grid" onSubmit={handleMilestoneSubmit}>
            <Field label="Title">
              <input value={milestoneForm.title} onChange={(event) => setMilestoneForm({ ...milestoneForm, title: event.target.value })} required />
            </Field>
            <Field label="Description">
                <textarea
                  value={milestoneForm.description}
                  onChange={(event) => setMilestoneForm({ ...milestoneForm, description: event.target.value })}
                  placeholder="Short note"
                />
              </Field>
            <div className="form-grid cols-2">
              <Field label="Due date">
                <input type="date" value={milestoneForm.due_date} onChange={(event) => setMilestoneForm({ ...milestoneForm, due_date: event.target.value })} />
              </Field>
              <Field label="Status">
                <select value={milestoneForm.status} onChange={(event) => setMilestoneForm({ ...milestoneForm, status: event.target.value })}>
                  <option value="planned">Planned</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                </select>
              </Field>
            </div>
            <Field label="Progress %">
              <input type="number" min="0" max="100" value={milestoneForm.progress} onChange={(event) => setMilestoneForm({ ...milestoneForm, progress: event.target.value })} />
            </Field>
            <div className="helper-row">
              <Button type="submit" disabled={savingMilestone}>
                {savingMilestone ? 'Saving...' : editingMilestoneId ? 'Update milestone' : 'Create milestone'}
              </Button>
              {editingMilestoneId ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setEditingMilestoneId(null);
                    setMilestoneForm(emptyMilestoneForm());
                  }}
                >
                  Cancel edit
                </Button>
              ) : null}
            </div>
          </form>

          <div className="divider" />

          <div className="list-table">
            {orderedMilestones.length ? (
              orderedMilestones.map((milestone) => (
                <div key={milestone.id} className="list-row">
                  <div className="list-row-main">
                    <div className="list-row-header">
                      <h3 className="list-row-title line-clamp-1">{milestone.title}</h3>
                      <div className="list-row-meta">
                        <Badge tone={toneForMilestoneStatus(milestone.status)}>{formatEnumLabel(milestone.status)}</Badge>
                        <Badge tone={toneForDueState(milestone.due_date)}>{relativeDueLabel(milestone.due_date)}</Badge>
                      </div>
                    </div>
                    <div className="list-row-copy line-clamp-1">
                      {milestone.description || 'No note'} · {formatDate(milestone.due_date)}
                    </div>
                    <div className="list-row-progress">
                      <ProgressBar
                        label="Progress"
                        value={clampPercent(milestone.progress)}
                        caption={`${clampPercent(milestone.progress)}%`}
                        tone={toneForMilestoneStatus(milestone.status)}
                      />
                    </div>
                  </div>
                  <div className="list-row-actions">
                    <Button variant="secondary" onClick={() => editMilestone(milestone)}>
                      Edit
                    </Button>
                    <Button variant="danger" onClick={() => void removeMilestone(milestone)}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState title="No milestones yet" description="Add the first one." />
            )}
          </div>
        </Card>

        <Card className="section-card">
          <SectionHeader title={editingTaskId ? 'Edit task' : 'New task'} />
          <form className="form-grid" onSubmit={handleTaskSubmit}>
            <div className="form-grid cols-2">
              <Field label="Milestone">
                <select value={taskForm.milestone_id} onChange={(event) => setTaskForm({ ...taskForm, milestone_id: event.target.value })}>
                  <option value="">None</option>
                  {milestoneOptions.map((milestone) => (
                    <option key={milestone.id} value={milestone.id}>
                      {milestone.title}
                    </option>
                  ))}
                  </select>
                </Field>
                <Field label="Status">
                <select value={taskForm.status} onChange={(event) => setTaskForm({ ...taskForm, status: event.target.value })}>
                  <option value="todo">To do</option>
                  <option value="in_progress">In progress</option>
                  <option value="blocked">Blocked</option>
                  <option value="done">Done</option>
                </select>
                </Field>
              </div>
            <Field label="Title">
              <input value={taskForm.title} onChange={(event) => setTaskForm({ ...taskForm, title: event.target.value })} required />
            </Field>
            <Field label="Description">
              <textarea
                value={taskForm.description}
                onChange={(event) => setTaskForm({ ...taskForm, description: event.target.value })}
                placeholder="Short note"
              />
            </Field>
            <div className="form-grid cols-2">
              <Field label="Due date">
                <input type="date" value={taskForm.due_date} onChange={(event) => setTaskForm({ ...taskForm, due_date: event.target.value })} />
              </Field>
              <Field label="Priority">
                <select value={taskForm.priority} onChange={(event) => setTaskForm({ ...taskForm, priority: event.target.value })}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </Field>
            </div>
            <div className="form-grid cols-2">
              <Field label="Estimated hours">
                <input type="number" min="0" step="0.25" value={taskForm.estimated_hours} onChange={(event) => setTaskForm({ ...taskForm, estimated_hours: event.target.value })} />
              </Field>
              <Field label="Actual hours">
                <input type="number" min="0" step="0.25" value={taskForm.actual_hours} onChange={(event) => setTaskForm({ ...taskForm, actual_hours: event.target.value })} />
              </Field>
            </div>
            <div className="helper-row">
              <Button type="submit" disabled={savingTask}>
                {savingTask ? 'Saving...' : editingTaskId ? 'Update task' : 'Create task'}
              </Button>
              {editingTaskId ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setEditingTaskId(null);
                    setTaskForm(emptyTaskForm(projectId));
                  }}
                >
                  Cancel edit
                </Button>
              ) : null}
            </div>
          </form>

          <div className="divider" />

          <div className="list-table">
            {orderedTasks.length ? (
              orderedTasks.map((task) => {
                const milestoneName = task.milestone_id ? milestones.find((item) => item.id === task.milestone_id)?.title : null;
                return (
                  <div key={task.id} className="list-row">
                    <div className="list-row-main">
                      <div className="list-row-header">
                        <h3 className="list-row-title line-clamp-1">{task.title}</h3>
                        <div className="list-row-meta">
                          <Badge tone={toneForTaskStatus(task.status)}>{formatEnumLabel(task.status)}</Badge>
                          <Badge tone={toneForPriority(task.priority)}>{formatEnumLabel(task.priority)}</Badge>
                          <Badge tone={toneForDueState(task.due_date)}>{relativeDueLabel(task.due_date)}</Badge>
                        </div>
                      </div>
                      <div className="list-row-copy line-clamp-1">
                        {milestoneName ? `${milestoneName} · ` : ''}
                        {formatDate(task.due_date)} · {task.estimated_hours ?? 0}h / {task.actual_hours ?? 0}h
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
              <EmptyState title="No tasks yet" description="Add the first one." />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
