import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  FolderDto,
  ProjectDto,
  TimeEntryDto,
  UserDto,
} from '@outbreak/shared';
import {
  createTimeEntry,
  deleteTimeEntry,
  fetchFolders,
  fetchProjects,
  fetchTimeEntries,
  fetchUsers,
  updateTimeEntry,
} from '../api/queries.js';
import { Button, Card, Field, Modal, Select, inputClass } from '../components/ui.js';
import { ProjectPicker } from '../components/ProjectPicker.js';
import { useConfirm } from '../components/Confirm.js';
import { addDays, formatMinutes, startOfIsoWeek } from '../lib/format.js';
import { useAuth } from '../auth/AuthContext.js';

const HOUR_HEIGHT = 44; // px per hour row
const DAY_START_HOUR = 0;
const DAY_END_HOUR = 24;
const VISIBLE_HOURS = DAY_END_HOUR - DAY_START_HOUR;
const SNAP_MINUTES = 15;

const DAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;

const PROJECT_COLORS = [
  ['bg-brand-500/25', 'border-brand-500/60', 'text-brand-100'],
  ['bg-emerald-500/20', 'border-emerald-500/50', 'text-emerald-100'],
  ['bg-amber-500/20', 'border-amber-500/50', 'text-amber-100'],
  ['bg-fuchsia-500/20', 'border-fuchsia-500/50', 'text-fuchsia-100'],
  ['bg-cyan-500/20', 'border-cyan-500/50', 'text-cyan-100'],
  ['bg-rose-500/20', 'border-rose-500/50', 'text-rose-100'],
] as const;

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function colorFor(projectId: string | null): readonly [string, string, string] {
  if (!projectId) return ['bg-ink-500/60', 'border-ink-300', 'text-ink-100'];
  return PROJECT_COLORS[hash(projectId) % PROJECT_COLORS.length]!;
}

