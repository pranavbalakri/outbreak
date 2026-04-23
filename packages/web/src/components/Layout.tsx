import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.js';
import { TopTimer } from './TopTimer.js';
import { NotificationBell } from './NotificationBell.js';
import { FeedbackLauncher } from './FeedbackLauncher.js';

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/calendar', label: 'Calendar' },
  { to: '/projects', label: 'Projects' },
  { to: '/timesheet', label: 'Timesheet' },
  { to: '/reports', label: 'Reports', adminOnly: true },
  { to: '/team', label: 'Team', adminOnly: true },
  { to: '/settings', label: 'Settings' },
] as const;

function LogoMark() {
  return (
    <div className="flex items-center gap-3">
      <img src="/outbreak-logo.png" alt="Outbreak" className="h-9 w-9" />
      <div className="leading-none">
        <div className="font-sans text-xl font-bold tracking-tight">
          outbreak<span className="text-brand-500">.</span>
        </div>
        <div className="mt-1 text-xs text-ink-200">For Break Debate</div>
      </div>
    </div>
  );
}

export function Layout() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-ink-400 bg-ink-900/80 backdrop-blur">
        <div className="flex h-16 items-center justify-between px-6">
          <LogoMark />
          <div className="flex items-center gap-5">
            <TopTimer />
            <NotificationBell />
            <FeedbackLauncher />
            {user && (
              <div className="flex items-center gap-3 border-l border-ink-400 pl-5">
                {user.avatarUrl && (
                  <img
                    src={user.avatarUrl}
                    alt=""
                    className="h-7 w-7 rounded-sm ring-1 ring-ink-400"
                  />
                )}
                <div className="leading-tight">
                  <div className="font-mono text-xs text-ink-100">{user.name}</div>
                  <div className="tk-sm text-[10px]">{user.role}</div>
                </div>
                <button
                  onClick={() => void logout()}
                  className="text-xs text-ink-200 hover:text-brand-300"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="hr-brand" />
      </header>

      <div className="flex flex-1">
        <nav className="w-52 border-r border-ink-400 bg-ink-900/40 py-4">
          <ul className="space-y-0.5 px-2">
            {NAV.filter((item) => !('adminOnly' in item) || !item.adminOnly || isAdmin).map(
              (item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={'end' in item && item.end}
                    className={({ isActive }: { isActive: boolean }) =>
                      `block rounded-sm px-3 py-1.5 text-sm transition ${
                        isActive
                          ? 'border-l-2 border-brand-500 bg-brand-500/10 text-brand-200 pl-[10px]'
                          : 'border-l-2 border-transparent text-ink-100 hover:text-brand-200'
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
