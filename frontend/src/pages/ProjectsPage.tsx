import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, Field, SectionHeader } from '../components/Primitives';
import { extractApiErrorMessage, projectsApi } from '../lib/api';
import { formatDate } from '../lib/dates';
import type { Project } from '../types';

type ProjectFormState = {
  name: string;
  description: string;
  priority: string;
  status: string;
  start_date: string;
  target_date: string;
};

const defaultProjectForm = (): ProjectFormState => ({
  name: '',
  description: '',
  priority: 'medium',
  status: 'active',
  start_date: '',
  target_date: ''
});

function projectToForm(project: Project): ProjectFormState {
  return {
    name: project.name,
    description: project.description ?? '',
    priority: project.priority ?? 'medium',
    status: project.status ?? 'active',
    start_date: project.start_date ?? '',
    target_date: project.target_date ?? ''
  };
}

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [form, setForm] = useState<ProjectFormState>(defaultProjectForm());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function loadProjects() {
    const items = await projectsApi.list();
    setProjects(items);
  }

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const items = await projectsApi.list();
        if (alive) {
          setProjects(items);
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

  const activeProjects = useMemo(
    () => projects.filter((project) => project.status !== 'completed' && project.status !== 'archived'),
    [projects]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');

    const payload = {
      ...form,
      description: form.description || null,
      start_date: form.start_date || null,
      target_date: form.target_date || null
    };

    try {
      if (editingId) {
        await projectsApi.update(editingId, payload);
      } else {
        await projectsApi.create(payload);
      }
      await loadProjects();
      setForm(defaultProjectForm());
      setEditingId(null);
    } catch (err) {
      setError(extractApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function editProject(project: Project) {
    setEditingId(project.id);
    setForm(projectToForm(project));
  }

  async function removeProject(id: number) {
    const confirmed = window.confirm('Delete this project and its nested items?');
    if (!confirmed) {
      return;
    }
    try {
      await projectsApi.remove(id);
      if (editingId === id) {
        setEditingId(null);
        setForm(defaultProjectForm());
      }
      await loadProjects();
    } catch (err) {
      setError(extractApiErrorMessage(err));
    }
  }

  if (loading) {
    return (
      <div className="page">
        <Card className="section-card">
          <div className="spinner" />
          <p className="muted">Loading projects...</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Projects</h1>
          <p className="muted">Track long-horizon work, one project at a time.</p>
        </div>
      </div>

      <div className="grid two">
        <Card className="section-card">
          <SectionHeader title={editingId ? 'Edit project' : 'Create project'} description="Use one project per learning track or initiative." />
          <form className="form-grid" onSubmit={handleSubmit}>
            <Field label="Name">
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
            </Field>
            <Field label="Description">
              <textarea
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="What is this project about?"
              />
            </Field>
            <div className="form-grid cols-2">
              <Field label="Priority">
                <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                  <option value="critical">critical</option>
                </select>
              </Field>
              <Field label="Status">
                <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                  <option value="planned">planned</option>
                  <option value="active">active</option>
                  <option value="paused">paused</option>
                  <option value="completed">completed</option>
                  <option value="archived">archived</option>
                </select>
              </Field>
            </div>
            <div className="form-grid cols-2">
              <Field label="Start date">
                <input type="date" value={form.start_date} onChange={(event) => setForm({ ...form, start_date: event.target.value })} />
              </Field>
              <Field label="Target date">
                <input type="date" value={form.target_date} onChange={(event) => setForm({ ...form, target_date: event.target.value })} />
              </Field>
            </div>

            {error ? <EmptyState title="Could not save project" description={error} /> : null}

            <div className="helper-row">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving...' : editingId ? 'Update project' : 'Create project'}
              </Button>
              {editingId ? (
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setForm(defaultProjectForm());
                  }}
                >
                  Cancel edit
                </Button>
              ) : null}
            </div>
          </form>
        </Card>

        <Card className="section-card">
          <SectionHeader title="Project overview" description="A quick browse of every track you are managing." />
          <div className="list-grid">
            {projects.length ? (
              projects.map((project) => (
                <div key={project.id} className="entity">
                  <div className="entity-top">
                    <div>
                      <h3 className="entity-title">{project.name}</h3>
                      <p className="muted">{project.description || 'No description yet.'}</p>
                    </div>
                    <Badge tone={project.status === 'completed' ? 'success' : project.status === 'paused' ? 'warning' : 'info'}>
                      {project.status}
                    </Badge>
                  </div>
                  <div className="entity-meta">
                    <Badge tone="neutral">Priority {project.priority}</Badge>
                    <Badge tone="neutral">Target {formatDate(project.target_date)}</Badge>
                  </div>
                  <div className="entity-actions">
                    <Link className="btn btn-secondary" to={`/projects/${project.id}`}>
                      Open
                    </Link>
                    <Button variant="ghost" onClick={() => editProject(project)}>
                      Edit
                    </Button>
                    <Button variant="danger" onClick={() => void removeProject(project.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState
                title="No projects yet"
                description="Create the first track to start organizing milestones and tasks."
              />
            )}
          </div>
        </Card>
      </div>

      <Card className="section-card">
        <SectionHeader title="Active projects" description="These are the projects still in motion." />
        <div className="grid cards">
          {activeProjects.map((project) => (
            <Link key={project.id} className="card entity" to={`/projects/${project.id}`}>
              <div className="entity-top">
                <div>
                  <h3 className="entity-title">{project.name}</h3>
                  <p className="muted">{project.description || 'No description yet.'}</p>
                </div>
                <Badge tone="info">{project.status}</Badge>
              </div>
              <div className="entity-meta">
                <Badge tone="neutral">Priority {project.priority}</Badge>
                <Badge tone="neutral">{formatDate(project.target_date)}</Badge>
              </div>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
