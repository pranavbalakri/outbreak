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
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <img src="/outbreak-logo.png" alt="Outbreak" className="mb-5 h-10 w-10" />
          <h1 className="text-2xl font-semibold tracking-tight">Sign in to Outbreak</h1>
          <p className="mt-2 text-sm text-ink-200">
            For Break Debate · internal time &amp; project tracking
          </p>
        </div>

        <a
          href={href}
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-md border border-ink-400 bg-ink-800 px-4 py-2.5 text-sm font-medium text-ink-100 transition-colors hover:bg-ink-700"
        >
          <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C33.9 5.9 29.2 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 19 13 24 13c3.1 0 5.8 1.2 7.9 3l5.7-5.7C33.9 5.9 29.2 4 24 4 16.4 4 9.9 8.4 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.1 0 9.8-1.9 13.3-5.1l-6.2-5c-2 1.3-4.4 2.1-7.1 2.1-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.8 39.5 16.3 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4-4.1 5.4l6.2 5c4.3-3.9 7-9.6 7-15.9 0-1.3-.1-2.4-.4-3.5z"/>
          </svg>
          Sign in with Google
        </a>

        <p className="mt-4 text-center text-xs text-ink-300">
          Request access from your admin if you haven&apos;t been invited.
        </p>
      </div>
    </div>
  );
}
