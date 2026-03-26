import { NavLink, Outlet } from 'react-router-dom';
import { Badge } from './Primitives';
import { useAuth } from '../state/AuthContext';

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/projects', label: 'Projects' },
  { to: '/tasks', label: 'Tasks' },
  { to: '/daily-logs', label: 'Logs' }
];

export function AppShell() {
  const { logout, user } = useAuth();
  const visibleNavItems = user?.role === 'admin' ? [...navItems, { to: '/users', label: 'Users' }] : navItems;

  return (
    <div className="app-shell">
      <aside className="sidebar card">
        <div className="brand">
          <div className="brand-mark">T</div>
          <div>
            <div className="brand-title">trace_itself</div>
          </div>
        </div>

        <nav className="nav">
          {visibleNavItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'}>
              <span className="nav-title">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="account-card">
          <div className="helper-row">
            <div className="account-name">{user?.display_name ?? 'Unknown user'}</div>
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
