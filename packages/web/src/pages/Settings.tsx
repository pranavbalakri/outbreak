import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, Field, Modal, Select, inputClass } from '../components/ui.js';
import { useAuth } from '../auth/AuthContext.js';
import { apiOrigin } from '../api/client.js';
import { useConfirm } from '../components/Confirm.js';
import {
  createFolder,
  createTag,
  deleteFolder,
  deleteTag,
  fetchApiTokens,
  fetchFeedback,
  fetchFolders,
  fetchTags,
  fetchUsageSummary,
  fetchWeeks,
  lockWeek,
  resolveFeedback,
  revokeApiToken,
  unlockWeek,
  updateFolder,
} from '../api/queries.js';

type TabId =
  | 'folders'
  | 'tags'
  | 'weeks'
  | 'devices'
  | 'data'
  | 'feedback'
  | 'usage'
  | 'profile';

const TAB_LABELS: Record<TabId, string> = {
  folders: 'Folders',
  tags: 'Tags',
  weeks: 'Week Locks',
  devices: 'Connected Devices',
  data: 'Data Export',
  feedback: 'Feedback',
  usage: 'Usage',
  profile: 'Profile',
};

export function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const tabs: TabId[] = isAdmin
    ? ['folders', 'tags', 'weeks', 'devices', 'data', 'feedback', 'usage', 'profile']
    : ['devices', 'profile'];
  const [tab, setTab] = useState<TabId>(tabs[0]!);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <div className="flex gap-2 border-b border-ink-400">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-4 py-2 text-sm ${
              tab === t
                ? 'border-brand-400 text-brand-300 font-medium'
                : 'border-transparent text-ink-200 hover:text-ink-100'
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {tab === 'folders' && <FoldersTab />}
      {tab === 'tags' && <TagsTab />}
      {tab === 'weeks' && <WeeksTab />}
      {tab === 'devices' && <DevicesTab />}
      {tab === 'data' && <DataExportTab />}
      {tab === 'feedback' && <FeedbackTab />}
      {tab === 'usage' && <UsageTab />}
      {tab === 'profile' && <ProfileTab />}
    </div>
  );
}

