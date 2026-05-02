import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TimeEntryDto } from '@breaklog/shared';
import {
  createTimeEntry,
  deleteTimeEntry,
  fetchFolders,
  fetchProjects,
  fetchTimeEntries,
  updateTimeEntry,
} from '../api/queries.js';
import { Badge, Button, Card, Field, Modal, inputClass } from '../components/ui.js';
import { ProjectPicker } from '../components/ProjectPicker.js';
import { TaskPicker } from '../components/TaskPicker.js';
import type { FolderDto, ProjectDto } from '@breaklog/shared';
import { addDays, formatMinutes, startOfIsoWeek, durationMinutes } from '../lib/format.js';
import { ApiError } from '../api/client.js';

const UNASSIGNED = '__unassigned__';

type View = 'day' | 'week' | 'month';

interface Bucket {
  start: Date;
  /** Exclusive. */
  end: Date;
  label: string;
  sublabel?: string;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(date: Date): Date {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addMonths(date: Date, n: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

function defaultAnchor(view: View): Date {
  const now = new Date();
  if (view === 'day') return startOfDay(now);
  if (view === 'month') return startOfMonth(now);
  return startOfIsoWeek(now);
}

function rangeForView(view: View, anchor: Date): { from: Date; to: Date } {
  if (view === 'day') return { from: anchor, to: addDays(anchor, 1) };
  if (view === 'month') return { from: anchor, to: addMonths(anchor, 1) };
  return { from: anchor, to: addDays(anchor, 7) };
}

function computeBuckets(view: View, anchor: Date): Bucket[] {
  if (view === 'day') {
    return [
      {
        start: anchor,
        end: addDays(anchor, 1),
        label: anchor.toLocaleDateString(undefined, { weekday: 'short' }),
        sublabel: String(anchor.getDate()),
      },
    ];
  }
  if (view === 'week') {
    return Array.from({ length: 7 }, (_, i) => {
      const start = addDays(anchor, i);
      return {
        start,
        end: addDays(start, 1),
        label: start.toLocaleDateString(undefined, { weekday: 'short' }),
        sublabel: String(start.getDate()),
      };
    });
  }
  // month: weekly columns covering the month (Mon–Sun blocks intersecting it).
  const monthStart = anchor;
  const monthEnd = addMonths(anchor, 1);
  const buckets: Bucket[] = [];
  let cursor = startOfIsoWeek(monthStart);
  let i = 1;
  while (cursor.getTime() < monthEnd.getTime()) {
    const next = addDays(cursor, 7);
    buckets.push({
      start: cursor,
      end: next,
      label: `W${i++}`,
      sublabel: cursor.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    });
    cursor = next;
  }
  return buckets;
}

export function TimesheetPage() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>('week');
  const [anchor, setAnchor] = useState<Date>(() => defaultAnchor('week'));
  const [adding, setAdding] = useState(false);
  const [attachingId, setAttachingId] = useState<string | null>(null);

  const buckets = useMemo(() => computeBuckets(view, anchor), [view, anchor]);
  const { from: rangeFrom, to: rangeTo } = useMemo(
    () => rangeForView(view, anchor),
    [view, anchor],
  );
  const from = rangeFrom.toISOString();
  const to = rangeTo.toISOString();

  const { data: entryData, refetch } = useQuery({
    queryKey: ['time-entries', { from, to }],
    queryFn: () => fetchTimeEntries({ from, to }),
  });
  const { data: projectData } = useQuery({
    queryKey: ['projects'],
    queryFn: () => fetchProjects(),
  });
  const { data: folderData } = useQuery({
    queryKey: ['folders'],
    queryFn: () => fetchFolders(),
  });
  const projectById = useMemo(() => {
    const m = new Map<string, { id: string; name: string }>();
    for (const p of projectData?.projects ?? []) m.set(p.id, p);
    return m;
  }, [projectData]);

  // Group entries by projectId (or UNASSIGNED) into one slot per bucket.
  const grid = useMemo(() => {
    const groups = new Map<string, TimeEntryDto[][]>();
    const empty = () => Array.from({ length: buckets.length }, () => [] as TimeEntryDto[]);
    for (const e of entryData?.entries ?? []) {
      const t = new Date(e.startedAt).getTime();
      const idx = buckets.findIndex(
        (b) => t >= b.start.getTime() && t < b.end.getTime(),
      );
      if (idx < 0) continue;
      const key = e.projectId ?? UNASSIGNED;
      if (!groups.has(key)) groups.set(key, empty());
      groups.get(key)![idx]!.push(e);
    }
    return groups;
  }, [entryData, buckets]);

  const hasUnassigned = (grid.get(UNASSIGNED)?.some((arr) => arr.length > 0)) ?? false;
  const projectKeys = Array.from(grid.keys()).filter((k) => k !== UNASSIGNED);

  const totalForBucket = (idx: number) => {
    let total = 0;
    for (const rows of grid.values()) {
      for (const e of rows[idx] ?? []) total += durationMinutes(e.startedAt, e.endedAt);
    }
    return total;
  };

  const goPrev = () => {
    if (view === 'day') setAnchor((a) => addDays(a, -1));
    else if (view === 'month') setAnchor((a) => addMonths(a, -1));
    else setAnchor((a) => addDays(a, -7));
  };
  const goNext = () => {
    if (view === 'day') setAnchor((a) => addDays(a, 1));
    else if (view === 'month') setAnchor((a) => addMonths(a, 1));
    else setAnchor((a) => addDays(a, 7));
  };
  const goToday = () => setAnchor(defaultAnchor(view));

  const switchView = (next: View) => {
    setView(next);
    setAnchor(defaultAnchor(next));
  };

  const rangeLabel = (() => {
    if (view === 'day') {
      return anchor.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      });
    }
    if (view === 'month') {
      return anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    }
    const end = addDays(anchor, 6);
    const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `${fmt(anchor)} – ${fmt(end)}`;
  })();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['time-entries'] });
    void refetch();
  };

  const todayLabel = view === 'day' ? 'Today' : view === 'month' ? 'This month' : 'This week';
  const emptyLabel =
    view === 'day' ? 'No entries this day.' : view === 'month' ? 'No entries this month.' : 'No entries this week.';
  const totalsRowLabel = view === 'month' ? 'Weekly total' : 'Daily total';

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Timesheet</h1>
        <div className="flex items-center gap-2">
          <ViewToggle view={view} onChange={switchView} />
          <Button variant="secondary" onClick={goPrev}>
            ← Prev
          </Button>
          <Button variant="secondary" onClick={goToday}>
            {todayLabel}
          </Button>
          <Button variant="secondary" onClick={goNext}>
            Next →
          </Button>
          <Button onClick={() => setAdding(true)}>+ Add time</Button>
        </div>
      </div>

      <div className="mb-2 text-sm text-ink-200">
        <span className="font-medium text-ink-100">{rangeLabel}</span>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full table-fixed border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink-400 bg-ink-900 text-xs uppercase tracking-wide text-ink-200">
              <th className="w-64 px-4 py-2 text-left font-semibold">Project</th>
              {buckets.map((b, i) => (
                <th key={i} className="px-2 py-2 text-center font-semibold">
                  <div>{b.label}</div>
                  {b.sublabel && <div className="font-normal text-ink-300">{b.sublabel}</div>}
                </th>
              ))}
              <th className="w-20 px-2 py-2 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {hasUnassigned && (
              <UnassignedRow
                entries={grid.get(UNASSIGNED) ?? []}
                onAttach={setAttachingId}
                invalidate={invalidate}
                interactive={view !== 'month'}
              />
            )}
            {projectKeys.map((pid) => (
              <ProjectRow
                key={pid}
                name={projectById.get(pid)?.name ?? '(deleted)'}
                entries={grid.get(pid) ?? []}
                onMove={setAttachingId}
                invalidate={invalidate}
                interactive={view !== 'month'}
              />
            ))}
            {projectKeys.length === 0 && !hasUnassigned && (
              <tr>
                <td
                  colSpan={buckets.length + 2}
                  className="px-4 py-8 text-center text-sm text-ink-300"
                >
                  {emptyLabel}
                </td>
              </tr>
            )}
            <tr className="border-t border-ink-400 bg-ink-900 text-xs uppercase tracking-wide text-ink-200">
              <td className="px-4 py-2 font-semibold">{totalsRowLabel}</td>
              {buckets.map((_, i) => (
                <td key={i} className="px-2 py-2 text-center font-mono tabular-nums">
                  {formatMinutes(totalForBucket(i))}
                </td>
              ))}
              <td className="px-2 py-2 text-right font-mono tabular-nums">
                {formatMinutes(
                  buckets.map((_, i) => totalForBucket(i)).reduce((a, b) => a + b, 0),
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </Card>

      {adding && (
        <AddTimeModal
          projects={projectData?.projects ?? []}
          folders={folderData?.folders ?? []}
          onClose={() => setAdding(false)}
          onCreated={() => {
            setAdding(false);
            invalidate();
          }}
        />
      )}
      {attachingId && (
        <AttachModal
          entry={entryData?.entries.find((e) => e.id === attachingId) ?? null}
          entryId={attachingId}
          projects={projectData?.projects ?? []}
          folders={folderData?.folders ?? []}
          onClose={() => setAttachingId(null)}
          onAttached={() => {
            setAttachingId(null);
            invalidate();
          }}
        />
      )}
    </div>
  );
}

