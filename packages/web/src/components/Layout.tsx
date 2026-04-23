import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.js';
import { TimerChip } from './TimerChip.js';
import { NotificationBell } from './NotificationBell.js';
import { FeedbackLauncher } from './FeedbackLauncher.js';

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/projects', label: 'Projects' },
  { to: '/timesheet', label: 'Timesheet' },
  { to: '/reports', label: 'Reports', adminOnly: true },
  { to: '/team', label: 'Team', adminOnly: true },
  { to: '/settings', label: 'Settings' },
] as const;

export function Layout() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
        <div className="flex items-center gap-3 text-lg font-semibold">
          <span aria-hidden>⏱️</span>
          <span>Outbreak</span>
        </div>
        <div className="flex items-center gap-4">
          <TimerChip />
          <NotificationBell />
          <FeedbackLauncher />
          {user && (
            <div className="flex items-center gap-2">
              {user.avatarUrl && (
                <img
                  src={user.avatarUrl}
                  alt=""
                  className="h-7 w-7 rounded-full ring-1 ring-slate-200"
                />
              )}
              <span className="text-sm text-slate-700">{user.name}</span>
              <button
                onClick={() => void logout()}
                className="text-xs text-slate-500 hover:text-slate-900"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="flex flex-1">
        <nav className="w-48 border-r border-slate-200 bg-white py-4">
          <ul className="space-y-1 px-2">
            {NAV.filter((item) => !('adminOnly' in item) || !item.adminOnly || isAdmin).map(
              (item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={'end' in item && item.end}
                    className={({ isActive }: { isActive: boolean }) =>
                      `block rounded-md px-3 py-1.5 text-sm ${
                        isActive
                          ? 'bg-brand-50 text-brand-700 font-medium'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                </li>
              ),
            )}
          </ul>
        </nav>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
