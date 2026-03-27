'use client';

import { FormEvent, useEffect, useState } from 'react';
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
import { accessGroupsApi, aiProvidersApi, extractApiErrorMessage, usagePolicyApi, usersApi } from '../lib/api';
import { formatDateTime } from '../lib/dates';
import { formatDuration } from '../lib/media';
import { useAuth } from '../state/AuthContext';
import type { AccessGroup, AIProvider, AIProviderDriver, AIProviderKind, UsagePolicySnapshot, User } from '../types';

type AdminTab = 'users' | 'groups' | 'providers' | 'policy';

type UserFormState = {
  username: string;
  display_name: string;
  role: 'admin' | 'member';
  access_group_id: number | null;
  max_concurrent_sessions: number;
  is_active: boolean;
  password: string;
};

type UserEditState = {
  display_name: string;
  role: 'admin' | 'member';
  access_group_id: number | null;
  max_concurrent_sessions: number;
  is_active: boolean;
  password: string;
};

type AccessGroupFormState = {
  name: string;
  description: string;
  can_use_project_tracer: boolean;
  can_use_asr: boolean;
  can_use_llm: boolean;
};

type AIProviderFormState = {
  name: string;
  kind: AIProviderKind;
  driver: AIProviderDriver;
  model_name: string;
  base_url: string;
  description: string;
  is_active: boolean;
  api_key: string;
};

type PolicyFormState = {
  llm_runs_per_24h: string;
  max_audio_hours_per_request: string;
};

const emptyUserForm = (): UserFormState => ({
  username: '',
  display_name: '',
  role: 'member',
  access_group_id: null,
  max_concurrent_sessions: 2,
  is_active: true,
  password: ''
});

const emptyAccessGroupForm = (): AccessGroupFormState => ({
  name: '',
  description: '',
  can_use_project_tracer: true,
  can_use_asr: false,
  can_use_llm: false
});

const emptyAIProviderForm = (): AIProviderFormState => ({
  name: '',
  kind: 'asr',
  driver: 'local_breeze',
  model_name: '',
  base_url: '',
  description: '',
  is_active: true,
  api_key: ''
});

function userToEdit(user: User): UserEditState {
  return {
    display_name: user.display_name ?? '',
    role: user.role,
    access_group_id: user.access_group_id,
    max_concurrent_sessions: user.max_concurrent_sessions,
    is_active: user.is_active,
    password: ''
  };
}

function accessGroupToEdit(group: AccessGroup): AccessGroupFormState {
  return {
    name: group.name,
    description: group.description ?? '',
    can_use_project_tracer: group.can_use_project_tracer,
    can_use_asr: group.can_use_asr,
    can_use_llm: group.can_use_llm
  };
}

function providerToEdit(provider: AIProvider): AIProviderFormState {
  return {
    name: provider.name,
    kind: provider.kind,
    driver: provider.driver,
    model_name: provider.model_name,
    base_url: provider.base_url ?? '',
    description: provider.description ?? '',
    is_active: provider.is_active,
    api_key: ''
  };
}

function normalizeProviderDriver(kind: AIProviderKind): AIProviderDriver {
  return kind === 'asr' ? 'local_breeze' : 'gemini';
}

function capabilitySummary(group: AccessGroup) {
  const items = [];
  if (group.can_use_project_tracer) {
    items.push('Projects');
  }
  if (group.can_use_asr) {
    items.push('ASR');
  }
  if (group.can_use_llm) {
    items.push('LLM');
  }
  return items.length ? items.join(' · ') : 'No feature access';
}

function policyToForm(snapshot: UsagePolicySnapshot): PolicyFormState {
  return {
    llm_runs_per_24h: String(snapshot.policy.llm_runs_per_24h),
    max_audio_hours_per_request: String(snapshot.policy.max_audio_seconds_per_request / 3600),
  };
}

function preferredAccessGroupId(groups: AccessGroup[]) {
  return groups.find((group) => group.name === 'Full access')?.id ?? groups[0]?.id ?? null;
}

