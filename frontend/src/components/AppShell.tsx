import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Badge } from './Primitives';
import { useAuth } from '../state/AuthContext';

const navItems = [
  { to: '/', label: 'Dashboard', description: 'Start with what needs attention now.' },
  { to: '/projects', label: 'Projects', description: 'Review tracks, milestones, and targets.' },
  { to: '/tasks', label: 'Tasks', description: 'Capture and move the next concrete actions.' },
  { to: '/daily-logs', label: 'Daily Logs', description: 'Record today, blockers, and next steps.' }
];

const quickLinks = [
  { to: '/tasks', label: 'New task' },
  { to: '/daily-logs', label: 'Write log' },
  { to: '/projects', label: 'New project' }
];

export function AppShell() {
  const { logout, user } = useAuth();
  const location = useLocation();
  const visibleNavItems = user?.role === 'admin'
    ? [...navItems, { to: '/users', label: 'Users', description: 'Manage accounts, lockouts, and roles.' }]
    : navItems;
  const currentItem =
    visibleNavItems.find((item) => (item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to))) ??
    visibleNavItems[0];

  return (
    <div className="app-shell">
      <aside className="sidebar card">
        <div className="brand">
          <div className="brand-mark">T</div>
          <div>
            <div className="brand-title">trace_itself</div>
            <div className="muted small">Private execution dashboard</div>
          </div>
        </div>

        <div className="sidebar-panel">
          <div className="sidebar-panel-title">Current focus</div>
          <strong>{currentItem.label}</strong>
          <p className="muted small">{currentItem.description}</p>
        </div>

        <nav className="nav">
          {visibleNavItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'}>
              <span className="nav-title">{item.label}</span>
              <span className="nav-caption">{item.description}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-panel">
          <div className="sidebar-panel-title">Quick capture</div>
          <div className="quick-actions-grid">
            {quickLinks.map((item) => (
              <NavLink key={item.label} className="quick-link" to={item.to}>
                {item.label}
              </NavLink>
            ))}
          </div>
          <p className="muted small">
            Keep task status and your daily log current so the dashboard stays trustworthy.
          </p>
        </div>

        <div className="account-card">
          <div className="helper-row">
            <div>
              <div className="muted small">Signed in as</div>
              <div className="account-name">{user?.display_name ?? 'Unknown user'}</div>
            </div>
            <Badge tone={user?.role === 'admin' ? 'warning' : 'info'}>{user?.role ?? 'member'}</Badge>
          </div>
          <div className="account-meta">@{user?.username ?? 'unknown'}</div>
        </div>

        <button className="btn btn-ghost sidebar-logout" type="button" onClick={() => void logout()}>
          Sign out
        </button>
      </aside>

      <div className="content">
        <Outlet />
      </div>
    </div>
  );
}
