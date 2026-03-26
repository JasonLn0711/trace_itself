import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../state/AuthContext';

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/projects', label: 'Projects' },
  { to: '/tasks', label: 'Tasks' },
  { to: '/daily-logs', label: 'Daily Logs' }
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
            <div className="muted small">Private execution dashboard</div>
          </div>
        </div>

        <nav className="nav">
          {visibleNavItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="account-card">
          <div className="muted small">Signed in as</div>
          <div className="account-name">{user?.display_name ?? 'Unknown user'}</div>
          <div className="account-meta">@{user?.username ?? 'unknown'} · {user?.role ?? 'member'}</div>
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
