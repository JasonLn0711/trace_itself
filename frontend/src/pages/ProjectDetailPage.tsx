import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, Field, SectionHeader } from '../components/Primitives';
import { extractApiErrorMessage, milestonesApi, projectsApi, tasksApi } from '../lib/api';
import { clampPercent, formatDate, relativeDueLabel } from '../lib/dates';
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
    estimated_hours: task.estimated_hours === null || task.estimated_hours === undefined ? '' : String(task.estimated_hours),
    actual_hours: task.actual_hours === null || task.actual_hours === undefined ? '' : String(task.actual_hours)
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

export function ProjectDetailPage() {
  const { id } = useParams();
  const projectId = Number(id);
  const [project, setProject] = useState<Project | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectError, setProjectError] = useState('');
  const [milestoneForm, setMilestoneForm] = useState<MilestoneFormState>(emptyMilestoneForm());
  const [taskForm, setTaskForm] = useState<TaskFormState>(emptyTaskForm(projectId));
  const [editingMilestoneId, setEditingMilestoneId] = useState<number | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [savingMilestone, setSavingMilestone] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
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
      setProjectError('Invalid project id');
    }
    return () => {
      alive = false;
    };
  }, [projectId]);

  const milestoneOptions = useMemo(() => milestones.map((milestone) => ({ id: milestone.id, title: milestone.title })), [milestones]);

  async function refresh() {
    await loadAll();
  }

  async function handleProjectSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project) {
      return;
    }
    setError('');
    try {
      await projectsApi.update(project.id, {
        name: project.name,
        description: project.description,
        priority: project.priority,
        status: project.status,
        start_date: project.start_date,
        target_date: project.target_date
      });
      await refresh();
    } catch (err) {
      setError(extractApiErrorMessage(err));
    }
  }

  async function handleMilestoneSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingMilestone(true);
    setError('');
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
      } else {
        await milestonesApi.create(payload);
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
      } else {
        await tasksApi.create(payload);
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
  }

  function editTask(task: Task) {
    setEditingTaskId(task.id);
    setTaskForm(taskToForm(task));
  }

  async function removeMilestone(idToRemove: number) {
    if (!window.confirm('Delete this milestone?')) {
      return;
    }
    try {
      await milestonesApi.remove(idToRemove);
      if (editingMilestoneId === idToRemove) {
        setEditingMilestoneId(null);
        setMilestoneForm(emptyMilestoneForm());
      }
      await refresh();
    } catch (err) {
      setError(extractApiErrorMessage(err));
    }
  }

  async function removeTask(idToRemove: number) {
    if (!window.confirm('Delete this task?')) {
      return;
    }
    try {
      await tasksApi.remove(idToRemove);
      if (editingTaskId === idToRemove) {
        setEditingTaskId(null);
        setTaskForm(emptyTaskForm(projectId));
      }
      await refresh();
    } catch (err) {
      setError(extractApiErrorMessage(err));
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
          <Link className="btn btn-primary" to="/projects">
            Back to projects
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{project.name}</h1>
          <p className="muted">{project.description || 'No description yet.'}</p>
        </div>
        <Link className="btn btn-ghost" to="/projects">
          Back to projects
        </Link>
      </div>

      <Card className="section-card">
        <SectionHeader title="Project details" description="Keep the high-level track current." />
        <form className="form-grid" onSubmit={handleProjectSubmit}>
          <div className="form-grid cols-2">
            <Field label="Name">
              <input value={project.name} onChange={(event) => setProject({ ...project, name: event.target.value })} />
            </Field>
              <Field label="Status">
                <select value={project.status} onChange={(event) => setProject({ ...project, status: event.target.value })}>
                  <option value="planned">planned</option>
                  <option value="active">active</option>
                  <option value="paused">paused</option>
                  <option value="completed">completed</option>
                  <option value="archived">archived</option>
                </select>
            </Field>
          </div>
          <Field label="Description">
            <textarea value={project.description ?? ''} onChange={(event) => setProject({ ...project, description: event.target.value })} />
          </Field>
          <div className="form-grid cols-2">
              <Field label="Priority">
                <select value={project.priority} onChange={(event) => setProject({ ...project, priority: event.target.value })}>
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                  <option value="critical">critical</option>
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
            <Field label="Updated">
              <input value={formatDate(project.updated_at)} readOnly />
            </Field>
          </div>
          {error ? <EmptyState title="Could not save item" description={error} /> : null}
          <Button type="submit">Save project</Button>
        </form>
      </Card>

      <div className="grid two">
        <Card className="section-card">
          <SectionHeader
            title={editingMilestoneId ? 'Edit milestone' : 'Add milestone'}
            description="Milestones break the project into measurable checkpoints."
          />
          <form className="form-grid" onSubmit={handleMilestoneSubmit}>
            <Field label="Title">
              <input value={milestoneForm.title} onChange={(event) => setMilestoneForm({ ...milestoneForm, title: event.target.value })} required />
            </Field>
            <Field label="Description">
              <textarea value={milestoneForm.description} onChange={(event) => setMilestoneForm({ ...milestoneForm, description: event.target.value })} />
            </Field>
            <div className="form-grid cols-2">
              <Field label="Due date">
                <input type="date" value={milestoneForm.due_date} onChange={(event) => setMilestoneForm({ ...milestoneForm, due_date: event.target.value })} />
              </Field>
              <Field label="Status">
                <select value={milestoneForm.status} onChange={(event) => setMilestoneForm({ ...milestoneForm, status: event.target.value })}>
                  <option value="planned">planned</option>
                  <option value="active">active</option>
                  <option value="completed">completed</option>
                </select>
              </Field>
            </div>
            <Field label="Progress %" hint="Keep this as a rough, honest estimate.">
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
                  Cancel
                </Button>
              ) : null}
            </div>
          </form>

          <div className="divider" />

          <div className="list-grid">
            {milestones.length ? (
              milestones.map((milestone) => (
                <div key={milestone.id} className="entity">
                  <div className="entity-top">
                    <div>
                      <h3 className="entity-title">{milestone.title}</h3>
                      <p className="muted">{milestone.description || 'No description yet.'}</p>
                    </div>
                    <Badge tone={milestone.status === 'completed' ? 'success' : milestone.status === 'active' ? 'info' : 'warning'}>
                      {relativeDueLabel(milestone.due_date)}
                    </Badge>
                  </div>
                  <div className="entity-meta">
                    <Badge tone="neutral">Progress {clampPercent(milestone.progress)}%</Badge>
                  </div>
                  <div className="entity-actions">
                    <Button variant="secondary" onClick={() => editMilestone(milestone)}>
                      Edit
                    </Button>
                    <Button variant="danger" onClick={() => void removeMilestone(milestone.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState title="No milestones yet" description="Add the first milestone to anchor this project." />
            )}
          </div>
        </Card>

        <Card className="section-card">
          <SectionHeader
            title={editingTaskId ? 'Edit task' : 'Add task'}
            description="Tasks are the day-to-day units of execution."
          />
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
                  <option value="todo">todo</option>
                  <option value="in_progress">in_progress</option>
                  <option value="blocked">blocked</option>
                  <option value="done">done</option>
                </select>
              </Field>
            </div>
            <Field label="Title">
              <input value={taskForm.title} onChange={(event) => setTaskForm({ ...taskForm, title: event.target.value })} required />
            </Field>
            <Field label="Description">
              <textarea value={taskForm.description} onChange={(event) => setTaskForm({ ...taskForm, description: event.target.value })} />
            </Field>
            <div className="form-grid cols-2">
              <Field label="Due date">
                <input type="date" value={taskForm.due_date} onChange={(event) => setTaskForm({ ...taskForm, due_date: event.target.value })} />
              </Field>
              <Field label="Priority">
                <select value={taskForm.priority} onChange={(event) => setTaskForm({ ...taskForm, priority: event.target.value })}>
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                  <option value="critical">critical</option>
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
                  Cancel
                </Button>
              ) : null}
            </div>
          </form>

          <div className="divider" />

          <div className="list-grid">
            {tasks.length ? (
              tasks.map((task) => (
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
                    <Badge tone="neutral">Priority {task.priority}</Badge>
                    <Badge tone={relativeDueLabel(task.due_date).startsWith('Overdue') ? 'danger' : 'neutral'}>
                      {relativeDueLabel(task.due_date)}
                    </Badge>
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
              ))
            ) : (
              <EmptyState title="No tasks yet" description="Add the first task to move this project forward." />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