function FeedbackTab() {
  const qc = useQueryClient();
  const [showResolved, setShowResolved] = useState(false);
  const fq = useQuery({
    queryKey: ['feedback', showResolved],
    queryFn: () => fetchFeedback(showResolved),
  });
  const toggleM = useMutation({
    mutationFn: ({ id, resolved }: { id: string; resolved: boolean }) =>
      resolveFeedback(id, resolved),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feedback'] }),
  });

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink-100">Feedback</h2>
        <label className="flex items-center gap-2 text-xs text-ink-200">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
          />
          Include resolved
        </label>
      </div>
      {fq.data && fq.data.feedback.length === 0 ? (
        <div className="text-sm text-ink-300">No feedback submitted yet.</div>
      ) : (
        <ul className="space-y-3">
          {fq.data?.feedback.map((f) => (
            <li
              key={f.id}
              className="rounded border border-ink-400 p-3 text-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{f.userName}</div>
                  <div className="text-xs text-ink-200">
                    {f.userEmail} · {new Date(f.createdAt).toLocaleString()}
                    {f.pageUrl && (
                      <>
                        {' · '}
                        <a
                          href={f.pageUrl}
                          className="text-brand-700 underline"
                          target="_blank"
                          rel="noreferrer"
                        >
                          {new URL(f.pageUrl).pathname}
                        </a>
                      </>
                    )}
                  </div>
                </div>
                {f.resolvedAt ? (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      toggleM.mutate({ id: f.id, resolved: false })
                    }
                  >
                    Reopen
                  </Button>
                ) : (
                  <Button
                    onClick={() => toggleM.mutate({ id: f.id, resolved: true })}
                  >
                    Mark resolved
                  </Button>
                )}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-ink-100">
                {f.message}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function UsageTab() {
  const q = useQuery({ queryKey: ['usage'], queryFn: () => fetchUsageSummary() });
  const totals = q.data?.totalsBySource;

  return (
    <Card className="p-4">
      <h2 className="mb-3 text-sm font-semibold text-ink-100">
        Usage by source (last 90 days)
      </h2>
      <p className="mb-4 text-xs text-ink-200">
        Are instructors using the Chrome extension? Count of time entries by
        source, grouped by ISO week.
      </p>
      <div className="mb-4 grid grid-cols-3 gap-3">
        {(['WEB', 'EXTENSION', 'MANUAL'] as const).map((s) => (
          <div key={s} className="rounded border border-ink-400 p-3">
            <div className="text-xs uppercase tracking-wide text-ink-200">{s}</div>
            <div className="mt-1 text-xl font-semibold">{totals?.[s] ?? 0}</div>
          </div>
        ))}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ink-400 text-left text-xs uppercase text-ink-200">
            <th className="py-2">ISO week</th>
            <th className="py-2">Source</th>
            <th className="py-2 text-right">Entries</th>
          </tr>
        </thead>
        <tbody>
          {q.data?.weeks.map((w, i) => (
            <tr key={i} className="border-b border-ink-500 last:border-none">
              <td className="py-2">
                {w.isoYear}-W{String(w.isoWeek).padStart(2, '0')}
              </td>
              <td className="py-2">
                <Badge tone="slate">{w.source}</Badge>
              </td>
              <td className="py-2 text-right">{w.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {q.data && q.data.weeks.length === 0 && (
        <div className="py-4 text-sm text-ink-300">No time entries in range.</div>
      )}
    </Card>
  );
}

function FoldersTab() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const foldersQ = useQuery({ queryKey: ['folders'], queryFn: fetchFolders });
  // null = closed; { id: null } = creating; { id: '…' } = editing that folder
  const [sheet, setSheet] = useState<
    | null
    | {
        id: string | null;
        name: string;
        color: string;
        parentFolderId: string | null;
      }
  >(null);
  const [error, setError] = useState<string | null>(null);

  const createM = useMutation({
    mutationFn: () =>
      createFolder({
        name: sheet!.name,
        color: sheet!.color,
        parentFolderId: sheet!.parentFolderId,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['folders'] });
      setSheet(null);
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const editM = useMutation({
    mutationFn: () =>
      updateFolder(sheet!.id!, {
        name: sheet!.name,
        color: sheet!.color,
        parentFolderId: sheet!.parentFolderId,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['folders'] });
      setSheet(null);
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const archiveM = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      updateFolder(id, { archived }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['folders'] }),
  });
  const deleteM = useMutation({
    mutationFn: (id: string) => deleteFolder(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['folders'] }),
    onError: (e: Error) => alert(e.message),
  });

  const isEditing = sheet?.id !== null && sheet?.id !== undefined;
  const pending = createM.isPending || editM.isPending;

  return (
    <Card className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink-100">Folders</h2>
        <Button
          onClick={() =>
            setSheet({ id: null, name: '', color: '#1a73ff', parentFolderId: null })
          }
        >
          New folder
        </Button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ink-400 text-left text-xs uppercase text-ink-200">
            <th className="py-2">Name</th>
            <th className="py-2">Parent</th>
            <th className="py-2">Color</th>
            <th className="py-2">Status</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {foldersQ.data?.folders.map((f) => {
            const parentName = f.parentFolderId
              ? foldersQ.data?.folders.find((p) => p.id === f.parentFolderId)?.name
              : null;
            return (
            <tr key={f.id} className="border-b border-ink-500 last:border-none">
              <td className="py-2">{f.name}</td>
              <td className="py-2 text-ink-200">{parentName ?? '—'}</td>
              <td className="py-2">
                {f.color && (
                  <span
                    className="inline-block h-4 w-4 rounded-sm align-middle"
                    style={{ backgroundColor: f.color }}
                  />
                )}{' '}
                <code className="text-xs text-ink-200">{f.color ?? '—'}</code>
              </td>
              <td className="py-2">
                {f.archivedAt ? <Badge tone="slate">Archived</Badge> : <Badge tone="green">Active</Badge>}
              </td>
              <td className="py-2 text-right">
                <div className="flex justify-end gap-2">
                  <Button
                    variant="secondary"
                    onClick={() =>
                      setSheet({
                        id: f.id,
                        name: f.name,
                        color: f.color ?? '#1a73ff',
                        parentFolderId: f.parentFolderId,
                      })
                    }
                  >
                    Edit
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      archiveM.mutate({ id: f.id, archived: !f.archivedAt })
                    }
                  >
                    {f.archivedAt ? 'Unarchive' : 'Archive'}
                  </Button>
                  <Button
                    variant="danger"
                    onClick={async () => {
                      const ok = await confirm({
                        title: 'Delete folder',
                        message: (
                          <>
                            Delete <span className="text-ink-100">“{f.name}”</span>? Folders
                            that still contain projects can&apos;t be deleted — remove or
                            reassign them first.
                          </>
                        ),
                        confirmLabel: 'Delete',
                        danger: true,
                      });
                      if (ok) deleteM.mutate(f.id);
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>

      <Modal
        open={sheet !== null}
        onClose={() => {
          setSheet(null);
          setError(null);
        }}
        title={isEditing ? 'Edit folder' : 'New folder'}
      >
        <div className="space-y-3">
          <Field label="Name">
            <input
              className={inputClass}
              value={sheet?.name ?? ''}
              onChange={(e) =>
                setSheet((s) => (s ? { ...s, name: e.target.value } : s))
              }
              autoFocus
            />
          </Field>
          <Field
            label="Parent folder"
            {...(sheet?.id
              ? { hint: "Can't be set to this folder or one of its descendants." }
              : {})}
          >
            <Select
              value={sheet?.parentFolderId ?? ''}
              onChange={(v) =>
                setSheet((s) => (s ? { ...s, parentFolderId: v || null } : s))
              }
              placeholder="No parent (top level)"
              options={[
                { value: '', label: 'No parent (top level)' },
                ...(foldersQ.data?.folders ?? [])
                  .filter((f) => !f.archivedAt && f.id !== sheet?.id)
                  .map((f) => ({ value: f.id, label: f.name })),
              ]}
            />
          </Field>
          <Field label="Color">
            <div className="flex items-center gap-3">
              <input
                type="color"
                className="h-9 w-12 cursor-pointer rounded border border-ink-400 bg-ink-900"
                value={sheet?.color ?? '#1a73ff'}
                onChange={(e) =>
                  setSheet((s) => (s ? { ...s, color: e.target.value } : s))
                }
              />
              <code className="text-xs text-ink-200">{sheet?.color}</code>
            </div>
          </Field>
          {error && <div className="text-sm text-red-400">{error}</div>}
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setSheet(null);
                setError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={!sheet?.name?.trim() || pending}
              onClick={() => (isEditing ? editM.mutate() : createM.mutate())}
            >
              {pending
                ? isEditing
                  ? 'Saving…'
                  : 'Creating…'
                : isEditing
                  ? 'Save'
                  : 'Create'}
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}

function TagsTab() {
  const qc = useQueryClient();
  const tagsQ = useQuery({ queryKey: ['tags'], queryFn: fetchTags });
  const [name, setName] = useState('');
  const createM = useMutation({
    mutationFn: () => createTag({ name }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tags'] });
      setName('');
    },
  });
  const deleteM = useMutation({
    mutationFn: (id: string) => deleteTag(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tags'] }),
  });

  return (
    <Card className="p-4">
      <div className="mb-4 flex items-center gap-2">
        <input
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New tag name"
        />
        <Button disabled={!name || createM.isPending} onClick={() => createM.mutate()}>
          Add
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {tagsQ.data?.tags.map((t) => (
          <span
            key={t.id}
            className="inline-flex items-center gap-2 rounded-full bg-ink-700 px-3 py-1 text-sm"
          >
            {t.name}
            <button
              onClick={() => deleteM.mutate(t.id)}
              className="text-ink-300 hover:text-red-600"
              aria-label={`Delete tag ${t.name}`}
            >
              ✕
            </button>
          </span>
        ))}
        {tagsQ.data?.tags.length === 0 && (
          <span className="text-sm text-ink-300">No tags yet.</span>
        )}
      </div>
    </Card>
  );
}

function WeeksTab() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const weeksQ = useQuery({ queryKey: ['weeks'], queryFn: fetchWeeks });
  const lockM = useMutation({
    mutationFn: ({ y, w }: { y: number; w: number }) => lockWeek(y, w),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['weeks'] }),
  });
  const unlockM = useMutation({
    mutationFn: ({ y, w }: { y: number; w: number }) => unlockWeek(y, w),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['weeks'] }),
  });

  const fmtMin = (m: number) => {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${h}h ${mm}m`;
  };

  return (
    <Card className="p-0">
      <div className="border-b border-ink-400 p-4 text-sm text-ink-200">
        Locking a week freezes all time entries whose <code>started_at</code> falls in it.
        Enforced at the database level via a trigger, so even direct SQL can't slip an edit
        through.
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ink-400 text-left text-xs uppercase text-ink-200">
            <th className="px-4 py-3">ISO week</th>
            <th className="px-4 py-3">Dates</th>
            <th className="px-4 py-3 text-right">Tracked</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {weeksQ.data?.weeks.map((w) => (
            <tr
              key={`${w.isoYear}-${w.isoWeek}`}
              className="border-b border-ink-500 last:border-none"
            >
              <td className="px-4 py-3 font-medium">
                {w.isoYear}-W{String(w.isoWeek).padStart(2, '0')}
              </td>
              <td className="px-4 py-3 text-ink-200">
                {w.startDate} → {w.endDate}
              </td>
              <td className="px-4 py-3 text-right">{fmtMin(w.totalMinutes)}</td>
              <td className="px-4 py-3">
                {w.locked ? <Badge tone="red">Locked</Badge> : <Badge tone="green">Open</Badge>}
              </td>
              <td className="px-4 py-3 text-right">
                {w.locked ? (
                  <Button
                    variant="secondary"
                    onClick={() => unlockM.mutate({ y: w.isoYear, w: w.isoWeek })}
                  >
                    Unlock
                  </Button>
                ) : (
                  <Button
                    onClick={async () => {
                      const label = `${w.isoYear}-W${String(w.isoWeek).padStart(2, '0')}`;
                      const ok = await confirm({
                        title: 'Lock week',
                        message: (
                          <>
                            Lock <span className="text-ink-100">{label}</span>? All time
                            entries in this week become read-only until you unlock it.
                          </>
                        ),
                        confirmLabel: 'Lock',
                        danger: true,
                      });
                      if (ok) lockM.mutate({ y: w.isoYear, w: w.isoWeek });
                    }}
                  >
                    Lock
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function DevicesTab() {
  const qc = useQueryClient();
  const tokensQ = useQuery({ queryKey: ['apiTokens'], queryFn: fetchApiTokens });
  const revokeM = useMutation({
    mutationFn: (id: string) => revokeApiToken(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['apiTokens'] }),
  });

  return (
    <Card className="p-4">
      <h2 className="mb-3 text-sm font-semibold text-ink-100">Connected devices</h2>
      {tokensQ.data && tokensQ.data.tokens.length === 0 ? (
        <div className="text-sm text-ink-300">No connected devices. Install the Chrome extension to get started.</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-400 text-left text-xs uppercase text-ink-200">
              <th className="py-2">Label</th>
              <th className="py-2">Source</th>
              <th className="py-2">Created</th>
              <th className="py-2">Last used</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {tokensQ.data?.tokens.map((t) => (
              <tr key={t.id} className="border-b border-ink-500 last:border-none">
                <td className="py-2">{t.label ?? '(unnamed)'}</td>
                <td className="py-2">
                  <Badge tone="slate">{t.source}</Badge>
                </td>
                <td className="py-2 text-ink-200">
                  {new Date(t.createdAt).toLocaleDateString()}
                </td>
                <td className="py-2 text-ink-200">
                  {t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleString() : '—'}
                </td>
                <td className="py-2 text-right">
                  {t.revokedAt ? (
                    <Badge tone="red">Revoked</Badge>
                  ) : (
                    <Button variant="danger" onClick={() => revokeM.mutate(t.id)}>
                      Revoke
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function DataExportTab() {
  const onExport = async () => {
    // A full account export is out of scope for v1; for now, route to the reports CSV for the last year.
    const to = new Date();
    const from = new Date(to);
    from.setUTCFullYear(to.getUTCFullYear() - 1);
    const url = `${apiOrigin()}/reports/export.csv?from=${from.toISOString()}&to=${to.toISOString()}`;
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) {
      alert(`Export failed: ${res.status}`);
      return;
    }
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = `outbreak_full_${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  };

  return (
    <Card className="p-4">
      <h2 className="mb-3 text-sm font-semibold text-ink-100">Data export</h2>
      <p className="mb-4 text-sm text-ink-200">
        Download a CSV of every time entry in the last 12 months.
      </p>
      <Button onClick={() => void onExport()}>Export CSV (last year)</Button>
    </Card>
  );
}

function ProfileTab() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <Card className="p-4">
      <h2 className="mb-3 text-sm font-semibold text-ink-100">Your profile</h2>
      <dl className="grid grid-cols-1 gap-y-3 text-sm sm:grid-cols-[max-content_1fr] sm:gap-x-4">
        <dt className="text-ink-200">Name</dt>
        <dd>{user.name}</dd>
        <dt className="text-ink-200">Email</dt>
        <dd>{user.email}</dd>
        <dt className="text-ink-200">Role</dt>
        <dd>
          <Badge tone={user.role === 'ADMIN' ? 'indigo' : 'slate'}>{user.role}</Badge>
        </dd>
        <dt className="text-ink-200">Timezone</dt>
        <dd>{user.timezone}</dd>
        <dt className="text-ink-200">Google account</dt>
        <dd className="text-ink-200">Linked via Google Sign-In (read-only).</dd>
        {user.rateVisibleToSelf && (
          <>
            <dt className="text-ink-200">Billing rate</dt>
            <dd>
              ${(user.currentRateCents / 100).toFixed(2)}/hr
            </dd>
          </>
        )}
      </dl>
    </Card>
  );
}
