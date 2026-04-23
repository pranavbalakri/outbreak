import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { TimeEntryDto } from '@outbreak/shared';
import { fetchProjects, fetchTimeEntries } from '../api/queries.js';
import { Button, Card } from '../components/ui.js';
import { addDays, formatMinutes, startOfIsoWeek } from '../lib/format.js';

const HOUR_HEIGHT = 44; // px per hour row
const DAY_START_HOUR = 6; // visible range
const DAY_END_HOUR = 24; // 6am → midnight
const VISIBLE_HOURS = DAY_END_HOUR - DAY_START_HOUR;

const DAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;

// Deterministic project → color mapping so the same project always renders the
// same hue across the week. We pick from a narrow blue-friendly palette so the
// calendar stays on-brand.
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

interface PositionedEntry {
  entry: TimeEntryDto;
  top: number;
  height: number;
  startHour: number; // local hour as float
  endHour: number;
}

export function CalendarPage() {
  const [anchor, setAnchor] = useState(() => startOfIsoWeek(new Date()));

  const from = anchor.toISOString();
  const to = addDays(anchor, 7).toISOString();
  const { data: entryData } = useQuery({
    queryKey: ['time-entries', { from, to }],
    queryFn: () => fetchTimeEntries({ from, to }),
  });
  const { data: projectData } = useQuery({
    queryKey: ['projects'],
    queryFn: () => fetchProjects(),
  });

  const projectName = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of projectData?.projects ?? []) m.set(p.id, p.name);
    return m;
  }, [projectData]);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(anchor, i)),
    [anchor],
  );

  // Bucket entries into day columns and compute placement. Entries that span
  // midnight are clipped to each day they touch so a Mon-10pm → Tue-2am timer
  // shows up on both columns.
  const byDay = useMemo<PositionedEntry[][]>(() => {
    const buckets: PositionedEntry[][] = days.map(() => []);
    for (const e of entryData?.entries ?? []) {
      if (!e.endedAt) continue; // skip the currently-running timer
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">What are you working on?</h1>
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

        {/* Header row: day labels + per-day totals */}
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

        {/* Scrollable calendar body */}
        <div
          className="relative overflow-y-auto"
          style={{ maxHeight: '72vh' }}
        >
          <div
            className="relative grid grid-cols-[64px_repeat(7,1fr)]"
            style={{ height: VISIBLE_HOURS * HOUR_HEIGHT }}
          >
            {/* Hour column */}
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

            {/* Day columns */}
            {days.map((d, i) => {
              const isToday = d.toDateString() === today.toDateString();
              return (
                <div
                  key={i}
                  className={`relative border-l border-ink-500 ${
                    isToday ? 'bg-brand-500/[0.03]' : ''
                  }`}
                >
                  {/* Hour gridlines */}
                  {Array.from({ length: VISIBLE_HOURS }, (_, j) => (
                    <div
                      key={j}
                      className="absolute left-0 right-0 border-t border-ink-500/60"
                      style={{ top: j * HOUR_HEIGHT }}
                    />
                  ))}
                  {/* Entries */}
                  {byDay[i]!.map((p, idx) => {
                    const [bg, border, text] = colorFor(p.entry.projectId);
                    const name =
                      p.entry.projectId
                        ? (projectName.get(p.entry.projectId) ?? 'Project')
                        : 'Unassigned';
                    const startStr = new Date(
                      p.entry.startedAt,
                    ).toLocaleTimeString(undefined, {
                      hour: 'numeric',
                      minute: '2-digit',
                    });
                    return (
                      <div
                        key={idx}
                        className={`absolute left-1 right-1 overflow-hidden rounded-sm border px-2 py-1 text-xs ${bg} ${border} ${text}`}
                        style={{ top: p.top, height: p.height }}
                        title={`${name} · ${startStr} · ${formatMinutes(Math.round((p.endHour - p.startHour) * 60))}${p.entry.description ? ` · ${p.entry.description}` : ''}`}
                      >
                        <div className="truncate font-medium">{name}</div>
                        {p.entry.description && p.height > 34 && (
                          <div className="truncate text-[10px] opacity-75">
                            {p.entry.description}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </Card>
    </div>
  );
}
