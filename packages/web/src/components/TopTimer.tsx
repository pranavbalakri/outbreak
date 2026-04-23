import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatElapsed, useTimer } from '../hooks/useTimer.js';
import { fetchProjects } from '../api/queries.js';

/**
 * Big Toggl-style timer in the top bar. Shows (when idle) a description input,
 * project picker, elapsed-time readout, and a round Start button. When a timer
 * is running the readout counts up live and the button flips to Stop.
 */
export function TopTimer() {
  const { active, elapsedSeconds, start, stop } = useTimer();

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

  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState<string>(''); // '' means unassigned

  const running = !!active;
  const displayProject = running
    ? active!.projectId
      ? (projectMap.get(active!.projectId)?.name ?? 'Project')
      : 'Unassigned'
    : '';
  const displayDescription = running ? (active!.description ?? '') : '';

  const toggle = async () => {
    if (running) {
      await stop();
      setDescription('');
      setProjectId('');
      return;
    }
    await start({
      projectId: projectId || null,
      description: description.trim() || undefined,
    });
  };

  return (
    <div className="flex items-center gap-2">
      {/* Description / label */}
      <input
        type="text"
        value={running ? displayDescription : description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="What are you working on?"
        disabled={running}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !running) void toggle();
        }}
        className="w-64 rounded-sm border border-ink-400 bg-ink-900/60 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-300 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/40 disabled:opacity-80"
      />

      {/* Project picker */}
      <select
        value={running ? (active!.projectId ?? '') : projectId}
        onChange={(e) => setProjectId(e.target.value)}
        disabled={running}
        aria-label="Project"
        className="max-w-[180px] rounded-sm border border-ink-400 bg-ink-900/60 px-2 py-2 text-sm text-ink-100 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/40 disabled:opacity-80"
      >
        <option value="">— No project —</option>
        {(running && active!.projectId && !projectMap.has(active!.projectId)
          ? [{ id: active!.projectId, name: displayProject }]
          : []
        ).concat(projects).map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      {/* Elapsed time */}
      <div
        className={`font-mono tabular-nums text-xl ${
          running ? 'text-brand-200' : 'text-ink-200'
        }`}
        aria-live="polite"
      >
        {formatElapsed(elapsedSeconds)}
      </div>

      {/* Round play/stop button */}
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
          // Stop: solid square
          <span className="block h-4 w-4 rounded-[2px] bg-white" />
        ) : (
          // Play: triangle
          <span
            className="block h-0 w-0 border-y-[9px] border-l-[14px] border-y-transparent border-l-white"
            style={{ marginLeft: 3 }}
          />
        )}
      </button>
    </div>
  );
}
