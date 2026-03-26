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
import { extractApiErrorMessage, projectsApi } from '../lib/api';
import { formatDate } from '../lib/dates';
import { formatEnumLabel, toneForPriority, toneForProjectStatus } from '../lib/presentation';
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

type ViewFilter = 'active' | 'planned' | 'paused' | 'completed' | 'all';

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [form, setForm] = useState<ProjectFormState>(defaultProjectForm());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [viewFilter, setViewFilter] = useState<ViewFilter>('active');
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

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

  const activeCount = projects.filter((project) => project.status === 'active').length;
  const plannedCount = projects.filter((project) => project.status === 'planned').length;
  const pausedCount = projects.filter((project) => project.status === 'paused').length;
  const completedCount = projects.filter((project) => project.status === 'completed').length;
  const noTargetCount = projects.filter((project) => !project.target_date && project.status !== 'completed' && project.status !== 'archived').length;

  const visibleProjects = useMemo(() => {
    let items = [...projects].sort((left, right) => {
      const leftTarget = left.target_date ?? '9999-12-31';
      const rightTarget = right.target_date ?? '9999-12-31';
      if (leftTarget !== rightTarget) {
        return leftTarget.localeCompare(rightTarget);
      }
      return left.name.localeCompare(right.name);
    });

    if (viewFilter !== 'all') {
      items = items.filter((project) => {
        if (viewFilter === 'active') {
          return project.status === 'active';
        }
        return project.status === viewFilter;
      });
    }

    if (deferredSearch) {
      items = items.filter((project) => [project.name, project.description ?? ''].join(' ').toLowerCase().includes(deferredSearch));
    }

    return items;
  }, [deferredSearch, projects, viewFilter]);

  const filterOptions = [
    { value: 'active', label: 'Active', count: activeCount },
    { value: 'planned', label: 'Planned', count: plannedCount },
    { value: 'paused', label: 'Paused', count: pausedCount },
    { value: 'completed', label: 'Completed', count: completedCount },
    { value: 'all', label: 'All', count: projects.length }
  ] satisfies Array<{ value: ViewFilter; label: string; count: number }>;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');

    const payload = {
      ...form,
      description: form.description || null,
      start_date: form.start_date || null,
      target_date: form.target_date || null
    };

    try {
      if (editingId) {
        await projectsApi.update(editingId, payload);
        setNotice('Project updated.');
      } else {
        await projectsApi.create(payload);
        setNotice('Project created.');
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
    setError('');
    setNotice('');
  }

  async function removeProject(project: Project) {
    const confirmed = window.confirm(`Delete project "${project.name}" and its milestones/tasks?`);
    if (!confirmed) {
      return;
    }

    setError('');
    setNotice('');
    try {
      await projectsApi.remove(project.id);
      if (editingId === project.id) {
        setEditingId(null);
        setForm(defaultProjectForm());
      }
      await loadProjects();
      setNotice('Project deleted.');
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
      <PageIntro
        eyebrow="Projects"
        title="Projects"
        description="Long-horizon tracks."
        actions={
          <>
            <Link className="btn btn-primary" href="/tasks">Open task queue</Link>
            <Link className="btn btn-ghost" href="/">Back to dashboard</Link>
          </>
        }
        aside={
          <div className="metric-strip">
            <MetricPill label="Active" value={activeCount} tone="info" />
            <MetricPill label="Planned" value={plannedCount} tone="neutral" />
            <MetricPill label="Paused" value={pausedCount} tone={pausedCount ? 'warning' : 'neutral'} />
            <MetricPill label="Missing target date" value={noTargetCount} tone={noTargetCount ? 'warning' : 'success'} />
          </div>
        }
      />

      {error ? <Notice title="Could not update projects" description={error} tone="danger" /> : null}
      {notice ? <Notice title={notice} tone="success" /> : null}

      <div className="grid two">
        <Card className="section-card">
          <SectionHeader title={editingId ? 'Edit project' : 'Add project'} />
          <form className="form-grid" onSubmit={handleSubmit}>
            <Field label="Name">
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Example: FastAPI fundamentals" required />
            </Field>
            <Field label="Description">
              <textarea
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="What this project is for."
              />
            </Field>
            <div className="form-grid cols-2">
              <Field label="Priority">
                <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </Field>
              <Field label="Status">
                <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                  <option value="planned">Planned</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="completed">Completed</option>
                  <option value="archived">Archived</option>
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
          <SectionHeader title="Project list" />
          <div className="toolbar">
            <SegmentedControl label="Project status filter" value={viewFilter} onChange={(value) => setViewFilter(value as ViewFilter)} options={filterOptions} />
            <div className="toolbar-row">
              <Field label="Search">
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search projects" />
              </Field>
            </div>
          </div>

          <div className="divider" />

          <div className="cluster-grid">
            {visibleProjects.length ? (
              visibleProjects.map((project) => (
                <div key={project.id} className="surface-soft">
                  <div className="entity-top">
                    <div className="entity-copy">
                      <h3 className="entity-title">{project.name}</h3>
                      <p className="muted">{project.description || 'No description.'}</p>
                    </div>
                    <Badge tone={toneForProjectStatus(project.status)}>{formatEnumLabel(project.status)}</Badge>
                  </div>
                  <div className="entity-meta">
                    <Badge tone={toneForPriority(project.priority)}>{formatEnumLabel(project.priority)}</Badge>
                    <Badge tone="neutral">Start {formatDate(project.start_date)}</Badge>
                    <Badge tone={project.target_date ? 'info' : 'warning'}>
                      Target {formatDate(project.target_date)}
                    </Badge>
                  </div>
                  <div className="quick-actions">
                    <Link className="btn btn-primary" href={`/projects/${project.id}`}>
                      Open
                    </Link>
                    <Button variant="secondary" onClick={() => editProject(project)}>
                      Edit
                    </Button>
                    <Button variant="danger" onClick={() => void removeProject(project)}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState title="No projects here" description="Change the filter or add one." />
            )}
          </div>
        </Card>
      </div>

      <Card className="section-card">
        <SectionHeader title="Active tracks" />
        <div className="grid cards">
          {projects.filter((project) => project.status === 'active').length ? (
            projects
              .filter((project) => project.status === 'active')
              .map((project) => (
                <Link key={project.id} className="card entity" href={`/projects/${project.id}`}>
                  <div className="entity-top">
                    <div className="entity-copy">
                      <h3 className="entity-title">{project.name}</h3>
                      <p className="muted">{project.description || 'No description.'}</p>
                    </div>
                    <Badge tone="info">Active</Badge>
                  </div>
                  <div className="entity-meta">
                    <Badge tone={toneForPriority(project.priority)}>{formatEnumLabel(project.priority)}</Badge>
                    <Badge tone={project.target_date ? 'info' : 'warning'}>{formatDate(project.target_date)}</Badge>
                  </div>
                </Link>
              ))
          ) : (
            <EmptyState title="No active projects" description="Move one to active when ready." />
          )}
        </div>
      </Card>
    </div>
  );
}
