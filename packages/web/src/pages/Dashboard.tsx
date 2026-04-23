import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchProjects,
  fetchTimeEntries,
  updateTimeEntry,
  deleteTimeEntry,
  fetchUpcomingProjects,
} from '../api/queries.js';
import type { TimeEntryDto } from '@outbreak/shared';
import { formatElapsed, useTimer } from '../hooks/useTimer.js';
import { Badge, Button, Card, Field, Select, inputClass } from '../components/ui.js';
import { useConfirm } from '../components/Confirm.js';
import { formatMinutes, formatTime, durationMinutes } from '../lib/format.js';
import { Link } from 'react-router-dom';

export function DashboardPage() {
  const { active, elapsedSeconds, start, stop } = useTimer();
  const queryClient = useQueryClient();

  const { data: projectData } = useQuery({
    queryKey: ['projects'],
    queryFn: () => fetchProjects(),
  });
  const assigned = projectData?.projects ?? [];

  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, []);
  const todayEnd = useMemo(() => {
    const d = new Date();
    d.setHours(24, 0, 0, 0);
    return d.toISOString();
  }, []);

  const { data: todayData } = useQuery({
    queryKey: ['time-entries', 'today'],
    queryFn: () => fetchTimeEntries({ from: todayStart, to: todayEnd }),
  });

  const { data: upcomingData } = useQuery({
    queryKey: ['upcoming-projects'],
    queryFn: fetchUpcomingProjects,
  });

  const [selectedProject, setSelectedProject] = useState('');
  const [description, setDescription] = useState('');

  const onStart = async () => {
    await start({
      projectId: selectedProject || null,
      description: description || undefined,
    });
    setDescription('');
  };

  const projectNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of assigned) map.set(p.id, p.name);
    return map;
  }, [assigned]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Today</h1>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Running timer */}
        <Card className="p-5 lg:col-span-1">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-200">
            Timer
          </div>
          {active ? (
            <div>
              <div className="font-mono text-5xl tabular-nums text-brand-200">
                {formatElapsed(elapsedSeconds)}
              </div>
              <div className="mt-2 text-sm text-ink-200">
                {active.projectId
                  ? (projectNameById.get(active.projectId) ?? 'Project')
                  : 'Unassigned time'}
              </div>
              {active.description && (
                <div className="mt-1 text-xs text-ink-200">{active.description}</div>
              )}
              <Button variant="danger" className="mt-4" onClick={() => void stop()}>
                Stop
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <Field label="Project">
                <Select
                  value={selectedProject}
                  onChange={setSelectedProject}
                  placeholder="No project (general time)"
                  options={[
                    { value: '', label: 'No project (general time)' },
                    ...assigned.map((p) => ({ value: p.id, label: p.name })),
                  ]}
                />
              </Field>
              <Field label="Note (optional)">
                <input
                  className={inputClass}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What are you working on?"
                />
              </Field>
              <Button onClick={() => void onStart()}>Start timer</Button>
            </div>
          )}
        </Card>

        {/* Today's entries */}
        <Card className="p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-200">
              Today's entries
            </div>
            <div className="text-xs text-ink-300">
              {todayData?.entries.length ?? 0} entries
            </div>
          </div>
          <ul className="divide-y divide-ink-500">
            {(todayData?.entries ?? []).map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                projectName={entry.projectId ? projectNameById.get(entry.projectId) : undefined}
                assignedProjects={assigned}
                onChange={() => {
                  queryClient.invalidateQueries({ queryKey: ['time-entries'] });
                }}
              />
            ))}
            {(todayData?.entries ?? []).length === 0 && (
              <li className="py-6 text-center text-sm text-ink-300">
                No entries yet today.
              </li>
            )}
          </ul>
        </Card>
      </div>

      {/* Upcoming */}
      <div className="mt-6">
        <Card className="p-5">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-200">
            Upcoming projects
          </div>
          <ul className="divide-y divide-ink-500">
            {(upcomingData?.projects ?? []).map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2">
                  <Link to={`/projects/${p.id}`} className="text-sm font-medium hover:underline">
                    {p.name}
                  </Link>
                  {p.isOverdue && <Badge tone="red">Overdue</Badge>}
                  {p.isOverEstimate && <Badge tone="yellow">Over estimate</Badge>}
                </div>
                <div className="text-xs text-ink-200">
                  Due {new Date(p.dueAt).toLocaleDateString()}
                </div>
              </li>
            ))}
            {(upcomingData?.projects ?? []).length === 0 && (
              <li className="py-4 text-center text-sm text-ink-300">
                No upcoming projects.
              </li>
            )}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function EntryRow({
  entry,
  projectName,
  assignedProjects,
  onChange,
}: {
  entry: TimeEntryDto;
  projectName: string | undefined;
  assignedProjects: { id: string; name: string }[];
  onChange: () => void;
}) {
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(entry.description ?? '');
  const [attaching, setAttaching] = useState(false);

  const saveNote = async () => {
    await updateTimeEntry(entry.id, { description: noteDraft || null });
    setEditingNote(false);
    onChange();
  };

  const attach = async (projectId: string) => {
    await updateTimeEntry(entry.id, { projectId: projectId || null });
    setAttaching(false);
    onChange();
  };

  const confirm = useConfirm();
  const onDelete = async () => {
    const ok = await confirm({
      title: 'Delete time entry',
      message: 'This entry will be removed from all reports and your timesheet.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    await deleteTimeEntry(entry.id);
    onChange();
  };

  const minutes = durationMinutes(entry.startedAt, entry.endedAt);

  return (
    <li className="py-2">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {entry.projectId ? (projectName ?? 'Project') : (
                <span className="text-ink-200">Unassigned</span>
              )}
            </span>
            {!entry.endedAt && <Badge tone="green">Running</Badge>}
            {entry.source === 'EXTENSION' && <Badge tone="indigo">Extension</Badge>}
            {entry.source === 'MANUAL' && <Badge>Manual</Badge>}
          </div>
          <div className="mt-0.5 text-xs text-ink-200">
            {formatTime(entry.startedAt)} – {entry.endedAt ? formatTime(entry.endedAt) : 'now'} ·{' '}
            {formatMinutes(minutes)}
          </div>
          {editingNote ? (
            <div className="mt-1 flex gap-2">
              <input
                className={inputClass}
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                autoFocus
                onBlur={() => void saveNote()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveNote();
                  if (e.key === 'Escape') setEditingNote(false);
                }}
              />
            </div>
          ) : (
            <div
              className="mt-1 cursor-text text-sm text-ink-200"
              onClick={() => setEditingNote(true)}
            >
              {entry.description || (
                <span className="italic text-ink-300">click to add a note</span>
              )}
            </div>
          )}
          {attaching && (
            <div className="mt-2 flex items-center gap-2">
              <Select
                value={entry.projectId ?? ''}
                onChange={(v) => void attach(v)}
                placeholder="Choose a project…"
                triggerWidth={260}
                options={[
                  { value: '', label: 'No project (general time)' },
                  ...assignedProjects.map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
              <Button variant="secondary" onClick={() => setAttaching(false)}>
                Cancel
              </Button>
            </div>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {!attaching && entry.endedAt && (
            <Button variant="secondary" onClick={() => setAttaching(true)}>
              {entry.projectId ? 'Change project' : 'Attach to project'}
            </Button>
          )}
          {entry.endedAt && (
            <button
              type="button"
              onClick={() => void onDelete()}
              className="text-xs text-ink-300 transition-colors hover:text-red-400"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
