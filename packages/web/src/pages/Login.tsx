import { useLocation } from 'react-router-dom';
import { apiOrigin } from '../api/client.js';

export function LoginPage() {
  const location = useLocation();
  const from =
    (location.state as { from?: string } | null)?.from ??
    new URLSearchParams(location.search).get('redirect') ??
    '/';

  const href = `${apiOrigin()}/auth/google/start?redirect=${encodeURIComponent(from)}`;

  return (
    <div className="relative flex min-h-screen items-center justify-center px-6">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-16 top-10 h-40 w-40 dash opacity-40" />
        <div className="absolute right-10 bottom-16 h-56 w-56 dash opacity-30" />
        <div className="absolute right-1/3 top-1/4 h-24 w-24 dash opacity-30" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center border border-dashed border-brand-500/60">
            <span className="font-mono text-xs font-bold text-brand-400">OB</span>
          </div>
          <span className="tk-sm">unofficial tracker</span>
        </div>

        <h1 className="font-sans text-5xl font-bold tracking-tight">
          outbreak<span className="text-brand-500">.</span>
          <span className="text-brand-400">track</span>
        </h1>
        <div className="tk-sm mt-2">Debate coaching · est. MMXXVI</div>

        <div className="hr-brand my-6" />

        <div className="flex items-center gap-3 font-mono text-xs text-ink-200">
          <span className="blink inline-block h-1.5 w-1.5 rounded-full bg-brand-400" />
          SYSTEM ONLINE · AWAITING AUTH
        </div>

        <p className="mt-6 text-sm text-ink-100">
          Internal time &amp; project tracking. Sign in with the Google account your admin
          has authorized.
        </p>

        <a
          href={href}
          className="mt-8 flex w-full items-center justify-center gap-3 rounded-sm bg-brand-500 px-4 py-3 font-mono text-sm font-medium text-white transition hover:bg-brand-400 shadow-[0_0_0_1px_rgba(26,115,255,0.4),0_0_28px_-6px_rgba(26,115,255,0.8)]"
        >
          <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
            <path
              fill="#fff"
              d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C33.9 5.9 29.2 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
            />
          </svg>
          [ sign in with google ]
        </a>

        <p className="mt-4 text-center font-mono text-[11px] text-ink-200">
          &gt; request access from your admin if you haven&apos;t been invited
        </p>
      </div>
    </div>
  );
}