export function UsersPage() {
  const { user: currentUser } = useAuth();
  const [tab, setTab] = useState<AdminTab>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<AccessGroup[]>([]);
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [policySnapshot, setPolicySnapshot] = useState<UsagePolicySnapshot | null>(null);
  const [createUserForm, setCreateUserForm] = useState<UserFormState>(emptyUserForm());
  const [editUserForms, setEditUserForms] = useState<Record<number, UserEditState>>({});
  const [createGroupForm, setCreateGroupForm] = useState<AccessGroupFormState>(emptyAccessGroupForm());
  const [editGroupForms, setEditGroupForms] = useState<Record<number, AccessGroupFormState>>({});
  const [createProviderForm, setCreateProviderForm] = useState<AIProviderFormState>(emptyAIProviderForm());
  const [editProviderForms, setEditProviderForms] = useState<Record<number, AIProviderFormState>>({});
  const [policyForm, setPolicyForm] = useState<PolicyFormState>({
    llm_runs_per_24h: '3',
    max_audio_hours_per_request: '5',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadAll() {
    const [nextUsers, nextGroups, nextProviders, nextPolicy] = await Promise.all([
      usersApi.list(),
      accessGroupsApi.list(),
      aiProvidersApi.list({ include_inactive: true }),
      usagePolicyApi.get()
    ]);
    setUsers(nextUsers);
    setGroups(nextGroups);
    setProviders(nextProviders);
    setPolicySnapshot(nextPolicy);
    setPolicyForm(policyToForm(nextPolicy));
    setEditUserForms(Object.fromEntries(nextUsers.map((user) => [user.id, userToEdit(user)])));
    setEditGroupForms(Object.fromEntries(nextGroups.map((group) => [group.id, accessGroupToEdit(group)])));
    setEditProviderForms(Object.fromEntries(nextProviders.map((provider) => [provider.id, providerToEdit(provider)])));
    setCreateUserForm((current) => ({
      ...current,
      access_group_id: current.access_group_id ?? preferredAccessGroupId(nextGroups)
    }));
  }

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const [nextUsers, nextGroups, nextProviders, nextPolicy] = await Promise.all([
          usersApi.list(),
          accessGroupsApi.list(),
          aiProvidersApi.list({ include_inactive: true }),
          usagePolicyApi.get()
        ]);
        if (!alive) {
          return;
        }
        setUsers(nextUsers);
        setGroups(nextGroups);
        setProviders(nextProviders);
        setPolicySnapshot(nextPolicy);
        setPolicyForm(policyToForm(nextPolicy));
        setEditUserForms(Object.fromEntries(nextUsers.map((user) => [user.id, userToEdit(user)])));
        setEditGroupForms(Object.fromEntries(nextGroups.map((group) => [group.id, accessGroupToEdit(group)])));
        setEditProviderForms(Object.fromEntries(nextProviders.map((provider) => [provider.id, providerToEdit(provider)])));
        setCreateUserForm((current) => ({
          ...current,
          access_group_id: current.access_group_id ?? preferredAccessGroupId(nextGroups)
        }));
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

  const activeUsers = users.filter((user) => user.is_active).length;
  const adminUsers = users.filter((user) => user.role === 'admin').length;
  const asrEnabledProviders = providers.filter((provider) => provider.kind === 'asr' && provider.is_active).length;
  const llmEnabledProviders = providers.filter((provider) => provider.kind === 'llm' && provider.is_active).length;

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await usersApi.create(createUserForm);
      setCreateUserForm(emptyUserForm());
      await loadAll();
      setNotice('User created.');
    } catch (err) {
      setError(extractApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveUser(userId: number) {
    const form = editUserForms[userId];
    if (!form) {
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await usersApi.update(userId, {
        display_name: form.display_name,
        role: form.role,
        access_group_id: form.access_group_id,
        max_concurrent_sessions: form.max_concurrent_sessions,
        is_active: form.is_active
      });
      if (form.password.trim()) {
        await usersApi.resetPassword(userId, { password: form.password });
      }
      await loadAll();
      setNotice('User saved.');
    } catch (err) {
      setError(extractApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleUnlock(userId: number) {
    setError('');
    setNotice('');
    try {
      await usersApi.unlock(userId);
      await loadAll();
      setNotice('User unlocked.');
    } catch (err) {
      setError(extractApiErrorMessage(err));
    }
  }

  async function handleDeleteUser(userId: number, displayName: string) {
    if (!window.confirm(`Delete user "${displayName}"?`)) {
      return;
    }
    setError('');
    setNotice('');
    try {
      await usersApi.remove(userId);
      await loadAll();
      setNotice('User deleted.');
    } catch (err) {
      setError(extractApiErrorMessage(err));
    }
  }

  async function handleCreateGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await accessGroupsApi.create(createGroupForm);
      setCreateGroupForm(emptyAccessGroupForm());
      await loadAll();
      setNotice('Access group created.');
    } catch (err) {
      setError(extractApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveGroup(groupId: number) {
    const form = editGroupForms[groupId];
    if (!form) {
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await accessGroupsApi.update(groupId, form);
      await loadAll();
      setNotice('Access group saved.');
    } catch (err) {
      setError(extractApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteGroup(groupId: number) {
    if (!window.confirm('Delete this access group?')) {
      return;
    }
    setError('');
    setNotice('');
    try {
      await accessGroupsApi.remove(groupId);
      await loadAll();
      setNotice('Access group deleted.');
    } catch (err) {
      setError(extractApiErrorMessage(err));
    }
  }

  async function handleCreateProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await aiProvidersApi.create(createProviderForm);
      setCreateProviderForm(emptyAIProviderForm());
      await loadAll();
      setNotice('AI provider created.');
    } catch (err) {
      setError(extractApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveProvider(providerId: number) {
    const form = editProviderForms[providerId];
    if (!form) {
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await aiProvidersApi.update(providerId, form);
      await loadAll();
      setNotice('AI provider saved.');
    } catch (err) {
      setError(extractApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteProvider(providerId: number) {
    if (!window.confirm('Delete this AI provider?')) {
      return;
    }
    setError('');
    setNotice('');
    try {
      await aiProvidersApi.remove(providerId);
      await loadAll();
      setNotice('AI provider deleted.');
    } catch (err) {
      setError(extractApiErrorMessage(err));
    }
  }

  async function handleSavePolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await usagePolicyApi.update({
        llm_runs_per_24h: Math.max(1, Math.round(Number(policyForm.llm_runs_per_24h) || 0)),
        max_audio_seconds_per_request: Math.max(60, Math.round((Number(policyForm.max_audio_hours_per_request) || 0) * 3600)),
      });
      const nextPolicy = await usagePolicyApi.get();
      setPolicySnapshot(nextPolicy);
      setPolicyForm(policyToForm(nextPolicy));
      setNotice('Policy saved.');
    } catch (err) {
      setError(extractApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="page">
        <Card className="section-card">
          <div className="spinner" />
          <p className="muted">Loading control panel...</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="page">
      <PageIntro
        title="Control"
        description="Users, groups, providers, policy."
        aside={
          <div className="metric-strip">
            <MetricPill label="Users" value={users.length} tone="info" />
            <MetricPill label="Admins" value={adminUsers} tone="warning" />
            <MetricPill label="Groups" value={groups.length} tone="neutral" />
            <MetricPill label="ASR" value={asrEnabledProviders} tone="success" />
            <MetricPill label="LLM" value={llmEnabledProviders} tone="info" />
            <MetricPill label="Text/24h" value={policySnapshot?.policy.llm_runs_per_24h ?? 'n/a'} tone="warning" />
            <MetricPill label="Audio cap" value={formatDuration(policySnapshot?.policy.max_audio_seconds_per_request ?? null)} tone="neutral" />
          </div>
        }
      />

      {error ? <Notice title="Control error" description={error} tone="danger" /> : null}
      {notice ? <Notice title={notice} tone="success" /> : null}

      <SegmentedControl
        label="Control section"
        value={tab}
        onChange={(value) => setTab(value as AdminTab)}
        options={[
          { value: 'users', label: 'Users', count: users.length },
          { value: 'groups', label: 'Groups', count: groups.length },
          { value: 'providers', label: 'Providers', count: providers.length },
          { value: 'policy', label: 'Policy' }
        ]}
      />

      {tab === 'users' ? (
        <div className="grid two">
          <Card className="section-card">
            <SectionHeader title="New user" />
            <form className="form-grid" onSubmit={handleCreateUser}>
              <Field label="Username">
                <input value={createUserForm.username} onChange={(event) => setCreateUserForm({ ...createUserForm, username: event.target.value })} required />
              </Field>
              <Field label="Display name">
                <input value={createUserForm.display_name} onChange={(event) => setCreateUserForm({ ...createUserForm, display_name: event.target.value })} required />
              </Field>
              <div className="form-grid cols-2">
                <Field label="Role">
                  <select value={createUserForm.role} onChange={(event) => setCreateUserForm({ ...createUserForm, role: event.target.value as 'admin' | 'member' })}>
                    <option value="member">member</option>
                    <option value="admin">admin</option>
                  </select>
                </Field>
                <Field label="Group">
                  <select
                    value={String(createUserForm.access_group_id ?? '')}
                    onChange={(event) => setCreateUserForm({ ...createUserForm, access_group_id: Number(event.target.value) || null })}
                  >
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="form-grid cols-2">
                <Field label="State">
                  <select value={String(createUserForm.is_active)} onChange={(event) => setCreateUserForm({ ...createUserForm, is_active: event.target.value === 'true' })}>
                    <option value="true">active</option>
                    <option value="false">inactive</option>
                  </select>
                </Field>
                <Field label="Devices">
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={createUserForm.max_concurrent_sessions}
                    onChange={(event) =>
                      setCreateUserForm({
                        ...createUserForm,
                        max_concurrent_sessions: Math.min(10, Math.max(1, Number(event.target.value) || 1))
                      })
                    }
                    required
                  />
                </Field>
              </div>
              <div className="form-grid cols-2">
                <Field label="Password">
                  <input type="password" value={createUserForm.password} onChange={(event) => setCreateUserForm({ ...createUserForm, password: event.target.value })} required />
                </Field>
              </div>
              <Button type="submit" disabled={saving}>
                {saving ? 'Creating...' : 'Create user'}
              </Button>
            </form>
          </Card>

          <Card className="section-card">
            <SectionHeader title="Accounts" description={`${activeUsers} active`} />
            <div className="list-table">
              {users.length ? (
                users.map((user) => {
                  const form = editUserForms[user.id] ?? userToEdit(user);
                  const locked = Boolean(user.locked_until);
                  const canDeleteUser = currentUser?.id !== user.id;
                  return (
                    <div key={user.id} className="list-row">
                      <div className="list-row-main">
                        <div className="list-row-header">
                          <h3 className="list-row-title">{user.display_name || user.username}</h3>
                          <div className="list-row-meta">
                            <Badge tone={user.role === 'admin' ? 'warning' : 'info'}>{user.role}</Badge>
                            <Badge tone={user.is_active ? 'success' : 'danger'}>{user.is_active ? 'active' : 'inactive'}</Badge>
                            {user.access_group_name ? <Badge tone="neutral">{user.access_group_name}</Badge> : null}
                          </div>
                        </div>
                        <div className="list-row-copy line-clamp-1">
                          @{user.username} · {user.last_login_at ? `last ${formatDateTime(user.last_login_at)}` : 'never logged in'}
                        </div>
                        <div className="list-row-copy line-clamp-1">
                          Devices {user.active_session_count} / {user.max_concurrent_sessions}
                        </div>
                        <div className="list-row-copy line-clamp-1">
                          {user.capabilities.project_tracer ? 'Projects' : 'No projects'} · {user.capabilities.asr ? 'ASR' : 'No ASR'} · {user.capabilities.llm ? 'LLM' : 'No LLM'}
                        </div>
                        <div className="form-grid cols-2">
                          <Field label="Name">
                            <input value={form.display_name} onChange={(event) => setEditUserForms({ ...editUserForms, [user.id]: { ...form, display_name: event.target.value } })} />
                          </Field>
                          <Field label="Group">
                            <select
                              value={String(form.access_group_id ?? '')}
                              onChange={(event) => setEditUserForms({ ...editUserForms, [user.id]: { ...form, access_group_id: Number(event.target.value) || null } })}
                            >
                              {groups.map((group) => (
                                <option key={group.id} value={group.id}>
                                  {group.name}
                                </option>
                              ))}
                            </select>
                          </Field>
                        </div>
                        <div className="form-grid cols-2">
                          <Field label="Role">
                            <select value={form.role} onChange={(event) => setEditUserForms({ ...editUserForms, [user.id]: { ...form, role: event.target.value as 'admin' | 'member' } })}>
                              <option value="member">member</option>
                              <option value="admin">admin</option>
                            </select>
                          </Field>
                          <Field label="Devices">
                            <input
                              type="number"
                              min={1}
                              max={10}
                              value={form.max_concurrent_sessions}
                              onChange={(event) =>
                                setEditUserForms({
                                  ...editUserForms,
                                  [user.id]: {
                                    ...form,
                                    max_concurrent_sessions: Math.min(10, Math.max(1, Number(event.target.value) || 1))
                                  }
                                })
                              }
                            />
                          </Field>
                        </div>
                        <div className="form-grid cols-2">
                          <Field label="State">
                            <select value={String(form.is_active)} onChange={(event) => setEditUserForms({ ...editUserForms, [user.id]: { ...form, is_active: event.target.value === 'true' } })}>
                              <option value="true">active</option>
                              <option value="false">inactive</option>
                            </select>
                          </Field>
                        </div>
                        <Field label="Reset password">
                          <input
                            type="password"
                            value={form.password}
                            onChange={(event) => setEditUserForms({ ...editUserForms, [user.id]: { ...form, password: event.target.value } })}
                            placeholder="Optional"
                          />
                        </Field>
                      </div>
                      <div className="list-row-side">
                        <div className="muted small">Created {formatDateTime(user.created_at)}</div>
                        <div className="muted small">
                          {locked ? `Locked to ${formatDateTime(user.locked_until)}` : `${user.failed_login_attempts} tries`}
                        </div>
                        <div className="list-row-actions">
                          <Button variant="secondary" onClick={() => void handleSaveUser(user.id)}>
                            Save
                          </Button>
                          {locked ? (
                            <Button variant="ghost" onClick={() => void handleUnlock(user.id)}>
                              Unlock
                            </Button>
                          ) : null}
                          {canDeleteUser ? (
                            <Button variant="danger" onClick={() => void handleDeleteUser(user.id, user.display_name || user.username)}>
                              Delete
                            </Button>
                          ) : null}
                        </div>
                        {!canDeleteUser ? <div className="muted small">Current admin</div> : null}
                      </div>
                    </div>
                  );
                })
              ) : (
                <EmptyState title="No users yet" description="Create the first user." />
              )}
            </div>
          </Card>
        </div>
      ) : null}

      {tab === 'groups' ? (
        <div className="grid two">
          <Card className="section-card">
            <SectionHeader title="New group" />
            <form className="form-grid" onSubmit={handleCreateGroup}>
              <Field label="Name">
                <input value={createGroupForm.name} onChange={(event) => setCreateGroupForm({ ...createGroupForm, name: event.target.value })} required />
              </Field>
              <Field label="Description">
                <input value={createGroupForm.description} onChange={(event) => setCreateGroupForm({ ...createGroupForm, description: event.target.value })} placeholder="Optional" />
              </Field>
              <div className="form-grid cols-3">
                <Field label="Projects">
                  <select value={String(createGroupForm.can_use_project_tracer)} onChange={(event) => setCreateGroupForm({ ...createGroupForm, can_use_project_tracer: event.target.value === 'true' })}>
                    <option value="true">on</option>
                    <option value="false">off</option>
                  </select>
                </Field>
                <Field label="ASR">
                  <select value={String(createGroupForm.can_use_asr)} onChange={(event) => setCreateGroupForm({ ...createGroupForm, can_use_asr: event.target.value === 'true' })}>
                    <option value="true">on</option>
                    <option value="false">off</option>
                  </select>
                </Field>
                <Field label="LLM">
                  <select value={String(createGroupForm.can_use_llm)} onChange={(event) => setCreateGroupForm({ ...createGroupForm, can_use_llm: event.target.value === 'true' })}>
                    <option value="true">on</option>
                    <option value="false">off</option>
                  </select>
                </Field>
              </div>
              <Button type="submit" disabled={saving}>
                {saving ? 'Creating...' : 'Create group'}
              </Button>
            </form>
          </Card>

          <Card className="section-card">
            <SectionHeader title="Groups" />
            <div className="list-table">
              {groups.length ? (
                groups.map((group) => {
                  const form = editGroupForms[group.id] ?? accessGroupToEdit(group);
                  return (
                    <div key={group.id} className="list-row">
                      <div className="list-row-main">
                        <div className="list-row-header">
                          <h3 className="list-row-title">{group.name}</h3>
                          <div className="list-row-meta">
                            <Badge tone="neutral">{group.member_count} users</Badge>
                          </div>
                        </div>
                        <div className="list-row-copy line-clamp-1">{capabilitySummary(group)}</div>
                        <Field label="Name">
                          <input value={form.name} onChange={(event) => setEditGroupForms({ ...editGroupForms, [group.id]: { ...form, name: event.target.value } })} />
                        </Field>
                        <Field label="Description">
                          <input value={form.description} onChange={(event) => setEditGroupForms({ ...editGroupForms, [group.id]: { ...form, description: event.target.value } })} placeholder="Optional" />
                        </Field>
                        <div className="form-grid cols-3">
                          <Field label="Projects">
                            <select value={String(form.can_use_project_tracer)} onChange={(event) => setEditGroupForms({ ...editGroupForms, [group.id]: { ...form, can_use_project_tracer: event.target.value === 'true' } })}>
                              <option value="true">on</option>
                              <option value="false">off</option>
                            </select>
                          </Field>
                          <Field label="ASR">
                            <select value={String(form.can_use_asr)} onChange={(event) => setEditGroupForms({ ...editGroupForms, [group.id]: { ...form, can_use_asr: event.target.value === 'true' } })}>
                              <option value="true">on</option>
                              <option value="false">off</option>
                            </select>
                          </Field>
                          <Field label="LLM">
                            <select value={String(form.can_use_llm)} onChange={(event) => setEditGroupForms({ ...editGroupForms, [group.id]: { ...form, can_use_llm: event.target.value === 'true' } })}>
                              <option value="true">on</option>
                              <option value="false">off</option>
                            </select>
                          </Field>
                        </div>
                      </div>
                      <div className="list-row-side">
                        <div className="muted small">Updated {formatDateTime(group.updated_at)}</div>
                        <div className="list-row-actions">
                          <Button variant="secondary" onClick={() => void handleSaveGroup(group.id)}>
                            Save
                          </Button>
                          <Button variant="danger" onClick={() => void handleDeleteGroup(group.id)}>
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <EmptyState title="No groups yet" description="Create the first access group." />
              )}
            </div>
          </Card>
        </div>
      ) : null}

      {tab === 'providers' ? (
        <div className="grid two">
          <Card className="section-card">
            <SectionHeader title="New provider" />
            <form className="form-grid" onSubmit={handleCreateProvider}>
              <Field label="Name">
                <input value={createProviderForm.name} onChange={(event) => setCreateProviderForm({ ...createProviderForm, name: event.target.value })} required />
              </Field>
              <div className="form-grid cols-2">
                <Field label="Kind">
                  <select
                    value={createProviderForm.kind}
                    onChange={(event) => {
                      const kind = event.target.value as AIProviderKind;
                      setCreateProviderForm({ ...createProviderForm, kind, driver: normalizeProviderDriver(kind) });
                    }}
                  >
                    <option value="asr">asr</option>
                    <option value="llm">llm</option>
                  </select>
                </Field>
                <Field label="Driver">
                  <select value={createProviderForm.driver} onChange={(event) => setCreateProviderForm({ ...createProviderForm, driver: event.target.value as AIProviderDriver })}>
                    {createProviderForm.kind === 'asr' ? <option value="local_breeze">local_breeze</option> : <option value="gemini">gemini</option>}
                  </select>
                </Field>
              </div>
              <div className="form-grid cols-2">
                <Field label="Model">
                  <input value={createProviderForm.model_name} onChange={(event) => setCreateProviderForm({ ...createProviderForm, model_name: event.target.value })} required />
                </Field>
                <Field label="State">
                  <select value={String(createProviderForm.is_active)} onChange={(event) => setCreateProviderForm({ ...createProviderForm, is_active: event.target.value === 'true' })}>
                    <option value="true">active</option>
                    <option value="false">inactive</option>
                  </select>
                </Field>
              </div>
              <Field label="Base URL">
                <input value={createProviderForm.base_url} onChange={(event) => setCreateProviderForm({ ...createProviderForm, base_url: event.target.value })} placeholder="Optional" />
              </Field>
              <Field label="API key">
                <input type="password" value={createProviderForm.api_key} onChange={(event) => setCreateProviderForm({ ...createProviderForm, api_key: event.target.value })} placeholder={createProviderForm.kind === 'llm' ? 'Required for Gemini' : 'Optional'} />
              </Field>
              <Field label="Description">
                <input value={createProviderForm.description} onChange={(event) => setCreateProviderForm({ ...createProviderForm, description: event.target.value })} placeholder="Optional" />
              </Field>
              <Button type="submit" disabled={saving}>
                {saving ? 'Creating...' : 'Create provider'}
              </Button>
            </form>
          </Card>

          <Card className="section-card">
            <SectionHeader title="Providers" />
            <div className="list-table">
              {providers.length ? (
                providers.map((provider) => {
                  const form = editProviderForms[provider.id] ?? providerToEdit(provider);
                  return (
                    <div key={provider.id} className="list-row">
                      <div className="list-row-main">
                        <div className="list-row-header">
                          <h3 className="list-row-title">{provider.name}</h3>
                          <div className="list-row-meta">
                            <Badge tone={provider.kind === 'asr' ? 'info' : 'warning'}>{provider.kind}</Badge>
                            <Badge tone={provider.is_active ? 'success' : 'neutral'}>{provider.is_active ? 'active' : 'inactive'}</Badge>
                            <Badge tone="neutral">{provider.driver}</Badge>
                          </div>
                        </div>
                        <div className="list-row-copy line-clamp-1">
                          {provider.model_name} · {provider.api_key_hint || (provider.has_api_key ? 'key set' : 'no key')}
                        </div>
                        <Field label="Name">
                          <input value={form.name} onChange={(event) => setEditProviderForms({ ...editProviderForms, [provider.id]: { ...form, name: event.target.value } })} />
                        </Field>
                        <div className="form-grid cols-2">
                          <Field label="Kind">
                            <select
                              value={form.kind}
                              onChange={(event) => {
                                const kind = event.target.value as AIProviderKind;
                                setEditProviderForms({ ...editProviderForms, [provider.id]: { ...form, kind, driver: normalizeProviderDriver(kind) } });
                              }}
                            >
                              <option value="asr">asr</option>
                              <option value="llm">llm</option>
                            </select>
                          </Field>
                          <Field label="Driver">
                            <select value={form.driver} onChange={(event) => setEditProviderForms({ ...editProviderForms, [provider.id]: { ...form, driver: event.target.value as AIProviderDriver } })}>
                              {form.kind === 'asr' ? <option value="local_breeze">local_breeze</option> : <option value="gemini">gemini</option>}
                            </select>
                          </Field>
                        </div>
                        <div className="form-grid cols-2">
                          <Field label="Model">
                            <input value={form.model_name} onChange={(event) => setEditProviderForms({ ...editProviderForms, [provider.id]: { ...form, model_name: event.target.value } })} />
                          </Field>
                          <Field label="State">
                            <select value={String(form.is_active)} onChange={(event) => setEditProviderForms({ ...editProviderForms, [provider.id]: { ...form, is_active: event.target.value === 'true' } })}>
                              <option value="true">active</option>
                              <option value="false">inactive</option>
                            </select>
                          </Field>
                        </div>
                        <Field label="Base URL">
                          <input value={form.base_url} onChange={(event) => setEditProviderForms({ ...editProviderForms, [provider.id]: { ...form, base_url: event.target.value } })} placeholder="Optional" />
                        </Field>
                        <Field label={provider.has_api_key ? `Replace key (${provider.api_key_hint || 'stored'})` : 'API key'}>
                          <input type="password" value={form.api_key} onChange={(event) => setEditProviderForms({ ...editProviderForms, [provider.id]: { ...form, api_key: event.target.value } })} placeholder="Leave blank to keep current key" />
                        </Field>
                        <Field label="Description">
                          <input value={form.description} onChange={(event) => setEditProviderForms({ ...editProviderForms, [provider.id]: { ...form, description: event.target.value } })} placeholder="Optional" />
                        </Field>
                      </div>
                      <div className="list-row-side">
                        <div className="muted small">Updated {formatDateTime(provider.updated_at)}</div>
                        <div className="list-row-actions">
                          <Button variant="secondary" onClick={() => void handleSaveProvider(provider.id)}>
                            Save
                          </Button>
                          <Button variant="danger" onClick={() => void handleDeleteProvider(provider.id)}>
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <EmptyState title="No providers yet" description="Create the first AI provider." />
              )}
            </div>
          </Card>
        </div>
      ) : null}

      {tab === 'policy' ? (
        <div className="grid two">
          <Card className="section-card">
            <SectionHeader title="Cost policy" description="Applies to all users." />
            <form className="form-grid" onSubmit={handleSavePolicy}>
              <div className="form-grid cols-2">
                <Field label="Text runs / 24h">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={policyForm.llm_runs_per_24h}
                    onChange={(event) => setPolicyForm({ ...policyForm, llm_runs_per_24h: event.target.value })}
                  />
                </Field>
                <Field label="Max audio / file (hours)">
                  <input
                    type="number"
                    min="0.25"
                    step="0.25"
                    value={policyForm.max_audio_hours_per_request}
                    onChange={(event) => setPolicyForm({ ...policyForm, max_audio_hours_per_request: event.target.value })}
                  />
                </Field>
              </div>
              <div className="list-row-copy">Meetings spend one text run. ASR and Meetings both follow the audio cap.</div>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Save policy'}
              </Button>
            </form>
          </Card>

          <Card className="section-card">
            <SectionHeader title="Current window" />
            <div className="metric-strip">
              <MetricPill
                label="Text left"
                value={
                  policySnapshot
                    ? `${policySnapshot.usage.llm_runs_remaining}/${policySnapshot.policy.llm_runs_per_24h}`
                    : 'n/a'
                }
                tone="warning"
              />
              <MetricPill label="Text used" value={policySnapshot?.usage.llm_runs_last_24h ?? 'n/a'} tone="info" />
              <MetricPill label="Audio 24h" value={formatDuration(policySnapshot?.usage.audio_seconds_last_24h ?? null)} tone="success" />
              <MetricPill label="Audio cap" value={formatDuration(policySnapshot?.policy.max_audio_seconds_per_request ?? null)} tone="neutral" />
            </div>
            <div className="list-table">
              <div className="list-row">
                <div className="list-row-main">
                  <div className="list-row-header">
                    <h3 className="list-row-title">Budget behavior</h3>
                  </div>
                  <div className="list-row-copy">Rolling 24-hour text window. Per-file audio cap for uploads and recordings.</div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
