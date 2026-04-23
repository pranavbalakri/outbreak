import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ProjectDto, TimeEntryDto } from '@outbreak/shared';
import { WEB_ORIGIN } from '../lib/config.js';
import { readStorage, writeStorage, clearSession } from '../lib/storage.js';
import {
  ApiError,
  fetchAssignedProjects,
  fetchCurrentTimer,
  fetchMe,
  startTimer,
  stopTimer,
} from '../lib/api.js';

type Status = 'loading' | 'signed-out' | 'signed-in' | 'error';

interface PopupState {
  status: Status;
  errorMessage?: string;
  userName?: string;
  timer: TimeEntryDto | null;
  projects: ProjectDto[];
  mruProjectId: string | null | undefined;
  mruProjectName: string | null | undefined;
}

const INITIAL: PopupState = {
  status: 'loading',
  timer: null,
  projects: [],
  mruProjectId: undefined,
  mruProjectName: undefined,
};

function fmtElapsed(startedAt: string): string {
  const seconds = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  if (seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}:${String(s).padStart(2, '0')}`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

async function activeTabNote(): Promise<string | undefined> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return undefined;
    return tab.title ? `${tab.title} — ${tab.url}` : tab.url;
  } catch {
    return undefined;
  }
}

export function Popup() {
  const [state, setState] = useState<PopupState>(INITIAL);
  const [query, setQuery] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const [actionInFlight, setActionInFlight] = useState(false);
  const [, forceTick] = useState(0);

  // Re-render every second while a timer is running so the elapsed count updates.
  useEffect(() => {
    if (!state.timer || state.timer.endedAt) return;
    const h = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(h);
  }, [state.timer]);

  // Online/offline listener — the service worker also tracks this, but the
  // popup needs its own read for instant paint.
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const refresh = useCallback(async () => {
    const { token, mruProjectId, mruProjectName } = await readStorage(
      'token',
      'mruProjectId',
      'mruProjectName',
    );
    if (!token) {
      setState({ ...INITIAL, status: 'signed-out' });
      return;
    }
    try {
      const [me, timer, projects] = await Promise.all([
        fetchMe(),
        fetchCurrentTimer(),
        fetchAssignedProjects(),
      ]);
      setState({
        status: 'signed-in',
        userName: me.user.name,
        timer: timer.entry,
        projects: projects.projects,
        mruProjectId,
        mruProjectName,
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await clearSession();
        setState({ ...INITIAL, status: 'signed-out' });
        return;
      }
      setState({ ...INITIAL, status: 'error', errorMessage: (err as Error).message });
    }
  }, []);

  useEffect(() => {
    void refresh();
    const listener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: chrome.storage.AreaName,
    ) => {
      if (area !== 'local') return;
      if ('token' in changes || 'mruProjectId' in changes) void refresh();
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [refresh]);

  const signIn = async () => {
    try {
      const redirectUrl = chrome.identity.getRedirectURL();
      const url = `${WEB_ORIGIN}/extension/connect?redirect=${encodeURIComponent(redirectUrl)}`;
      const result = await chrome.identity.launchWebAuthFlow({
        url,
        interactive: true,
      });
      if (!result) throw new Error('Sign-in was cancelled');
      const hashIndex = result.indexOf('#');
      const fragment = hashIndex >= 0 ? result.slice(hashIndex + 1) : '';
      const params = new URLSearchParams(fragment);
      const token = params.get('token');
      if (!token) throw new Error('No token in redirect URL');

      await writeStorage({ token });
      // Storage change listener above picks it up and re-renders.
    } catch (err) {
      setState((s) => ({ ...s, status: 'error', errorMessage: (err as Error).message }));
    }
  };

  const signOut = async () => {
    await clearSession();
    setState({ ...INITIAL, status: 'signed-out' });
  };

  const doStart = async (project: ProjectDto | null) => {
    setActionInFlight(true);
    try {
      const description = await activeTabNote();
      const { entry } = await startTimer({
        projectId: project?.id ?? null,
        ...(description ? { description } : {}),
      });
      await writeStorage({
        mruProjectId: project?.id ?? null,
        mruProjectName: project?.name ?? null,
      });
      setState((s) => ({
        ...s,
        timer: entry,
        mruProjectId: project?.id ?? null,
        mruProjectName: project?.name ?? null,
      }));
    } catch (err) {
      setState((s) => ({ ...s, errorMessage: (err as Error).message }));
    } finally {
      setActionInFlight(false);
    }
  };

  const doStop = async () => {
    setActionInFlight(true);
    try {
      await stopTimer();
      setState((s) => ({ ...s, timer: null }));
    } catch (err) {
      setState((s) => ({ ...s, errorMessage: (err as Error).message }));
    } finally {
      setActionInFlight(false);
    }
  };

  const filteredProjects = useMemo(() => {
    if (!query) return state.projects;
    const q = query.toLowerCase();
    return state.projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [state.projects, query]);

  if (state.status === 'loading') {
    return <Shell>Loading…</Shell>;
  }

  if (state.status === 'signed-out') {
    return (
      <Shell>
        <div className="px-4 py-6 text-center">
          <div className="mb-4 text-lg font-semibold text-white">Outbreak</div>
          <div className="mb-4 text-sm text-slate-400">
            Sign in with your Google account to start tracking research time.
          </div>
          <button
            onClick={() => void signIn()}
            className="w-full rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Sign in with Google
          </button>
          {state.errorMessage && (
            <div className="mt-3 text-xs text-red-400">{state.errorMessage}</div>
          )}
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {!online && (
        <div className="border-b border-red-900/50 bg-red-950 px-4 py-2 text-xs text-red-300">
          Offline — timer state may be stale. Reconnect to change it.
        </div>
      )}

      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-2">
        <div className="text-sm font-semibold text-white">Outbreak</div>
        <button
          onClick={() => void signOut()}
          className="text-xs text-slate-400 hover:text-white"
        >
          Sign out
        </button>
      </header>

      {state.timer && !state.timer.endedAt ? (
        <section className="border-b border-slate-800 px-4 py-4">
          <div className="text-xs uppercase text-slate-400">Running</div>
          <div className="mt-1 flex items-baseline gap-3">
            <div className="font-mono text-2xl text-white">
              {fmtElapsed(state.timer.startedAt)}
            </div>
            <div className="truncate text-sm text-slate-300">
              {state.timer.projectId
                ? state.projects.find((p) => p.id === state.timer?.projectId)?.name ??
                  'Project'
                : 'General time'}
            </div>
          </div>
          <button
            onClick={() => void doStop()}
            disabled={!online || actionInFlight}
            className="mt-3 w-full rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            Stop
          </button>
        </section>
      ) : (
        <section className="border-b border-slate-800 px-4 py-3 text-sm text-slate-400">
          Not running. Pick a project below.
        </section>
      )}

      <div className="px-4 py-3">
        <input
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-white placeholder:text-slate-500 focus:border-brand-500 focus:outline-none"
          placeholder="Search projects…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <ul className="max-h-72 overflow-y-auto border-t border-slate-800">
        <li>
          <button
            onClick={() => void doStart(null)}
            disabled={!online || actionInFlight || !!state.timer}
            className="flex w-full items-center justify-between border-b border-slate-800 px-4 py-2 text-left text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-40"
          >
            <span>Start without a project (general time)</span>
            <span className="text-xs text-slate-400">↵</span>
          </button>
        </li>
        {filteredProjects.map((p) => (
          <li key={p.id}>
            <button
              onClick={() => void doStart(p)}
              disabled={!online || actionInFlight || !!state.timer}
              className="flex w-full items-center justify-between border-b border-slate-800 px-4 py-2 text-left text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-40"
            >
              <span className="truncate">{p.name}</span>
              {state.mruProjectId === p.id && (
                <span className="text-[10px] uppercase text-brand-400">MRU</span>
              )}
            </button>
          </li>
        ))}
        {filteredProjects.length === 0 && (
          <li className="px-4 py-3 text-xs text-slate-500">No matching projects.</li>
        )}
      </ul>

      {state.errorMessage && (
        <div className="border-t border-red-900/50 bg-red-950/40 px-4 py-2 text-xs text-red-300">
          {state.errorMessage}
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="w-[340px] bg-slate-900 text-slate-100">{children}</div>;
}
