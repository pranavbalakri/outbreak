import { useCallback, useEffect, useState } from 'react';
import type { FolderDto, ProjectDto, TimeEntryDto } from '@outbreak/shared';
import { WEB_ORIGIN } from '../lib/config.js';
import { readStorage, writeStorage, clearSession } from '../lib/storage.js';
import {
  ApiError,
  fetchAssignedProjects,
  fetchCurrentTimer,
  fetchFolders,
  fetchMe,
  startTimer,
  stopTimer,
  updateTimeEntry,
} from '../lib/api.js';
import { ProjectPicker } from './ProjectPicker.js';

type Status = 'loading' | 'signed-out' | 'signed-in' | 'error';

interface PopupState {
  status: Status;
  errorMessage?: string;
  userName?: string;
  timer: TimeEntryDto | null;
  projects: ProjectDto[];
  folders: FolderDto[];
  mruProjectId: string | null | undefined;
}

const INITIAL: PopupState = {
  status: 'loading',
  timer: null,
  projects: [],
  folders: [],
  mruProjectId: undefined,
};

function fmtElapsed(startedAt: string): string {
  const seconds = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  if (seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
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
  const [online, setOnline] = useState(navigator.onLine);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);
  // Draft project selection while no timer is running.
  const [draftProjectId, setDraftProjectId] = useState<string | null>(null);
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!state.timer || state.timer.endedAt) return;
    const h = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(h);
  }, [state.timer]);

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
    const { token, mruProjectId } = await readStorage('token', 'mruProjectId');
    if (!token) {
      setState({ ...INITIAL, status: 'signed-out' });
      return;
    }
    try {
      const [me, timer, projects, folders] = await Promise.all([
        fetchMe(),
        fetchCurrentTimer(),
        fetchAssignedProjects(),
        fetchFolders(),
      ]);
      setState({
        status: 'signed-in',
        userName: me.user.name,
        timer: timer.entry,
        projects: projects.projects,
        folders: folders.folders,
        mruProjectId: mruProjectId ?? undefined,
      });
      setDraftProjectId(mruProjectId ?? null);
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
      const result = await chrome.identity.launchWebAuthFlow({ url, interactive: true });
      if (!result) throw new Error('Sign-in was cancelled');
      const hashIndex = result.indexOf('#');
      const fragment = hashIndex >= 0 ? result.slice(hashIndex + 1) : '';
      const params = new URLSearchParams(fragment);
      const token = params.get('token');
      if (!token) throw new Error('No token in redirect URL');
      await writeStorage({ token });
    } catch (err) {
      setState((s) => ({ ...s, status: 'error', errorMessage: (err as Error).message }));
    }
  };

  const signOut = async () => {
    await clearSession();
    setState({ ...INITIAL, status: 'signed-out' });
  };

  const doStart = async () => {
    setBusy(true);
    try {
      const projectName = state.projects.find((p) => p.id === draftProjectId)?.name ?? null;
      const pageNote = description.trim() || (await activeTabNote());
      const { entry } = await startTimer({
        projectId: draftProjectId,
        ...(pageNote ? { description: pageNote } : {}),
      });
      await writeStorage({
        mruProjectId: draftProjectId,
        mruProjectName: projectName,
      });
      setState((s) => ({ ...s, timer: entry, mruProjectId: draftProjectId }));
      setDescription('');
    } catch (err) {
      setState((s) => ({ ...s, errorMessage: (err as Error).message }));
    } finally {
      setBusy(false);
    }
  };

  const doStop = async () => {
    setBusy(true);
    try {
      await stopTimer();
      setState((s) => ({ ...s, timer: null }));
    } catch (err) {
      setState((s) => ({ ...s, errorMessage: (err as Error).message }));
    } finally {
      setBusy(false);
    }
  };

  // Editing project on the running timer.
  const onRunningProjectChange = async (next: string | null) => {
    if (!state.timer) return;
    setBusy(true);
    try {
      const { entry } = await updateTimeEntry(state.timer.id, { projectId: next });
      setState((s) => ({ ...s, timer: entry }));
    } catch (err) {
      setState((s) => ({ ...s, errorMessage: (err as Error).message }));
    } finally {
      setBusy(false);
    }
  };

  if (state.status === 'loading') {
    return <Shell>
      <div className="flex h-32 items-center justify-center text-sm text-ink-200">
        Loading…
      </div>
    </Shell>;
  }

  if (state.status === 'signed-out') {
    return (
      <Shell>
        <div className="flex flex-col items-center px-5 py-8 text-center">
          <img src="/src/icons/icon48.png" alt="" className="mb-3 h-10 w-10" />
          <div className="text-base font-semibold">Outbreak</div>
          <div className="mt-1 text-xs text-ink-200">For Break Debate</div>
          <button
            onClick={() => void signIn()}
            className="mt-6 w-full rounded-md border border-ink-400 bg-ink-800 px-4 py-2 text-sm font-medium text-ink-100 transition-colors hover:bg-ink-700"
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

  const running = state.timer && !state.timer.endedAt;

  return (
    <Shell>
      {!online && (
        <div className="border-b border-ink-400 bg-red-500/10 px-4 py-1.5 text-xs text-red-300">
          Offline — timer state may be stale.
        </div>
      )}

      <header className="flex items-center justify-between border-b border-ink-400 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <img src="/src/icons/icon48.png" alt="" className="h-5 w-5" />
          <span className="text-sm font-semibold">outbreak</span>
        </div>
        <button
          onClick={() => void signOut()}
          className="rounded-md px-1.5 py-0.5 text-xs text-ink-200 transition-colors hover:bg-ink-700 hover:text-ink-100"
        >
          Sign out
        </button>
      </header>

      <section className="space-y-3 px-4 py-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={!online || busy}
            onClick={() => void (running ? doStop() : doStart())}
            aria-label={running ? 'Stop timer' : 'Start timer'}
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-ink-900 disabled:opacity-50 ${
              running
                ? 'bg-red-500 hover:bg-red-400 focus:ring-red-400/60'
                : 'bg-brand-500 hover:bg-brand-400 focus:ring-brand-400/60'
            }`}
          >
            {running ? (
              <span className="block h-4 w-4 rounded-[2px] bg-white" />
            ) : (
              <span
                className="block h-0 w-0 border-y-[8px] border-l-[13px] border-y-transparent border-l-white"
                style={{ marginLeft: 2 }}
              />
            )}
          </button>
          <div className="min-w-0 flex-1">
            <div
              className={`font-mono tabular-nums text-2xl ${
                running ? 'text-brand-200' : 'text-ink-200'
              }`}
            >
              {state.timer ? fmtElapsed(state.timer.startedAt) : '0:00'}
            </div>
            <div className="truncate text-xs text-ink-300">
              {running
                ? state.timer!.projectId
                  ? state.projects.find((p) => p.id === state.timer!.projectId)?.name ??
                    'Project'
                  : 'General time'
                : 'Ready to start'}
            </div>
          </div>
        </div>

        {running ? (
          <>
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-300">
                Project
              </div>
              <ProjectPicker
                value={state.timer!.projectId}
                onChange={(v) => void onRunningProjectChange(v)}
                folders={state.folders}
                projects={state.projects}
                mruProjectId={state.mruProjectId}
                disabled={!online || busy}
              />
            </div>
            {state.timer!.description && (
              <div className="rounded-md border border-ink-400 bg-ink-800 px-3 py-2 text-xs text-ink-200">
                {state.timer!.description}
              </div>
            )}
          </>
        ) : (
          <>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What are you working on?"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !busy && online) void doStart();
              }}
              className="w-full rounded-md border border-ink-400 bg-ink-800 px-2.5 py-1.5 text-sm text-ink-100 placeholder:text-ink-300 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/40"
            />
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-300">
                Project
              </div>
              <ProjectPicker
                value={draftProjectId}
                onChange={setDraftProjectId}
                folders={state.folders}
                projects={state.projects}
                mruProjectId={state.mruProjectId}
                disabled={busy}
              />
            </div>
          </>
        )}
      </section>

      {state.errorMessage && (
        <div className="border-t border-ink-400 bg-red-500/10 px-4 py-2 text-xs text-red-300">
          {state.errorMessage}
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-[340px] bg-ink-900 font-sans text-ink-100">{children}</div>
  );
}
