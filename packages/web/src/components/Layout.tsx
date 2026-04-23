import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.js';
import { TopTimer } from './TopTimer.js';
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
    <div className="flex items-center gap-2.5">
      <img src="/outbreak-logo.png" alt="Outbreak" className="h-7 w-7" />
      <div className="flex items-baseline gap-2">
        <span className="text-[15px] font-semibold tracking-tight">outbreak</span>
        <span className="hidden text-xs text-ink-300 sm:inline">For Break Debate</span>
      </div>
    </div>
  );
}

export function Layout() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  return (
    <div className="flex min-h-screen flex-col bg-ink-900">
      <header className="sticky top-0 z-30 border-b border-ink-400 bg-ink-900/95">
        <div className="flex h-14 items-center justify-between px-5">
          <LogoMark />
          <div className="flex items-center gap-4">
            <TopTimer />
            <div className="h-6 w-px bg-ink-400" />
            <FeedbackLauncher />
            {user && (
              <div className="flex items-center gap-2.5">
                {user.avatarUrl && (
                  <img
                    src={user.avatarUrl}
                    alt=""
                    className="h-7 w-7 rounded-full ring-1 ring-ink-400"
                  />
                )}
                <div className="leading-tight">
                  <div className="text-xs font-medium text-ink-100">{user.name}</div>
                  <div className="text-[11px] text-ink-300">
                    {user.role === 'ADMIN' ? 'Admin' : 'Instructor'}
                  </div>
                </div>
                <button
                  onClick={() => void logout()}
                  className="ml-1 rounded-md p-1 text-ink-300 transition-colors hover:bg-ink-700 hover:text-ink-100"
                  aria-label="Sign out"
                  title="Sign out"
                >
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                    <path
                      d="M13 4V3a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1M8 10h9m0 0-3-3m3 3-3 3"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        <nav className="w-56 shrink-0 border-r border-ink-400 px-3 py-4">
          <ul className="space-y-0.5">
            {NAV.filter((item) => !('adminOnly' in item) || !item.adminOnly || isAdmin).map(
              (item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={'end' in item && item.end}
                    className={({ isActive }: { isActive: boolean }) =>
                      `block rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                        isActive
                          ? 'bg-ink-700 text-ink-100'
                          : 'text-ink-200 hover:bg-ink-800 hover:text-ink-100'
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
        <main className="flex-1 px-8 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
