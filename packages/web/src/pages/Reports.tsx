import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ReportGroupBy } from '@outbreak/shared';
import { Badge, Button, Card, Field, Select, inputClass } from '../components/ui.js';
import {
  fetchFolders,
  fetchReportDaily,
  fetchReportProjects,
  fetchReportSummary,
  fetchTags,
  fetchUsers,
  reportCsvUrl,
  reportPdfUrl,
} from '../api/queries.js';

type TabId = 'week' | 'month' | 'custom';

function startOfWeekUtc(d: Date): Date {
  const copy = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = copy.getUTCDay(); // 0=Sun
  const diff = (dow + 6) % 7; // Monday start
  copy.setUTCDate(copy.getUTCDate() - diff);
  return copy;
}

function startOfMonthUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function rangeFor(tab: TabId, customFrom: string, customTo: string): { from: string; to: string } {
  const now = new Date();
  if (tab === 'week') {
    const from = startOfWeekUtc(now);
    const to = new Date(from);
    to.setUTCDate(from.getUTCDate() + 7);
    return { from: from.toISOString(), to: to.toISOString() };
  }
  if (tab === 'month') {
    const from = startOfMonthUtc(now);
    const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
    return { from: from.toISOString(), to: to.toISOString() };
  }
  return {
    from: customFrom ? new Date(customFrom).toISOString() : startOfMonthUtc(now).toISOString(),
    to: customTo ? new Date(customTo).toISOString() : now.toISOString(),
  };
}

function fmtMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${mm}m`;
}
function fmtCents(c: number): string {
  return `$${(c / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const BLUE_PALETTE = ['#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#1e40af', '#0ea5e9', '#06b6d4'];

async function downloadCsv(url: string, filename: string) {
  // Pulling through fetch so the session cookie rides along even on a cross-origin API host, which a plain <a download> wouldn't guarantee.
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}

export function ReportsPage() {
  const [tab, setTab] = useState<TabId>('week');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [folderId, setFolderId] = useState('');
  const [tagId, setTagId] = useState('');
  const [instructorId, setInstructorId] = useState('');
  const [billableFilter, setBillableFilter] = useState<'all' | 'billable' | 'nonbillable'>(
    'all',
  );
  const [includeUnassigned, setIncludeUnassigned] = useState(true);

  const { from, to } = useMemo(() => rangeFor(tab, customFrom, customTo), [tab, customFrom, customTo]);

  const billable =
    billableFilter === 'all' ? undefined : billableFilter === 'billable';

  const filters = {
    from,
    to,
    folderId: folderId || undefined,
    tagId: tagId || undefined,
    instructorId: instructorId || undefined,
    billable,
    includeUnassigned,
  };

  const foldersQ = useQuery({ queryKey: ['folders'], queryFn: fetchFolders });
  const tagsQ = useQuery({ queryKey: ['tags'], queryFn: fetchTags });
  const usersQ = useQuery({ queryKey: ['users'], queryFn: fetchUsers });

  const dailyQ = useQuery({
    queryKey: ['reports.daily', filters],
    queryFn: () => fetchReportDaily(filters),
  });
  const byInstructorQ = useQuery({
    queryKey: ['reports.summary.instructor', filters],
    queryFn: () => fetchReportSummary({ ...filters, groupBy: 'instructor' as ReportGroupBy }),
  });
  const byProjectQ = useQuery({
    queryKey: ['reports.summary.project', filters],
    queryFn: () => fetchReportSummary({ ...filters, groupBy: 'project' as ReportGroupBy }),
  });
  const projectsQ = useQuery({
    queryKey: ['reports.projects', { from, to, folderId: filters.folderId }],
    queryFn: () => fetchReportProjects({ from, to, folderId: filters.folderId }),
    enabled: tab === 'month' || tab === 'custom',
  });

  // Pivot daily cells into a chart-friendly shape: one row per day, one column per instructor.
  const chartData = useMemo(() => {
    const daily = dailyQ.data;
    if (!daily) return [];
    const byDay = new Map<string, Record<string, number | string>>();
    for (const day of daily.days) byDay.set(day, { date: day });
    for (const c of daily.cells) {
      const row = byDay.get(c.date) ?? { date: c.date };
      row[c.instructorName] = (Number(row[c.instructorName] ?? 0) + c.minutes / 60);
      byDay.set(c.date, row);
    }
    return Array.from(byDay.values());
  }, [dailyQ.data]);

  const onExportCsv = async () => {
    const url = reportCsvUrl(filters);
    const filename = `outbreak_${from.slice(0, 10)}_${to.slice(0, 10)}.csv`;
    try {
      await downloadCsv(url, filename);
    } catch (err) {
      alert(`Export failed: ${(err as Error).message}`);
    }
  };

  const onExportPdf = async () => {
    const url = reportPdfUrl(filters);
    const filename = `outbreak_${from.slice(0, 10)}_${to.slice(0, 10)}.pdf`;
    try {
      await downloadCsv(url, filename);
    } catch (err) {
      alert(`Export failed: ${(err as Error).message}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Reports</h1>
        <div className="flex gap-2">
          <Button onClick={() => void onExportCsv()} variant="secondary">
            Export CSV
          </Button>
          <Button onClick={() => void onExportPdf()} variant="secondary">
            Export PDF
          </Button>
        </div>
      </div>

      <div className="flex gap-2 border-b border-ink-400">
        {(['week', 'month', 'custom'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-4 py-2 text-sm ${
              tab === t
                ? 'border-brand-600 text-brand-700 font-medium'
                : 'border-transparent text-ink-200 hover:text-ink-100'
            }`}
          >
            {t === 'week' ? '1 week' : t === 'month' ? '1 month' : 'Custom'}
          </button>
        ))}
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {tab === 'custom' && (
            <>
              <Field label="From">
                <input
                  type="date"
                  className={inputClass}
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                />
              </Field>
              <Field label="To">
                <input
                  type="date"
                  className={inputClass}
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                />
              </Field>
            </>
          )}
          <Field label="Folder">
            <Select
              value={folderId}
              onChange={setFolderId}
              placeholder="All folders"
              options={[
                { value: '', label: 'All folders' },
                ...(foldersQ.data?.folders ?? []).map((f) => ({
                  value: f.id,
                  label: f.name,
                })),
              ]}
            />
          </Field>
          <Field label="Tag">
            <Select
              value={tagId}
              onChange={setTagId}
              placeholder="All tags"
              options={[
                { value: '', label: 'All tags' },
                ...(tagsQ.data?.tags ?? []).map((t) => ({
                  value: t.id,
                  label: t.name,
                })),
              ]}
            />
          </Field>
          <Field label="Instructor">
            <Select
              value={instructorId}
              onChange={setInstructorId}
              placeholder="All instructors"
              options={[
                { value: '', label: 'All instructors' },
                ...(usersQ.data?.users ?? []).map((u) => ({
                  value: u.id,
                  label: u.name,
                })),
              ]}
            />
          </Field>
          <Field label="Billable">
            <Select
              value={billableFilter}
              onChange={(v) => setBillableFilter(v as typeof billableFilter)}
              options={[
                { value: 'all', label: 'All' },
                { value: 'billable', label: 'Billable only' },
                { value: 'nonbillable', label: 'Non-billable' },
              ]}
            />
          </Field>
          <Field label="Unassigned">
            <label className="mt-2 inline-flex items-center gap-2 text-sm text-ink-100">
              <input
                type="checkbox"
                checked={includeUnassigned}
                onChange={(e) => setIncludeUnassigned(e.target.checked)}
              />
              Include unassigned time
            </label>
          </Field>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink-100">Hours per day (by instructor)</h2>
        {dailyQ.isLoading ? (
          <div className="py-12 text-center text-sm text-ink-300">Loading…</div>
        ) : chartData.length === 0 ? (
          <div className="py-12 text-center text-sm text-ink-300">No data in range.</div>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(v) => `${Number(v ?? 0).toFixed(2)} h`}
                  contentStyle={{ fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {dailyQ.data?.instructors.map((i, idx) => (
                  <Bar
                    key={i.id}
                    dataKey={i.name}
                    stackId="hours"
                    fill={BLUE_PALETTE[idx % BLUE_PALETTE.length]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink-100">Totals by instructor</h2>
          <SummaryTable
            rows={byInstructorQ.data?.rows ?? []}
            totals={byInstructorQ.data?.totals}
            showCost
          />
        </Card>
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink-100">Totals by project</h2>
          <SummaryTable
            rows={byProjectQ.data?.rows ?? []}
            totals={byProjectQ.data?.totals}
            showCost
            unassignedFooter
          />
        </Card>
      </div>

      {(tab === 'month' || tab === 'custom') && (
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink-100">
            Projects — estimated vs. actual
          </h2>
          {projectsQ.isLoading ? (
            <div className="py-8 text-center text-sm text-ink-300">Loading…</div>
          ) : (
            <div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-400 text-left text-xs uppercase text-ink-200">
                    <th className="py-2">Project</th>
                    <th className="py-2">Folder</th>
                    <th className="py-2 text-right">Estimated</th>
                    <th className="py-2 text-right">Actual</th>
                    <th className="py-2 text-right">Variance (current)</th>
                    <th className="py-2 text-right">Variance (original)</th>
                    <th className="py-2 text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {projectsQ.data?.rows.map((r) => (
                    <tr
                      key={r.projectId}
                      className="border-b border-ink-500 last:border-none"
                    >
                      <td className="py-2">
                        <span className="font-medium">{r.name}</span>
                        {r.isOverEstimate && (
                          <span className="ml-2">
                            <Badge tone="yellow">over estimate</Badge>
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-ink-200">{r.folderName}</td>
                      <td className="py-2 text-right">{fmtMinutes(r.estimatedMinutes)}</td>
                      <td className="py-2 text-right">{fmtMinutes(r.actualMinutes)}</td>
                      <td
                        className={`py-2 text-right ${
                          r.varianceMinutes > 0 ? 'text-red-600' : 'text-emerald-700'
                        }`}
                      >
                        {r.varianceMinutes > 0 ? '+' : ''}
                        {fmtMinutes(Math.abs(r.varianceMinutes))}
                      </td>
                      <td
                        className={`py-2 text-right ${
                          r.originalVarianceMinutes > 0 ? 'text-red-600' : 'text-emerald-700'
                        }`}
                      >
                        {r.originalVarianceMinutes > 0 ? '+' : ''}
                        {fmtMinutes(Math.abs(r.originalVarianceMinutes))}
                      </td>
                      <td className="py-2 text-right">{fmtCents(r.costCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {projectsQ.data && (
                <div className="mt-4 rounded-md bg-ink-900 p-3 text-sm">
                  <span className="font-medium">Unassigned time:</span>{' '}
                  {fmtMinutes(projectsQ.data.unassigned.minutes)} —{' '}
                  {fmtCents(projectsQ.data.unassigned.costCents)}
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      <div className="text-xs text-ink-300">
        Rates come from the snapshot on each time entry (never retroactive). Currency: USD.
      </div>
    </div>
  );
}

function SummaryTable({
  rows,
  totals,
  showCost,
  unassignedFooter,
}: {
  rows: { key: string; label: string; minutes: number; billableMinutes: number; costCents: number; isUnassigned?: boolean | undefined }[];
  totals?: { minutes: number; billableMinutes: number; costCents: number } | undefined;
  showCost?: boolean | undefined;
  unassignedFooter?: boolean | undefined;
}) {
  if (rows.length === 0) {
    return <div className="py-8 text-center text-sm text-ink-300">No data.</div>;
  }
  const unassignedRow = rows.find((r) => r.isUnassigned);
  const normalRows = rows.filter((r) => !r.isUnassigned);
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-ink-400 text-left text-xs uppercase text-ink-200">
          <th className="py-2">Name</th>
          <th className="py-2 text-right">Hours</th>
          <th className="py-2 text-right">Billable</th>
          {showCost && <th className="py-2 text-right">Cost</th>}
        </tr>
      </thead>
      <tbody>
        {normalRows.map((r) => (
          <tr key={r.key} className="border-b border-ink-500 last:border-none">
            <td className="py-2">{r.label}</td>
            <td className="py-2 text-right">{fmtMinutes(r.minutes)}</td>
            <td className="py-2 text-right">{fmtMinutes(r.billableMinutes)}</td>
            {showCost && <td className="py-2 text-right">{fmtCents(r.costCents)}</td>}
          </tr>
        ))}
        {unassignedFooter && unassignedRow && (
          <tr className="border-b border-ink-500 bg-ink-900">
            <td className="py-2 font-medium text-ink-100">Unassigned</td>
            <td className="py-2 text-right">{fmtMinutes(unassignedRow.minutes)}</td>
            <td className="py-2 text-right">{fmtMinutes(unassignedRow.billableMinutes)}</td>
            {showCost && <td className="py-2 text-right">{fmtCents(unassignedRow.costCents)}</td>}
          </tr>
        )}
        {totals && (
          <tr className="font-medium">
            <td className="py-2">Total</td>
            <td className="py-2 text-right">{fmtMinutes(totals.minutes)}</td>
            <td className="py-2 text-right">{fmtMinutes(totals.billableMinutes)}</td>
            {showCost && <td className="py-2 text-right">{fmtCents(totals.costCents)}</td>}
          </tr>
        )}
      </tbody>
    </table>
  );
}

