import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatElapsed, useTimer } from '../hooks/useTimer.js';
import { fetchFolders, fetchProjects, updateTimeEntry } from '../api/queries.js';
import { ProjectPicker } from './ProjectPicker.js';

/**
 * Toggl-style top-bar timer. While idle, offers a description input, project
 * picker, elapsed time, and a round Start button. While running the readout
 * ticks live, the button flips to Stop, and description / project edits PATCH
 * the running entry in place.
 */
export function TopTimer() {
  const { active, elapsedSeconds, start, stop, refresh } = useTimer();
  const qc = useQueryClient();

  const { data: projectData } = useQuery({
    queryKey: ['projects'],
    queryFn: () => fetchProjects(),
  });
  const { data: folderData } = useQuery({
    queryKey: ['folders'],
    queryFn: () => fetchFolders(),
  });
  const projects = projectData?.projects ?? [];
  const folders = folderData?.folders ?? [];

  const [draftDescription, setDraftDescription] = useState('');
  const [draftProjectId, setDraftProjectId] = useState<string>('');
  const [runningDescription, setRunningDescription] = useState('');

  useEffect(() => {
    setRunningDescription(active?.description ?? '');
  }, [active?.id, active?.description]);

  const running = !!active;

  const patchActive = useMutation({
    mutationFn: (patch: { projectId?: string | null; description?: string | null }) => {
      if (!active) throw new Error('No active timer');
      return updateTimeEntry(active.id, patch);
    },
    onSuccess: () => {
      void refresh();
      qc.invalidateQueries({ queryKey: ['time-entries'] });
    },
  });

  const onProjectChange = (next: string | null) => {
    if (running) patchActive.mutate({ projectId: next });
    else setDraftProjectId(next ?? '');
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

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={running ? runningDescription : draftDescription}
        onChange={(e) =>
          running ? setRunningDescription(e.target.value) : setDraftDescription(e.target.value)
        }
        placeholder="What are you working on?"
        onBlur={commitDescription}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            if (running) (e.target as HTMLInputElement).blur();
            else void toggle();
          }
        }}
        className="w-60 rounded-md border border-ink-400 bg-ink-800 px-3 py-1.5 text-sm text-ink-100 placeholder:text-ink-300 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/40"
      />

      <ProjectPicker
        ariaLabel="Project"
        triggerWidth={200}
        value={running ? (active!.projectId ?? null) : (draftProjectId || null)}
        onChange={onProjectChange}
        folders={folders}
        projects={projects}
      />

      <div
        className={`ml-1 min-w-[72px] text-right font-mono tabular-nums text-[15px] ${
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
        className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-ink-900 ${
          running
            ? 'bg-red-500 hover:bg-red-400 focus:ring-red-400/60'
            : 'bg-brand-500 hover:bg-brand-400 focus:ring-brand-400/60'
        }`}
      >
        {running ? (
          <span className="block h-3 w-3 rounded-[2px] bg-white" />
        ) : (
          <span
            className="block h-0 w-0 border-y-[6px] border-l-[10px] border-y-transparent border-l-white"
            style={{ marginLeft: 2 }}
          />
        )}
      </button>
    </div>
  );
}
