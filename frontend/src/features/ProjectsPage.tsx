'use client';

import { FormEvent, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
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
const EDIT_PANEL_FLASH_MS = 900;

export function ProjectsPage() {
  const { confirm, confirmationDialog } = useConfirmationDialog();
  const [projects, setProjects] = useState<Project[]>([]);
  const [form, setForm] = useState<ProjectFormState>(defaultProjectForm());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [viewFilter, setViewFilter] = useState<ViewFilter>('active');
  const [editPanelFlashing, setEditPanelFlashing] = useState(false);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const editPanelFlashTimeoutRef = useRef<number | null>(null);

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

  useEffect(() => {
    return () => {
      if (editPanelFlashTimeoutRef.current !== null) {
        window.clearTimeout(editPanelFlashTimeoutRef.current);
      }
    };
  }, []);

  function triggerEditPanelFlash() {
    if (editPanelFlashTimeoutRef.current !== null) {
      window.clearTimeout(editPanelFlashTimeoutRef.current);
    }

    setEditPanelFlashing(false);
    window.requestAnimationFrame(() => {
      setEditPanelFlashing(true);
      editPanelFlashTimeoutRef.current = window.setTimeout(() => {
        setEditPanelFlashing(false);
        editPanelFlashTimeoutRef.current = null;
      }, EDIT_PANEL_FLASH_MS);
    });
  }

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
    triggerEditPanelFlash();
  }

  async function removeProject(project: Project) {
    const confirmed = await confirm({
      title: `Delete "${project.name}"?`,
      description: 'This removes the project and its milestones and tasks.',
      confirmLabel: 'Delete project'
    });
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
      {confirmationDialog}
      <PageIntro
        title="Projects"
        actions={
          <>
            <Link className="btn btn-primary" href="/tasks">Tasks</Link>
            <Link className="btn btn-ghost" href="/">Home</Link>
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
        <div className={`project-editor-panel${editPanelFlashing ? ' project-editor-panel-flash' : ''}`}>
          <Card className="section-card">
            <SectionHeader title={editingId ? 'Edit' : 'New'} />
            <form className="form-grid" onSubmit={handleSubmit}>
              <Field label="Name">
                <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Project name" required />
              </Field>
              <Field label="Description">
                <textarea
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  placeholder="Short note"
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
        </div>

        <Card className="section-card">
          <SectionHeader title="List" />
          <div className="toolbar">
            <SegmentedControl label="Project status filter" value={viewFilter} onChange={(value) => setViewFilter(value as ViewFilter)} options={filterOptions} />
            <div className="toolbar-row">
              <Field label="Search">
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find project" />
              </Field>
            </div>
          </div>

          <div className="divider" />

          <div className="list-table">
            {visibleProjects.length ? (
              visibleProjects.map((project) => (
                <div key={project.id} className="list-row">
                  <Link className="list-row-main list-row-link" href={`/projects/${project.id}`} aria-label={`Open project ${project.name}`}>
                    <div className="list-row-header">
                      <h3 className="list-row-title line-clamp-1">{project.name}</h3>
                      <div className="list-row-meta">
                        <Badge tone={toneForProjectStatus(project.status)}>{formatEnumLabel(project.status)}</Badge>
                        <Badge tone={toneForPriority(project.priority)}>{formatEnumLabel(project.priority)}</Badge>
                        <Badge tone={project.target_date ? 'info' : 'warning'}>
                          {formatDate(project.target_date)}
                        </Badge>
                      </div>
                    </div>
                    <div className="list-row-copy line-clamp-1">
                      {project.description || 'No note'} · Start {formatDate(project.start_date)}
                    </div>
                  </Link>
                  <div className="list-row-actions">
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
    </div>
  );
}
