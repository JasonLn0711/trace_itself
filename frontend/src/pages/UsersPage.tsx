import { FormEvent, useEffect, useState } from 'react';
import { Badge, Button, Card, EmptyState, Field, SectionHeader, StatCard } from '../components/Primitives';
import { extractApiErrorMessage, usersApi } from '../lib/api';
import { formatDateTime } from '../lib/dates';
import type { User } from '../types';

type UserFormState = {
  username: string;
  display_name: string;
  role: 'admin' | 'member';
  is_active: boolean;
  password: string;
};

type UserEditState = {
  display_name: string;
  role: 'admin' | 'member';
  is_active: boolean;
  password: string;
};

const emptyUserForm = (): UserFormState => ({
  username: '',
  display_name: '',
  role: 'member',
  is_active: true,
  password: ''
});

function userToEdit(user: User): UserEditState {
  return {
    display_name: user.display_name,
    role: user.role,
    is_active: user.is_active,
    password: ''
  };
}

export function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [createForm, setCreateForm] = useState<UserFormState>(emptyUserForm());
  const [editForms, setEditForms] = useState<Record<number, UserEditState>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const activeUsers = users.filter((user) => user.is_active).length;
  const adminUsers = users.filter((user) => user.role === 'admin').length;
  const lockedUsers = users.filter((user) => Boolean(user.locked_until)).length;
  const inactiveUsers = users.filter((user) => !user.is_active).length;

  async function loadUsers() {
    const items = await usersApi.list();
    setUsers(items);
    setEditForms(Object.fromEntries(items.map((user) => [user.id, userToEdit(user)])));
  }

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const items = await usersApi.list();
        if (alive) {
          setUsers(items);
          setEditForms(Object.fromEntries(items.map((user) => [user.id, userToEdit(user)])));
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

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await usersApi.create(createForm);
      setCreateForm(emptyUserForm());
      await loadUsers();
    } catch (err) {
      setError(extractApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(userId: number) {
    const form = editForms[userId];
    if (!form) {
      return;
    }
    setSaving(true);
    setError('');
    try {
      await usersApi.update(userId, {
        display_name: form.display_name,
        role: form.role,
        is_active: form.is_active
      });
      if (form.password.trim()) {
        await usersApi.resetPassword(userId, { password: form.password });
      }
      await loadUsers();
    } catch (err) {
      setError(extractApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleUnlock(userId: number) {
    setError('');
    try {
      await usersApi.unlock(userId);
      await loadUsers();
    } catch (err) {
      setError(extractApiErrorMessage(err));
    }
  }

  if (loading) {
    return (
      <div className="page">
        <Card className="section-card">
          <div className="spinner" />
          <p className="muted">Loading users...</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Users</h1>
          <p className="muted">Admin only.</p>
        </div>
      </div>

      <div className="grid stats">
        <StatCard label="Active users" value={activeUsers} />
        <StatCard label="Admins" value={adminUsers} />
        <StatCard label="Locked" value={lockedUsers} />
        <StatCard label="Inactive" value={inactiveUsers} />
      </div>

      {error ? <EmptyState title="Could not update users" description={error} /> : null}

      <div className="grid two">
        <Card className="section-card">
          <SectionHeader title="Create user" />
          <form className="form-grid" onSubmit={handleCreate}>
            <Field label="Username">
              <input value={createForm.username} onChange={(event) => setCreateForm({ ...createForm, username: event.target.value })} required />
            </Field>
            <Field label="Display name">
              <input value={createForm.display_name} onChange={(event) => setCreateForm({ ...createForm, display_name: event.target.value })} required />
            </Field>
            <div className="form-grid cols-2">
              <Field label="Role">
                <select value={createForm.role} onChange={(event) => setCreateForm({ ...createForm, role: event.target.value as 'admin' | 'member' })}>
                  <option value="member">member</option>
                  <option value="admin">admin</option>
                </select>
              </Field>
              <Field label="Active">
                <select value={String(createForm.is_active)} onChange={(event) => setCreateForm({ ...createForm, is_active: event.target.value === 'true' })}>
                  <option value="true">active</option>
                  <option value="false">inactive</option>
                </select>
              </Field>
            </div>
            <Field label="Initial password">
              <input type="password" value={createForm.password} onChange={(event) => setCreateForm({ ...createForm, password: event.target.value })} required />
            </Field>
            <Button type="submit" disabled={saving}>
              {saving ? 'Creating...' : 'Create user'}
            </Button>
          </form>
        </Card>

        <Card className="section-card">
          <SectionHeader title="Account status" />
          <div className="list-grid">
            {users.map((user) => {
              const form = editForms[user.id] ?? userToEdit(user);
              const locked = Boolean(user.locked_until);
              return (
                <div key={user.id} className="entity">
                  <div className="entity-top">
                    <div>
                      <h3 className="entity-title">{user.display_name}</h3>
                      <p className="muted">@{user.username} · created {formatDateTime(user.created_at)}</p>
                    </div>
                    <Badge tone={user.role === 'admin' ? 'warning' : 'info'}>{user.role}</Badge>
                  </div>
                  <div className="entity-meta">
                    <Badge tone={user.is_active ? 'success' : 'danger'}>{user.is_active ? 'active' : 'inactive'}</Badge>
                    <Badge tone={locked ? 'danger' : 'neutral'}>
                      {locked ? `locked until ${formatDateTime(user.locked_until)}` : `failed attempts ${user.failed_login_attempts}`}
                    </Badge>
                    <Badge tone="neutral">{user.last_login_at ? `last login ${formatDateTime(user.last_login_at)}` : 'never logged in'}</Badge>
                  </div>
                  <div className="form-grid cols-2">
                    <Field label="Display name">
                      <input value={form.display_name} onChange={(event) => setEditForms({ ...editForms, [user.id]: { ...form, display_name: event.target.value } })} />
                    </Field>
                    <Field label="Role">
                      <select value={form.role} onChange={(event) => setEditForms({ ...editForms, [user.id]: { ...form, role: event.target.value as 'admin' | 'member' } })}>
                        <option value="member">member</option>
                        <option value="admin">admin</option>
                      </select>
                    </Field>
                  </div>
                  <div className="form-grid cols-2">
                    <Field label="Active">
                      <select value={String(form.is_active)} onChange={(event) => setEditForms({ ...editForms, [user.id]: { ...form, is_active: event.target.value === 'true' } })}>
                        <option value="true">active</option>
                        <option value="false">inactive</option>
                      </select>
                    </Field>
                    <Field label="Reset password">
                      <input
                        type="password"
                        value={form.password}
                        onChange={(event) => setEditForms({ ...editForms, [user.id]: { ...form, password: event.target.value } })}
                        placeholder="Leave blank to keep current password"
                      />
                    </Field>
                  </div>
                  <div className="entity-actions">
                    <Button variant="secondary" onClick={() => void handleUpdate(user.id)}>
                      Save changes
                    </Button>
                    {locked ? (
                      <Button variant="ghost" onClick={() => void handleUnlock(user.id)}>
                        Unlock
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
            {!users.length ? <EmptyState title="No users yet" description="Create the first one." /> : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