function UnassignedRow({
  entries,
  onAttach,
  invalidate,
  interactive,
}: {
  entries: TimeEntryDto[][];
  onAttach: (id: string) => void;
  invalidate: () => void;
  interactive: boolean;
}) {
  const totalRow = entries
    .flat()
    .reduce((s, e) => s + durationMinutes(e.startedAt, e.endedAt), 0);
  return (
    <tr className="border-b border-ink-400 bg-amber-500/5">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Badge tone="yellow">Unassigned</Badge>
          {interactive && (
            <span className="text-xs text-ink-300">expand a cell to attach</span>
          )}
        </div>
      </td>
      {entries.map((bucketEntries, i) =>
        interactive ? (
          <DayCell
            key={i}
            entries={bucketEntries}
            onAttach={onAttach}
            attachLabel="attach"
            invalidate={invalidate}
          />
        ) : (
          <TotalCell key={i} entries={bucketEntries} />
        ),
      )}
      <td className="px-2 text-right font-mono tabular-nums">{formatMinutes(totalRow)}</td>
    </tr>
  );
}

function ProjectRow({
  name,
  entries,
  onMove,
  invalidate,
  interactive,
}: {
  name: string;
  entries: TimeEntryDto[][];
  onMove: (id: string) => void;
  invalidate: () => void;
  interactive: boolean;
}) {
  const totalRow = entries
    .flat()
    .reduce((s, e) => s + durationMinutes(e.startedAt, e.endedAt), 0);
  return (
    <tr className="border-b border-ink-500">
      <td className="px-4 py-3 font-medium">{name}</td>
      {entries.map((bucketEntries, i) =>
        interactive ? (
          <DayCell
            key={i}
            entries={bucketEntries}
            onAttach={onMove}
            attachLabel="move"
            invalidate={invalidate}
          />
        ) : (
          <TotalCell key={i} entries={bucketEntries} />
        ),
      )}
      <td className="px-2 text-right font-mono tabular-nums">{formatMinutes(totalRow)}</td>
    </tr>
  );
}

