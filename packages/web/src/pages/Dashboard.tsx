import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchFolders,
  fetchProjects,
  fetchTimeEntries,
  updateTimeEntry,
  deleteTimeEntry,
  fetchUpcomingProjects,
} from '../api/queries.js';
import { ProjectPicker } from '../components/ProjectPicker.js';
import type { TimeEntryDto } from '@breaklog/shared';
import { formatElapsed, useTimer } from '../hooks/useTimer.js';
import { Badge, Button, Card, Field, Select, inputClass } from '../components/ui.js';
import { useConfirm } from '../components/Confirm.js';
import { formatMinutes, formatTime, durationMinutes } from '../lib/format.js';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.js';

export function DashboardPage() {
  const { active, elapsedSeconds, start, stop } = useTimer();
  const queryClient = useQueryClient();
  const { user: viewer } = useAuth();
  const isAdmin = viewer?.role === 'ADMIN';

  const { data: projectData } = useQuery({
    queryKey: ['projects'],
    queryFn: () => fetchProjects(),
  });
  const { data: folderData } = useQuery({
    queryKey: ['folders'],
    queryFn: () => fetchFolders(),
  });
  const assigned = projectData?.projects ?? [];
  const folders = folderData?.folders ?? [];

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
                folders={folders}
                showUser={isAdmin}
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
  folders,
  showUser,
  onChange,
}: {
  entry: TimeEntryDto;
  projectName: string | undefined;
  assignedProjects: import('@breaklog/shared').ProjectDto[];
  folders: import('@breaklog/shared').FolderDto[];
  showUser: boolean;
  onChange: () => void;
}) {
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(entry.description ?? '');

  const saveNote = async () => {
    await updateTimeEntry(entry.id, { description: noteDraft || null });
    setEditingNote(false);
    onChange();
  };

  const attach = async (projectId: string) => {
    await updateTimeEntry(entry.id, { projectId: projectId || null });
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
    <li className="py-1.5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <ProjectPicker
            value={entry.projectId}
            onChange={(v) => void attach(v ?? '')}
            folders={folders}
            projects={assignedProjects}
            variant="inline"
            ariaLabel="Change project"
          />
          {!entry.endedAt && <Badge tone="green">Running</Badge>}
          <span className="text-ink-300">·</span>
          {editingNote ? (
            <input
              className={`${inputClass} h-7 min-w-0 flex-1 py-0 text-sm`}
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              autoFocus
              onBlur={() => void saveNote()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void saveNote();
                if (e.key === 'Escape') setEditingNote(false);
              }}
            />
          ) : (
            <span
              className="min-w-0 flex-1 cursor-text truncate text-sm text-ink-200"
              onClick={() => setEditingNote(true)}
            >
              {entry.description || (
                <span className="italic text-ink-300">click to add a note</span>
              )}
            </span>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-3 text-xs text-ink-200">
          {showUser && entry.user && (
            <span className="font-medium text-ink-100">{entry.user.name}</span>
          )}
          <span className="tabular-nums">
            {formatTime(entry.startedAt)} – {entry.endedAt ? formatTime(entry.endedAt) : 'now'} ·{' '}
            {formatMinutes(minutes)}
          </span>
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
