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
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <img src="/outbreak-logo.png" alt="Outbreak" className="h-10 w-10" />
        </div>

        <h1 className="font-sans text-5xl font-bold tracking-tight">
          outbreak<span className="text-brand-500">.</span>
        </h1>
        <div className="mt-2 text-sm text-ink-200">For Break Debate</div>

        <div className="hr-brand my-6" />

        <p className="text-sm text-ink-100">
          Internal time &amp; project tracking. Sign in with the Google account your admin
          has authorized.
        </p>

        <a
          href={href}
          className="mt-8 flex w-full items-center justify-center gap-3 rounded-sm bg-brand-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-brand-400 shadow-[0_0_0_1px_rgba(26,115,255,0.4),0_0_28px_-6px_rgba(26,115,255,0.8)]"
        >
          <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
            <path
              fill="#fff"
              d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C33.9 5.9 29.2 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
            />
          </svg>
          Sign in with Google
        </a>

        <p className="mt-4 text-center text-xs text-ink-200">
          Request access from your admin if you haven&apos;t been invited.
        </p>
      </div>
    </div>
  );
}
