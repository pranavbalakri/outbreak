import { useQuery } from '@tanstack/react-query';
import { formatElapsed, useTimer } from '../hooks/useTimer.js';
import { fetchProjects } from '../api/queries.js';

export function TimerChip() {
  const { active, elapsedSeconds, stop } = useTimer();

  const { data: projectData } = useQuery({
    queryKey: ['projects'],
    queryFn: () => fetchProjects(),
    enabled: !!active?.projectId,
  });
  const projectName =
    active?.projectId && projectData?.projects.find((p) => p.id === active.projectId)?.name;

  if (!active) {
    return (
      <span className="inline-flex items-center gap-2 rounded-sm border border-ink-400 bg-ink-800/60 px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-ink-200">
        <span className="h-1.5 w-1.5 rounded-full bg-ink-300" />
        not running
      </span>
    );
  }

  return (
    <div className="inline-flex items-center gap-3 rounded-sm border border-brand-500/40 bg-brand-500/10 px-2.5 py-1 text-sm">
      <span className="h-1.5 w-1.5 rounded-full bg-brand-400 animate-pulse" />
      <span className="font-mono tabular-nums text-brand-200">
        {formatElapsed(elapsedSeconds)}
      </span>
      <span className="font-mono text-[11px] uppercase tracking-wider text-ink-200">
        {projectName ?? (active.projectId ? 'project' : 'unassigned')}
      </span>
      <button
        type="button"
        onClick={() => void stop()}
        className="rounded-sm border border-ink-400 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-ink-100 hover:border-red-500/50 hover:text-red-300"
      >
        stop
      </button>
    </div>
  );
}
