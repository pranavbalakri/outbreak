import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import type { ProjectDto } from '@outbreak/shared';
import {
  addAssignee,
  addProjectTag,
  createTag,
  createTask,
  deleteProject,
  deleteTask,
  fetchProject,
  fetchTags,
  fetchTasks,
  fetchTimeEntries,
  fetchUsers,
  removeAssignee,
  removeProjectTag,
  updateProject,
  updateTask,
} from '../api/queries.js';
import { useAuth } from '../auth/AuthContext.js';
import { useTimer } from '../hooks/useTimer.js';
import { Badge, Button, Card, Field, Modal, Select, inputClass } from '../components/ui.js';
import { useConfirm } from '../components/Confirm.js';
import { formatDate, formatMinutes, formatTime, durationMinutes } from '../lib/format.js';

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { start, active } = useTimer();

  const deleteProjectM = useMutation({
    mutationFn: (pid: string) => deleteProject(pid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      navigate('/projects');
    },
    onError: (e: Error) => alert(e.message),
  });

  const [tab, setTab] = useState<'tasks' | 'entries' | 'notes'>('tasks');
  const [editing, setEditing] = useState(false);
  const [addingTask, setAddingTask] = useState(false);

  const { data: projectData } = useQuery({
    queryKey: ['project', id],
    queryFn: () => fetchProject(id!),
    enabled: !!id,
  });
  const { data: taskData } = useQuery({
    queryKey: ['project-tasks', id],
    queryFn: () => fetchTasks(id!),
    enabled: !!id,
  });
  const { data: entryData } = useQuery({
    queryKey: ['time-entries', { projectId: id }],
    queryFn: () => fetchTimeEntries({ projectId: id }),
    enabled: !!id,
  });
  const { data: userData } = useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
    enabled: isAdmin,
  });
  const { data: tagData } = useQuery({ queryKey: ['tags'], queryFn: fetchTags });

  const project = projectData?.project;
  if (!project) return <div className="text-sm text-ink-200">Loading…</div>;

  const actual = project.actualMinutes ?? 0;
  const pct =
    project.estimatedMinutes === 0
      ? 0
      : Math.min(100, Math.round((actual / project.estimatedMinutes) * 100));

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['project', id] });
    queryClient.invalidateQueries({ queryKey: ['project-tasks', id] });
    queryClient.invalidateQueries({ queryKey: ['projects'] });
  };

  const canStart = !active || active.projectId !== project.id;

  return (
    <div>
      <div className="mb-4 text-sm">
        <Link to="/projects" className="text-ink-200 hover:underline">
          ← Projects
        </Link>
      </div>

      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-ink-200">
            <Badge>{project.status.replace('_', ' ').toLowerCase()}</Badge>
            <span>Due {formatDate(project.dueAt)}</span>
            {project.isOverEstimate && <Badge tone="yellow">Over estimate</Badge>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => void start({ projectId: project.id })}
            disabled={!canStart}
            title={!canStart ? 'Timer already running on this project' : ''}
          >
            ▶ Start timer
          </Button>
          {isAdmin && (
            <>
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Edit
              </Button>
              <Button
                variant="danger"
                disabled={deleteProjectM.isPending}
                onClick={async () => {
                  const ok = await confirm({
                    title: 'Delete project',
                    message: (
                      <>
                        Delete <span className="text-ink-100">“{project.name}”</span>? It will
                        disappear from all views, but time entries already logged against it
                        are preserved.
                      </>
                    ),
                    confirmLabel: 'Delete',
                    danger: true,
                  });
                  if (ok) deleteProjectM.mutate(project.id);
                }}
              >
                {deleteProjectM.isPending ? 'Deleting…' : 'Delete'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Estimate progress */}
      <Card className="mb-5 p-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium">Estimate progress</span>
          <span className="tabular-nums text-ink-200">
            {formatMinutes(actual)} / {formatMinutes(project.estimatedMinutes)} (
            {project.originalEstimatedMinutes !== project.estimatedMinutes && (
              <>original {formatMinutes(project.originalEstimatedMinutes)} · </>
            )}
            {project.varianceMinutes! > 0 ? '+' : ''}
            {formatMinutes(project.varianceMinutes ?? 0)})
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-ink-700">
          <div
            className={`h-full rounded-full ${
              project.isOverEstimate ? 'bg-yellow-500' : 'bg-brand-500'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </Card>

      {/* Assignees & tags */}
      <div className="mb-5 grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-200">
              Assignees
            </div>
          </div>
          <AssigneesPanel
            project={project}
            users={userData?.users ?? []}
            canEdit={isAdmin}
            onChange={invalidate}
          />
        </Card>
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-200">
              Tags
            </div>
          </div>
          <TagsPanel
            project={project}
            tags={tagData?.tags ?? []}
            canEdit={isAdmin}
            onChange={() => {
              invalidate();
              queryClient.invalidateQueries({ queryKey: ['tags'] });
            }}
          />
        </Card>
      </div>

      {/* Tabs */}
      <div className="mb-3 flex gap-1 border-b border-ink-400">
        {(['tasks', 'entries', 'notes'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm ${
              tab === t
                ? 'border-b-2 border-brand-600 font-medium text-brand-700'
                : 'text-ink-200 hover:text-ink-100'
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'tasks' && (
        <Card className="p-4">
          {isAdmin && (
            <div className="mb-3 flex justify-end">
              <Button variant="secondary" onClick={() => setAddingTask(true)}>
                + Task
              </Button>
            </div>
          )}
          <ul className="divide-y divide-ink-500">
            {(taskData?.tasks ?? []).map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2">
                <div>
                  <div className="text-sm font-medium">{t.name}</div>
                  <div className="text-xs text-ink-200">
                    {formatMinutes(t.estimatedMinutes)}
                    {t.originalEstimatedMinutes !== t.estimatedMinutes && (
                      <> (orig {formatMinutes(t.originalEstimatedMinutes)})</>
                    )}{' '}
                    · {t.status.replace('_', ' ').toLowerCase()}{' '}
                    {t.dueAt && <>· due {formatDate(t.dueAt)}</>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => void start({ projectId: project.id, taskId: t.id })}
                    disabled={active?.taskId === t.id}
                  >
                    ▶
                  </Button>
                  {isAdmin && (
                    <button
                      type="button"
                      className="text-xs text-ink-300 hover:text-red-600"
                      onClick={async () => {
                        const ok = await confirm({
                          title: 'Delete task',
                          message: `Delete “${t.name}”?`,
                          confirmLabel: 'Delete',
                          danger: true,
                        });
                        if (!ok) return;
                        await deleteTask(t.id);
                        invalidate();
                      }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </li>
            ))}
            {(taskData?.tasks ?? []).length === 0 && (
              <li className="py-4 text-center text-sm text-ink-300">
                No tasks — this project tracks time directly.
              </li>
            )}
          </ul>
        </Card>
      )}

      {tab === 'entries' && (
        <Card className="p-4">
          <ul className="divide-y divide-ink-500">
            {(entryData?.entries ?? []).map((e) => (
              <li key={e.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <div>
                    {formatDate(e.startedAt)} · {formatTime(e.startedAt)} –{' '}
                    {e.endedAt ? formatTime(e.endedAt) : 'now'}
                  </div>
                  {e.description && (
                    <div className="text-xs text-ink-200">{e.description}</div>
                  )}
                </div>
                <div className="font-mono text-xs text-ink-200">
                  {formatMinutes(durationMinutes(e.startedAt, e.endedAt))}
                </div>
              </li>
            ))}
            {(entryData?.entries ?? []).length === 0 && (
              <li className="py-4 text-center text-sm text-ink-300">
                No entries logged yet.
              </li>
            )}
          </ul>
        </Card>
      )}

      {tab === 'notes' && (
        <Card className="p-4">
          {project.description ? (
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown>{project.description}</ReactMarkdown>
            </div>
          ) : (
            <div className="text-sm text-ink-300">No description yet.</div>
          )}
        </Card>
      )}

      {editing && (
        <EditProjectModal
          project={project}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            invalidate();
          }}
        />
      )}
      {addingTask && (
        <AddTaskModal
          projectId={project.id}
          onClose={() => setAddingTask(false)}
          onCreated={() => {
            setAddingTask(false);
            invalidate();
          }}
        />
      )}
    </div>
  );
}

function AssigneesPanel({
  project,
  users,
  canEdit,
  onChange,
}: {
  project: ProjectDto;
  users: { id: string; name: string; role: string }[];
  canEdit: boolean;
  onChange: () => void;
}) {
  const assignedSet = new Set(project.assigneeIds);
  const available = users.filter((u) => !assignedSet.has(u.id));

  if (users.length === 0 && project.assigneeIds.length === 0) {
    return <div className="text-xs text-ink-300">—</div>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {project.assigneeIds.map((uid) => {
        // Prefer the server-provided {id,name} list (works for instructors
        // who can't hit /users). Fall back to the admin /users query.
        const name =
          project.assignees.find((a) => a.id === uid)?.name
            ?? users.find((x) => x.id === uid)?.name
            ?? uid;
        return (
          <span
            key={uid}
            className="inline-flex items-center gap-1 rounded-full bg-ink-700 px-2 py-0.5 text-xs"
          >
            {name}
            {canEdit && (
              <button
                type="button"
                className="text-ink-300 hover:text-red-600"
                onClick={async () => {
                  await removeAssignee(project.id, uid);
                  onChange();
                }}
              >
                ✕
              </button>
            )}
          </span>
        );
      })}
      {canEdit && available.length > 0 && (
        <Select
          value=""
          onChange={async (v) => {
            if (!v) return;
            await addAssignee(project.id, v);
            onChange();
          }}
          placeholder="+ Add"
          triggerWidth={110}
          options={available.map((u) => ({ value: u.id, label: u.name }))}
        />
      )}
    </div>
  );
}

function TagsPanel({
  project,
  tags,
  canEdit,
  onChange,
}: {
  project: ProjectDto;
  tags: { id: string; name: string }[];
  canEdit: boolean;
  onChange: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const assignedSet = new Set(project.tagIds);
  const available = tags.filter((t) => !assignedSet.has(t.id));
  return (
    <div className="flex flex-wrap items-center gap-1">
      {project.tagIds.map((tid) => {
        const t = tags.find((x) => x.id === tid);
        return (
          <span
            key={tid}
            className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700"
          >
            {t?.name ?? tid}
            {canEdit && (
              <button
                type="button"
                className="text-indigo-300 hover:text-red-600"
                onClick={async () => {
                  await removeProjectTag(project.id, tid);
                  onChange();
                }}
              >
                ✕
              </button>
            )}
          </span>
        );
      })}
      {canEdit && available.length > 0 && (
        <Select
          value=""
          onChange={async (v) => {
            if (!v) return;
            await addProjectTag(project.id, v);
            onChange();
          }}
          placeholder="+ Add tag"
          triggerWidth={130}
          options={available.map((t) => ({ value: t.id, label: t.name }))}
        />
      )}
      {canEdit && !creating && (
        <button
          type="button"
          className="text-xs text-ink-300 hover:text-ink-100"
          onClick={() => setCreating(true)}
        >
          + new
        </button>
      )}
      {canEdit && creating && (
        <form
          className="flex gap-1"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name) return;
            const { tag } = await createTag({ name });
            await addProjectTag(project.id, tag.id);
            setName('');
            setCreating(false);
            onChange();
          }}
        >
          <input
            className="rounded-full border border-ink-400 px-2 py-0.5 text-xs"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="tag name"
          />
        </form>
      )}
    </div>
  );
}

function EditProjectModal({
  project,
  onClose,
  onSaved,
}: {
  project: ProjectDto;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(project.name);
  const [estimatedHours, setEstimatedHours] = useState(
    (project.estimatedMinutes / 60).toString(),
  );
  const [dueAt, setDueAt] = useState(project.dueAt ? project.dueAt.slice(0, 10) : '');
  const [status, setStatus] = useState(project.status);
  const [description, setDescription] = useState(project.description ?? '');

  const mutation = useMutation({
    mutationFn: () =>
      updateProject(project.id, {
        name,
        estimatedMinutes: Math.round(parseFloat(estimatedHours) * 60),
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        status,
        description: description || null,
      }),
    onSuccess: onSaved,
  });

  return (
    <Modal open onClose={onClose} title="Edit project">
      <div className="space-y-3">
        <Field label="Name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Estimated hours" hint={`Original was ${(project.originalEstimatedMinutes / 60).toFixed(2)}h`}>
            <input
              className={inputClass}
              type="number"
              step="0.25"
              min="0"
              value={estimatedHours}
              onChange={(e) => setEstimatedHours(e.target.value)}
            />
          </Field>
          <Field label="Status">
            <Select
              value={status}
              onChange={(v) => setStatus(v as typeof status)}
              options={['NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETE', 'ARCHIVED'].map(
                (s) => ({ value: s, label: s.replace('_', ' ').toLowerCase() }),
              )}
            />
          </Field>
        </div>
        <Field label="Due date">
          <input
            className={inputClass}
            type="date"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
          />
        </Field>
        <Field label="Description (markdown)">
          <textarea
            className={inputClass}
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
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

function AddTaskModal({
  projectId,
  onClose,
  onCreated,
}: {
  projectId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [hours, setHours] = useState('1');
  const [dueAt, setDueAt] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      createTask(projectId, {
        name,
        estimatedMinutes: Math.round(parseFloat(hours) * 60),
        dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
      }),
    onSuccess: onCreated,
  });

  return (
    <Modal open onClose={onClose} title="New task">
      <div className="space-y-3">
        <Field label="Name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Estimated hours">
            <input
              className={inputClass}
              type="number"
              step="0.25"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
          </Field>
          <Field label="Due date">
            <input
              className={inputClass}
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!name || mutation.isPending}>
            Create
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// Suppress unused-import warning when status lookups aren't used elsewhere.
export { updateTask };