function fmtTotalHMS(mins: number): string {
  const total = Math.max(0, Math.round(mins * 60));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function toLocalTimeStr(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function combineLocal(dateStr: string, timeStr: string): Date {
  return new Date(`${dateStr}T${timeStr}`);
}

interface PositionedEntry {
  entry: TimeEntryDto;
  top: number;
  height: number;
  startHour: number;
  endHour: number;
}

type EditorState =
  | { mode: 'create'; defaults: { date: string; startTime: string; endTime: string } }
  | { mode: 'edit'; entry: TimeEntryDto };

export function CalendarPage() {
  const { user: viewer } = useAuth();
  const isAdmin = viewer?.role === 'ADMIN';
  const queryClient = useQueryClient();

  const [anchor, setAnchor] = useState(() => startOfIsoWeek(new Date()));
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [dragPreview, setDragPreview] = useState<{
    entryId: string;
    dayIndex: number;
    startMinutes: number;
    durationMinutes: number;
  } | null>(null);
  const dragStateRef = useRef<{
    entryId: string;
    offsetMinutes: number;
    durationMinutes: number;
  } | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);

  const from = anchor.toISOString();
  const to = addDays(anchor, 7).toISOString();

  // Admin-only filter: allow viewing a specific user. Backend enforces access:
  // non-admins are silently limited to their own entries regardless.
  const entriesQueryKey = ['time-entries', { from, to, userId: selectedUserId || null }];
  const { data: entryData } = useQuery({
    queryKey: entriesQueryKey,
    queryFn: () =>
      fetchTimeEntries({
        from,
        to,
        ...(selectedUserId ? { userId: selectedUserId } : {}),
      }),
  });
  const { data: projectData } = useQuery({
    queryKey: ['projects'],
    queryFn: () => fetchProjects(),
  });
  const { data: folderData } = useQuery({
    queryKey: ['folders'],
    queryFn: () => fetchFolders(),
  });
  const { data: userData } = useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
    enabled: isAdmin,
  });

  const projects = projectData?.projects ?? [];
  const folders = folderData?.folders ?? [];
  const users = userData?.users ?? [];

  const projectName = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of projects) m.set(p.id, p.name);
    return m;
  }, [projects]);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(anchor, i)),
    [anchor],
  );

  const byDay = useMemo<PositionedEntry[][]>(() => {
    const buckets: PositionedEntry[][] = days.map(() => []);
    for (const e of entryData?.entries ?? []) {
      if (!e.endedAt) continue;
      const start = new Date(e.startedAt);
      const end = new Date(e.endedAt);
      for (let i = 0; i < 7; i++) {
        const dayStart = new Date(days[i]!);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = addDays(dayStart, 1);
        if (end <= dayStart || start >= dayEnd) continue;
        const clippedStart = start < dayStart ? dayStart : start;
        const clippedEnd = end > dayEnd ? dayEnd : end;
        const startHour =
          clippedStart.getHours() + clippedStart.getMinutes() / 60;
        const endHour =
          clippedEnd.getTime() === dayEnd.getTime()
            ? 24
            : clippedEnd.getHours() + clippedEnd.getMinutes() / 60;
        const top = Math.max(0, startHour - DAY_START_HOUR) * HOUR_HEIGHT;
        const height = Math.max(
          18,
          (Math.min(endHour, DAY_END_HOUR) -
            Math.max(startHour, DAY_START_HOUR)) *
            HOUR_HEIGHT,
        );
        buckets[i]!.push({ entry: e, top, height, startHour, endHour });
      }
    }
    return buckets;
  }, [entryData, days]);

  const dayTotals = useMemo(
    () =>
      byDay.map((dayEntries) =>
        dayEntries.reduce(
          (sum, p) => sum + (p.endHour - p.startHour) * 60,
          0,
        ),
      ),
    [byDay],
  );
  const weekTotal = dayTotals.reduce((a, b) => a + b, 0);

  const weekEnd = addDays(anchor, 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const isoWeek = (() => {
    const d = new Date(anchor);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  })();

  const today = new Date();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['time-entries'] });
  };

  const openAddModal = () => {
    const now = new Date();
    const roundedStart = new Date(now);
    roundedStart.setMinutes(Math.floor(now.getMinutes() / SNAP_MINUTES) * SNAP_MINUTES, 0, 0);
    const roundedEnd = new Date(roundedStart.getTime() + 60 * 60_000);
    setEditor({
      mode: 'create',
      defaults: {
        date: toLocalDateStr(roundedStart),
        startTime: toLocalTimeStr(roundedStart),
        endTime: toLocalTimeStr(roundedEnd),
      },
    });
  };

  // Entries inside the scrollable grid are draggable; on drop we snap the
  // top of the block to the nearest 15-min slot and keep the duration fixed.
  const onEntryDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    entry: TimeEntryDto,
    blockTop: number,
  ) => {
    if (entry.locked) {
      e.preventDefault();
      return;
    }
    // Non-admins can only drag their own entries; the server will reject
    // otherwise, but we also guard client-side so the UI doesn't misbehave.
    if (!isAdmin && entry.userId !== viewer?.id) {
      e.preventDefault();
      return;
    }
    const durationMinutes = Math.max(
      SNAP_MINUTES,
      Math.round(
        (new Date(entry.endedAt!).getTime() - new Date(entry.startedAt).getTime()) /
          60_000,
      ),
    );
    const offsetPx = e.clientY - (e.currentTarget.getBoundingClientRect().top);
    const offsetMinutes = (offsetPx / HOUR_HEIGHT) * 60;
    dragStateRef.current = { entryId: entry.id, offsetMinutes, durationMinutes };
    // Hint: we want the dragged element to remain visible via its ghost image.
    e.dataTransfer.effectAllowed = 'move';
    // Needed on Firefox for the drag to initiate.
    e.dataTransfer.setData('text/plain', entry.id);
    // Remember the original block top so the drop handler can compute deltas
    // relative to the day column the entry was dragged from.
    void blockTop;
  };

  const computeDropLocation = (clientX: number, clientY: number) => {
    const grid = gridRef.current;
    if (!grid) return null;
    const rect = grid.getBoundingClientRect();
    const HOUR_COL = 64;
    const relX = clientX - rect.left - HOUR_COL;
    const relY = clientY - rect.top;
    const dayWidth = (rect.width - HOUR_COL) / 7;
    const dayIndex = Math.floor(relX / dayWidth);
    if (dayIndex < 0 || dayIndex > 6) return null;
    return { dayIndex, relY };
  };

  const onGridDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!dragStateRef.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const loc = computeDropLocation(e.clientX, e.clientY);
    if (!loc) return;
    const { dayIndex, relY } = loc;
    const minutesInDay =
      DAY_START_HOUR * 60 +
      (relY / HOUR_HEIGHT) * 60 -
      dragStateRef.current.offsetMinutes;
    const snapped =
      Math.round(minutesInDay / SNAP_MINUTES) * SNAP_MINUTES;
    const clamped = Math.max(
      0,
      Math.min(24 * 60 - dragStateRef.current.durationMinutes, snapped),
    );
    setDragPreview({
      entryId: dragStateRef.current.entryId,
      dayIndex,
      startMinutes: clamped,
      durationMinutes: dragStateRef.current.durationMinutes,
    });
  };

  const onGridDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    // Only clear preview if we truly left the grid, not a child.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragPreview(null);
  };

  const onGridDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const drag = dragStateRef.current;
    const preview = dragPreview;
    dragStateRef.current = null;
    setDragPreview(null);
    if (!drag || !preview) return;
    const newStart = new Date(days[preview.dayIndex]!);
    newStart.setHours(0, 0, 0, 0);
    newStart.setMinutes(preview.startMinutes);
    const newEnd = new Date(newStart.getTime() + preview.durationMinutes * 60_000);
    try {
      await updateTimeEntry(drag.entryId, {
        startedAt: newStart.toISOString(),
        endedAt: newEnd.toISOString(),
      });
      invalidate();
    } catch (err) {
      alert(`Couldn't move entry: ${(err as Error).message}`);
    }
  };

  const onEntryDragEnd = () => {
    dragStateRef.current = null;
    setDragPreview(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">What are you working on?</h1>
        <div className="flex items-center gap-2">
          {isAdmin && users.length > 0 && (
            <Select
              value={selectedUserId}
              onChange={setSelectedUserId}
              placeholder="All instructors"
              ariaLabel="Filter by instructor"
              triggerWidth={200}
              options={[
                { value: '', label: 'All instructors' },
                ...users.map((u: UserDto) => ({ value: u.id, label: u.name })),
              ]}
            />
          )}
          <Button onClick={openAddModal}>+ Add time</Button>
        </div>
      </div>

      <Card className="p-0">
        <div className="flex items-center justify-between border-b border-ink-400 px-4 py-3">
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => setAnchor(addDays(anchor, -7))}
              aria-label="Previous week"
            >
              ‹
            </Button>
            <div className="rounded-sm border border-ink-400 bg-ink-900/60 px-3 py-1.5 text-sm">
              {fmt(anchor)} – {fmt(weekEnd)}{' '}
              <span className="ml-2 text-ink-200">· W{isoWeek}</span>
            </div>
            <Button
              variant="secondary"
              onClick={() => setAnchor(addDays(anchor, 7))}
              aria-label="Next week"
            >
              ›
            </Button>
            <Button
              variant="secondary"
              onClick={() => setAnchor(startOfIsoWeek(new Date()))}
            >
              This week
            </Button>
          </div>
          <div className="text-sm text-ink-200">
            Week total{' '}
            <span className="ml-2 font-mono text-base text-ink-100">
              {fmtTotalHMS(weekTotal)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-[64px_repeat(7,1fr)] border-b border-ink-400 text-sm">
          <div />
          {days.map((d, i) => {
            const isToday =
              d.toDateString() === today.toDateString();
            return (
              <div
                key={i}
                className={`flex items-baseline gap-2 px-3 py-2 ${
                  isToday ? 'bg-brand-500/5' : ''
                }`}
              >
                <span
                  className={`text-2xl font-semibold ${
                    isToday ? 'text-brand-300' : 'text-ink-100'
                  }`}
                >
                  {d.getDate()}
                </span>
                <div className="leading-tight">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-ink-200">
                    {DAY_LABELS[i]}
                  </div>
                  <div className="font-mono text-xs text-ink-200">
                    {fmtTotalHMS(dayTotals[i] ?? 0)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div
          className="relative overflow-y-auto"
          style={{ maxHeight: '72vh' }}
        >
          <div
            ref={gridRef}
            className="relative grid grid-cols-[64px_repeat(7,1fr)]"
            style={{ height: VISIBLE_HOURS * HOUR_HEIGHT }}
            onDragOver={onGridDragOver}
            onDrop={onGridDrop}
            onDragLeave={onGridDragLeave}
          >
            <div className="relative">
              {Array.from({ length: VISIBLE_HOURS + 1 }, (_, i) => {
                const h = DAY_START_HOUR + i;
                if (i === VISIBLE_HOURS) return null;
                const label =
                  h === 0
                    ? '12 AM'
                    : h === 12
                      ? '12 PM'
                      : h < 12
                        ? `${h} AM`
                        : `${h - 12} PM`;
                return (
                  <div
                    key={i}
                    className="absolute left-0 right-0 pr-2 text-right font-mono text-[10px] text-ink-200"
                    style={{ top: i * HOUR_HEIGHT - 6 }}
                  >
                    {label}
                  </div>
                );
              })}
            </div>

            {days.map((d, i) => {
              const isToday = d.toDateString() === today.toDateString();
              return (
                <div
                  key={i}
                  className={`relative border-l border-ink-500 ${
                    isToday ? 'bg-brand-500/[0.03]' : ''
                  }`}
                  onDoubleClick={(e) => {
                    // Quick-create: double-click an empty slot to open the
                    // add-time modal pre-filled with the clicked time.
                    const rect = e.currentTarget.getBoundingClientRect();
                    const relY = e.clientY - rect.top;
                    const minutesInDay =
                      DAY_START_HOUR * 60 + (relY / HOUR_HEIGHT) * 60;
                    const snapped =
                      Math.round(minutesInDay / SNAP_MINUTES) * SNAP_MINUTES;
                    const start = new Date(d);
                    start.setHours(0, 0, 0, 0);
                    start.setMinutes(snapped);
                    const end = new Date(start.getTime() + 60 * 60_000);
                    setEditor({
                      mode: 'create',
                      defaults: {
                        date: toLocalDateStr(start),
                        startTime: toLocalTimeStr(start),
                        endTime: toLocalTimeStr(end),
                      },
                    });
                  }}
                >
                  {Array.from({ length: VISIBLE_HOURS }, (_, j) => (
                    <div
                      key={j}
                      className="absolute left-0 right-0 border-t border-ink-500/60"
                      style={{ top: j * HOUR_HEIGHT }}
                    />
                  ))}
                  {byDay[i]!.map((p, idx) => {
                    const [bg, border, text] = colorFor(p.entry.projectId);
                    const name = p.entry.projectId
                      ? (projectName.get(p.entry.projectId) ?? 'Project')
                      : 'Unassigned';
                    const startStr = new Date(
                      p.entry.startedAt,
                    ).toLocaleTimeString(undefined, {
                      hour: 'numeric',
                      minute: '2-digit',
                    });
                    const canMove =
                      !p.entry.locked &&
                      (isAdmin || p.entry.userId === viewer?.id);
                    const isBeingDragged =
                      dragPreview?.entryId === p.entry.id;
                    return (
                      <div
                        key={idx}
                        draggable={canMove}
                        onDragStart={(e) =>
                          onEntryDragStart(e, p.entry, p.top)
                        }
                        onDragEnd={onEntryDragEnd}
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditor({ mode: 'edit', entry: p.entry });
                        }}
                        onDoubleClick={(e) => e.stopPropagation()}
                        className={`absolute left-1 right-1 overflow-hidden rounded-sm border px-2 py-1 text-xs ${bg} ${border} ${text} ${
                          canMove ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                        } ${isBeingDragged ? 'opacity-40' : 'hover:brightness-110'}`}
                        style={{ top: p.top, height: p.height }}
                        title={`${name} · ${startStr} · ${formatMinutes(Math.round((p.endHour - p.startHour) * 60))}${p.entry.description ? ` · ${p.entry.description}` : ''}`}
                      >
                        <div className="truncate font-medium">{name}</div>
                        {isAdmin && p.entry.user && (
                          <div className="truncate text-[10px] font-medium opacity-90">
                            {p.entry.user.name}
                          </div>
                        )}
                        {p.entry.description && p.height > 34 && (
                          <div className="truncate text-[10px] opacity-75">
                            {p.entry.description}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {dragPreview && dragPreview.dayIndex === i && (
                    <div
                      className="pointer-events-none absolute left-1 right-1 rounded-sm border-2 border-dashed border-brand-400/80 bg-brand-500/10"
                      style={{
                        top:
                          (dragPreview.startMinutes / 60 - DAY_START_HOUR) *
                          HOUR_HEIGHT,
                        height:
                          (dragPreview.durationMinutes / 60) * HOUR_HEIGHT,
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {editor && (
        <TimeEntryEditor
          state={editor}
          projects={projects}
          folders={folders}
          isAdmin={isAdmin}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            invalidate();
          }}
        />
      )}
    </div>
  );
}

function TimeEntryEditor({
  state,
  projects,
  folders,
  isAdmin,
  onClose,
  onSaved,
}: {
  state: EditorState;
  projects: ProjectDto[];
  folders: FolderDto[];
  isAdmin: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const confirm = useConfirm();
  const isEdit = state.mode === 'edit';

  const initial = useMemo(() => {
    if (state.mode === 'edit') {
      const start = new Date(state.entry.startedAt);
      const end = state.entry.endedAt ? new Date(state.entry.endedAt) : new Date(start.getTime() + 60 * 60_000);
      return {
        projectId: state.entry.projectId ?? '',
        date: toLocalDateStr(start),
        startTime: toLocalTimeStr(start),
        endTime: toLocalTimeStr(end),
        description: state.entry.description ?? '',
        isBillable: state.entry.isBillable,
      };
    }
    return {
      projectId: '',
      date: state.defaults.date,
      startTime: state.defaults.startTime,
      endTime: state.defaults.endTime,
      description: '',
      isBillable: true,
    };
  }, [state]);

  const [projectId, setProjectId] = useState(initial.projectId);
  const [date, setDate] = useState(initial.date);
  const [startTime, setStartTime] = useState(initial.startTime);
  const [endTime, setEndTime] = useState(initial.endTime);
  const [description, setDescription] = useState(initial.description);
  const [isBillable, setIsBillable] = useState(initial.isBillable);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const startedAt = combineLocal(date, startTime).toISOString();
      // If the end time is earlier than start, assume user meant next day.
      let endDate = combineLocal(date, endTime);
      if (endDate.getTime() <= combineLocal(date, startTime).getTime()) {
        endDate = new Date(endDate.getTime() + 24 * 60 * 60_000);
      }
      const endedAt = endDate.toISOString();
      if (state.mode === 'create') {
        await createTimeEntry({
          projectId: projectId || null,
          startedAt,
          endedAt,
          description: description || undefined,
          isBillable,
        });
      } else {
        await updateTimeEntry(state.entry.id, {
          projectId: projectId || null,
          startedAt,
          endedAt,
          description: description || null,
          isBillable,
        });
      }
    },
    onSuccess: onSaved,
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (state.mode !== 'edit') return;
      await deleteTimeEntry(state.entry.id);
    },
    onSuccess: onSaved,
  });

  const onDelete = async () => {
    const ok = await confirm({
      title: 'Delete time entry',
      message: 'This entry will be removed from all reports and timesheets.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    deleteMutation.mutate();
  };

  const authorName =
    isAdmin && state.mode === 'edit' && state.entry.user
      ? state.entry.user.name
      : null;

  return (
    <Modal open onClose={onClose} title={isEdit ? 'Edit time entry' : 'Add time'}>
      <div className="space-y-3">
        {authorName && (
          <div className="rounded-md border border-ink-400 bg-ink-900/60 px-3 py-2 text-xs text-ink-200">
            Logged by <span className="font-medium text-ink-100">{authorName}</span>
          </div>
        )}
        <Field label="Project">
          <ProjectPicker
            value={projectId || null}
            onChange={(v) => setProjectId(v ?? '')}
            folders={folders}
            projects={projects}
          />
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
        {saveMutation.isError && (
          <div className="text-sm text-red-400">
            {(saveMutation.error as Error).message}
          </div>
        )}
        <div className="flex items-center justify-between pt-2">
          <div>
            {isEdit && (
              <Button
                variant="danger"
                onClick={() => void onDelete()}
                disabled={deleteMutation.isPending}
              >
                Delete
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              Save
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