function TotalCell({ entries }: { entries: TimeEntryDto[] }) {
  const total = entries.reduce(
    (s, e) => s + durationMinutes(e.startedAt, e.endedAt),
    0,
  );
  return (
    <td
      className={`px-2 py-3 text-center font-mono text-sm tabular-nums ${
        total > 0 ? 'text-ink-100' : 'text-ink-300'
      }`}
    >
      {total > 0 ? formatMinutes(total) : '—'}
    </td>
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: View;
  onChange: (next: View) => void;
}) {
  const opts: { value: View; label: string }[] = [
    { value: 'day', label: 'Day' },
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' },
  ];
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-ink-400 bg-ink-800 text-sm">
      {opts.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 transition-colors ${
            view === o.value
              ? 'bg-ink-700 text-ink-100'
              : 'text-ink-200 hover:bg-ink-700 hover:text-ink-100'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function DayCell({
  entries,
  onAttach,
  attachLabel = 'attach',
  invalidate,
}: {
  entries: TimeEntryDto[];
  onAttach?: (id: string) => void;
  attachLabel?: string;
  invalidate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const total = entries.reduce((s, e) => s + durationMinutes(e.startedAt, e.endedAt), 0);
  return (
    <td className="px-2 align-top">
      <button
        type="button"
        className={`w-full rounded px-2 py-2 text-center font-mono text-sm tabular-nums ${
          total > 0 ? 'bg-ink-900 hover:bg-ink-700' : 'text-ink-300'
        }`}
        onClick={() => total > 0 && setOpen((v) => !v)}
      >
        {total > 0 ? formatMinutes(total) : '—'}
      </button>
      {open && (
        <ul className="mt-1 space-y-1 text-left">
          {entries.map((e) => (
            <li key={e.id} className="rounded bg-ink-800/60 p-1 text-xs shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono">
                  {formatMinutes(durationMinutes(e.startedAt, e.endedAt))}
                </span>
                <div className="flex items-center gap-1">
                  {onAttach && (
                    <button
                      className="text-brand-300 hover:text-brand-200"
                      onClick={() => onAttach(e.id)}
                    >
                      {attachLabel}
                    </button>
                  )}
                  <button
                    className="text-ink-300 hover:text-red-600"
                    onClick={async () => {
                      try {
                        await deleteTimeEntry(e.id);
                        invalidate();
                      } catch (err) {
                        alert(err instanceof ApiError ? err.message : String(err));
                      }
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
              {e.description && (
                <div className="mt-0.5 truncate text-[10px] text-ink-200">
                  {e.description}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </td>
  );
}

function AddTimeModal({
  projects,
  folders,
  onClose,
  onCreated,
}: {
  projects: ProjectDto[];
  folders: FolderDto[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [date, setDate] = useState(today);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [description, setDescription] = useState('');
  const [isBillable, setIsBillable] = useState(true);

  const mutation = useMutation({
    mutationFn: () =>
      createTimeEntry({
        projectId: projectId || null,
        taskId: projectId ? taskId : null,
        startedAt: new Date(`${date}T${startTime}`).toISOString(),
        endedAt: new Date(`${date}T${endTime}`).toISOString(),
        description: description || undefined,
        isBillable,
      }),
    onSuccess: onCreated,
  });

  return (
    <Modal open onClose={onClose} title="Add time">
      <div className="space-y-3">
        <Field label="Project">
          <ProjectPicker
            value={projectId || null}
            onChange={(v) => {
              setProjectId(v ?? '');
              setTaskId(null);
            }}
            folders={folders}
            projects={projects}
          />
        </Field>
        {projectId && (
          <Field label="Task">
            <TaskPicker
              projectId={projectId}
              value={taskId}
              onChange={setTaskId}
            />
          </Field>
        )}
        <div className="grid grid-cols-3 gap-3">
          <Field label="Date">
            <input
              className={inputClass}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="Start">
            <input
              className={inputClass}
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </Field>
          <Field label="End">
            <input
              className={inputClass}
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Note">
          <input
            className={inputClass}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isBillable}
            onChange={(e) => setIsBillable(e.target.checked)}
          />
          Billable
        </label>
        {mutation.isError && (
          <div className="text-sm text-red-600">{(mutation.error as Error).message}</div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function AttachModal({
  entry,
  entryId,
  projects,
  folders,
  onClose,
  onAttached,
}: {
  entry: TimeEntryDto | null;
  entryId: string;
  projects: ProjectDto[];
  folders: FolderDto[];
  onClose: () => void;
  onAttached: () => void;
}) {
  const isReassign = !!entry?.projectId;
  // Start with the current project (or empty for unassigned entries) so the
  // dropdown reflects the current state rather than asking you to re-pick.
  const [projectId, setProjectId] = useState<string>(entry?.projectId ?? '');
  const [taskId, setTaskId] = useState<string | null>(entry?.taskId ?? null);
  const mutation = useMutation({
    mutationFn: () =>
      updateTimeEntry(entryId, {
        projectId: projectId ? projectId : null,
        taskId: projectId ? taskId : null,
      }),
    onSuccess: onAttached,
  });
  const unchanged =
    (entry?.projectId ?? '') === projectId &&
    (entry?.taskId ?? null) === (projectId ? taskId : null);
  return (
    <Modal
      open
      onClose={onClose}
      title={isReassign ? 'Change project' : 'Attach to project'}
    >
      <div className="space-y-3">
        <Field label="Project">
          <ProjectPicker
            value={projectId || null}
            onChange={(v) => {
              setProjectId(v ?? '');
              setTaskId(null);
            }}
            folders={folders}
            projects={projects}
          />
        </Field>
        {projectId && (
          <Field label="Task">
            <TaskPicker
              projectId={projectId}
              value={taskId}
              onChange={setTaskId}
            />
          </Field>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || unchanged}
          >
            {isReassign ? 'Save' : 'Attach'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
