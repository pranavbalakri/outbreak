import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TimeEntryDto } from '@outbreak/shared';
import {
  createTimeEntry,
  deleteTimeEntry,
  fetchProjects,
  fetchTimeEntries,
  updateTimeEntry,
} from '../api/queries.js';
import { Badge, Button, Card, Field, Modal, inputClass } from '../components/ui.js';
import { addDays, formatMinutes, startOfIsoWeek, durationMinutes } from '../lib/format.js';
import { ApiError } from '../api/client.js';

const UNASSIGNED = '__unassigned__';

export function TimesheetPage() {
  const queryClient = useQueryClient();
  const [anchor, setAnchor] = useState(() => startOfIsoWeek(new Date()));
  const [adding, setAdding] = useState(false);
  const [attachingId, setAttachingId] = useState<string | null>(null);

  const from = anchor.toISOString();
  const to = addDays(anchor, 7).toISOString();

  const { data: entryData, refetch } = useQuery({
    queryKey: ['time-entries', { from, to }],
    queryFn: () => fetchTimeEntries({ from, to }),
  });
  const { data: projectData } = useQuery({
    queryKey: ['projects'],
    queryFn: () => fetchProjects(),
  });
  const projectById = useMemo(() => {
    const m = new Map<string, { id: string; name: string }>();
    for (const p of projectData?.projects ?? []) m.set(p.id, p);
    return m;
  }, [projectData]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(anchor, i)), [anchor]);

  // Group entries by projectId (or UNASSIGNED) and by day index.
  const grid = useMemo(() => {
    const groups = new Map<string, TimeEntryDto[][]>();
    for (const e of entryData?.entries ?? []) {
      const key = e.projectId ?? UNASSIGNED;
      if (!groups.has(key)) groups.set(key, Array.from({ length: 7 }, () => []));
      const day = new Date(e.startedAt);
      const idx = Math.floor((day.getTime() - anchor.getTime()) / 86_400_000);
      if (idx >= 0 && idx < 7) groups.get(key)![idx]!.push(e);
    }
    return groups;
  }, [entryData, anchor]);

  const hasUnassigned = (grid.get(UNASSIGNED)?.some((arr) => arr.length > 0)) ?? false;
  const projectKeys = Array.from(grid.keys()).filter((k) => k !== UNASSIGNED);

  const totalForDay = (idx: number) => {
    let total = 0;
    for (const rows of grid.values()) {
      for (const e of rows[idx] ?? []) total += durationMinutes(e.startedAt, e.endedAt);
    }
    return total;
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['time-entries'] });
    void refetch();
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Timesheet</h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setAnchor((a) => addDays(a, -7))}>
            ← Prev
          </Button>
          <Button variant="secondary" onClick={() => setAnchor(startOfIsoWeek(new Date()))}>
            This week
          </Button>
          <Button variant="secondary" onClick={() => setAnchor((a) => addDays(a, 7))}>
            Next →
          </Button>
          <Button onClick={() => setAdding(true)}>+ Add time</Button>
        </div>
      </div>

      <div className="mb-2 text-sm text-ink-200">
        Week of{' '}
        <span className="font-medium text-ink-100">
          {anchor.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </span>{' '}
        –{' '}
        <span className="font-medium text-ink-100">
          {addDays(anchor, 6).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </span>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full table-fixed border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink-400 bg-ink-900 text-xs uppercase tracking-wide text-ink-200">
              <th className="w-64 px-4 py-2 text-left font-semibold">Project</th>
              {days.map((d, i) => (
                <th key={i} className="px-2 py-2 text-center font-semibold">
                  <div>{d.toLocaleDateString(undefined, { weekday: 'short' })}</div>
                  <div className="font-normal text-ink-300">{d.getDate()}</div>
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
              />
            )}
            {projectKeys.map((pid) => (
              <ProjectRow
                key={pid}
                name={projectById.get(pid)?.name ?? '(deleted)'}
                entries={grid.get(pid) ?? []}
                invalidate={invalidate}
              />
            ))}
            {projectKeys.length === 0 && !hasUnassigned && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-sm text-ink-300">
                  No entries this week.
                </td>
              </tr>
            )}
            <tr className="border-t border-ink-400 bg-ink-900 text-xs uppercase tracking-wide text-ink-200">
              <td className="px-4 py-2 font-semibold">Daily total</td>
              {days.map((_, i) => (
                <td key={i} className="px-2 py-2 text-center font-mono tabular-nums">
                  {formatMinutes(totalForDay(i))}
                </td>
              ))}
              <td className="px-2 py-2 text-right font-mono tabular-nums">
                {formatMinutes(
                  Array.from({ length: 7 }, (_, i) => totalForDay(i)).reduce((a, b) => a + b, 0),
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </Card>

      {adding && (
        <AddTimeModal
          projects={projectData?.projects ?? []}
          onClose={() => setAdding(false)}
          onCreated={() => {
            setAdding(false);
            invalidate();
          }}
        />
      )}
      {attachingId && (
        <AttachModal
          entryId={attachingId}
          projects={projectData?.projects ?? []}
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
}: {
  entries: TimeEntryDto[][];
  onAttach: (id: string) => void;
  invalidate: () => void;
}) {
  const totalRow = entries
    .flat()
    .reduce((s, e) => s + durationMinutes(e.startedAt, e.endedAt), 0);
  return (
    <tr className="border-b border-ink-400 bg-amber-50/40">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Badge tone="yellow">Unassigned</Badge>
          <span className="text-xs text-ink-200">attach to a project →</span>
        </div>
      </td>
      {entries.map((dayEntries, i) => (
        <DayCell key={i} entries={dayEntries} onAttach={onAttach} invalidate={invalidate} />
      ))}
      <td className="px-2 text-right font-mono tabular-nums">{formatMinutes(totalRow)}</td>
    </tr>
  );
}

function ProjectRow({
  name,
  entries,
  invalidate,
}: {
  name: string;
  entries: TimeEntryDto[][];
  invalidate: () => void;
}) {
  const totalRow = entries
    .flat()
    .reduce((s, e) => s + durationMinutes(e.startedAt, e.endedAt), 0);
  return (
    <tr className="border-b border-ink-500">
      <td className="px-4 py-3 font-medium">{name}</td>
      {entries.map((dayEntries, i) => (
        <DayCell key={i} entries={dayEntries} invalidate={invalidate} />
      ))}
      <td className="px-2 text-right font-mono tabular-nums">{formatMinutes(totalRow)}</td>
    </tr>
  );
}

function DayCell({
  entries,
  onAttach,
  invalidate,
}: {
  entries: TimeEntryDto[];
  onAttach?: (id: string) => void;
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
                      className="text-brand-600 hover:text-brand-700"
                      onClick={() => onAttach(e.id)}
                    >
                      attach
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
  onClose,
  onCreated,
}: {
  projects: { id: string; name: string }[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [projectId, setProjectId] = useState('');
  const [date, setDate] = useState(today);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [description, setDescription] = useState('');
  const [isBillable, setIsBillable] = useState(true);

  const mutation = useMutation({
    mutationFn: () =>
      createTimeEntry({
        projectId: projectId || null,
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
          <select
            className={inputClass}
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">— No project (general time) —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
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
  entryId,
  projects,
  onClose,
  onAttached,
}: {
  entryId: string;
  projects: { id: string; name: string }[];
  onClose: () => void;
  onAttached: () => void;
}) {
  const [projectId, setProjectId] = useState('');
  const mutation = useMutation({
    mutationFn: () => updateTimeEntry(entryId, { projectId }),
    onSuccess: onAttached,
  });
  return (
    <Modal open onClose={onClose} title="Attach to project">
      <div className="space-y-3">
        <Field label="Project">
          <select
            className={inputClass}
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="" disabled>
              Choose…
            </option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!projectId || mutation.isPending}>
            Attach
          </Button>
        </div>
      </div>
    </Modal>
  );
}
