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
      <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">
        <span className="h-2 w-2 rounded-full bg-slate-300" />
        Not running
      </span>
    );
  }

  return (
    <div className="inline-flex items-center gap-3 rounded-full bg-emerald-50 px-3 py-1 text-sm">
      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
      <span className="font-mono tabular-nums text-emerald-900">
        {formatElapsed(elapsedSeconds)}
      </span>
      <span className="text-xs text-emerald-800/80">
        {projectName ?? (active.projectId ? 'Project' : 'Unassigned')}
      </span>
      <button
        type="button"
        onClick={() => void stop()}
        className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
      >
        Stop
      </button>
    </div>
  );
}
