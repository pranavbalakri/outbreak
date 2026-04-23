import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatElapsed, useTimer } from '../hooks/useTimer.js';
import { fetchProjects, updateTimeEntry } from '../api/queries.js';

/**
 * Big Toggl-style timer in the top bar. Shows (when idle) a description input,
 * project picker, elapsed-time readout, and a round Start button. When a timer
 * is running the readout counts up live, the button flips to Stop, and the
 * description / project fields remain editable — edits PATCH the running entry
 * in place.
 */
export function TopTimer() {
  const { active, elapsedSeconds, start, stop, refresh } = useTimer();
  const qc = useQueryClient();

  const { data: projectData } = useQuery({
    queryKey: ['projects'],
    queryFn: () => fetchProjects(),
  });
  const projects = useMemo(() => projectData?.projects ?? [], [projectData]);
  const projectMap = useMemo(() => {
    const m = new Map<string, { id: string; name: string }>();
    for (const p of projects) m.set(p.id, p);
    return m;
  }, [projects]);

  // Draft state used when idle. When a timer is running we edit the entry
  // in place so the draft values track `active` instead of local state.
  const [draftDescription, setDraftDescription] = useState('');
  const [draftProjectId, setDraftProjectId] = useState<string>('');

  // Mirror the active entry's fields into the inputs so they stay in sync
  // across WebSocket updates / cross-tab edits. When the timer stops, reset.
  const [runningDescription, setRunningDescription] = useState('');
  useEffect(() => {
    setRunningDescription(active?.description ?? '');
  }, [active?.id, active?.description]);

  const running = !!active;

  const patchActive = useMutation({
    mutationFn: (patch: {
      projectId?: string | null;
      description?: string | null;
    }) => {
      if (!active) throw new Error('No active timer');
      return updateTimeEntry(active.id, patch);
    },
    onSuccess: () => {
      void refresh();
      qc.invalidateQueries({ queryKey: ['time-entries'] });
    },
  });

  const onProjectChange = (next: string) => {
    if (running) {
      patchActive.mutate({ projectId: next || null });
    } else {
      setDraftProjectId(next);
    }
  };

  const commitDescription = () => {
    if (!running) return;
    const next = runningDescription.trim();
    if ((active?.description ?? '') === next) return;
    patchActive.mutate({ description: next || null });
  };

  const toggle = async () => {
    if (running) {
      await stop();
      setDraftDescription('');
      setDraftProjectId('');
      return;
    }
    await start({
      projectId: draftProjectId || null,
      description: draftDescription.trim() || undefined,
    });
  };

  // Ensure the currently-selected project is in the option list even if the
  // user doesn't have it in their /projects response (e.g. admin attached it
  // from a project they normally wouldn't see).
  const extraOption =
    running && active?.projectId && !projectMap.has(active.projectId)
      ? [{ id: active.projectId, name: 'Project' }]
      : [];

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={running ? runningDescription : draftDescription}
        onChange={(e) =>
          running
            ? setRunningDescription(e.target.value)
            : setDraftDescription(e.target.value)
        }
        placeholder="What are you working on?"
        onBlur={commitDescription}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            if (running) {
              (e.target as HTMLInputElement).blur();
            } else {
              void toggle();
            }
          }
        }}
        className="w-64 rounded-sm border border-ink-400 bg-ink-900/60 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-300 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/40"
      />

      <select
        value={running ? (active!.projectId ?? '') : draftProjectId}
        onChange={(e) => onProjectChange(e.target.value)}
        aria-label="Project"
        className="max-w-[180px] rounded-sm border border-ink-400 bg-ink-900/60 px-2 py-2 text-sm text-ink-100 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/40"
      >
        <option value="">— No project —</option>
        {extraOption.concat(projects).map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      <div
        className={`font-mono tabular-nums text-xl ${
          running ? 'text-brand-200' : 'text-ink-200'
        }`}
        aria-live="polite"
      >
        {formatElapsed(elapsedSeconds)}
      </div>

      <button
        type="button"
        onClick={() => void toggle()}
        aria-label={running ? 'Stop timer' : 'Start timer'}
        className={`flex h-12 w-12 items-center justify-center rounded-full transition focus:outline-none focus:ring-2 focus:ring-brand-400/60 ${
          running
            ? 'bg-red-500 hover:bg-red-400 shadow-[0_0_0_1px_rgba(239,68,68,0.5),0_0_28px_-6px_rgba(239,68,68,0.8)]'
            : 'bg-brand-500 hover:bg-brand-400 shadow-[0_0_0_1px_rgba(26,115,255,0.5),0_0_28px_-6px_rgba(26,115,255,0.8)]'
        }`}
      >
        {running ? (
          <span className="block h-4 w-4 rounded-[2px] bg-white" />
        ) : (
          <span
            className="block h-0 w-0 border-y-[9px] border-l-[14px] border-y-transparent border-l-white"
            style={{ marginLeft: 3 }}
          />
        )}
      </button>
    </div>
  );
}
