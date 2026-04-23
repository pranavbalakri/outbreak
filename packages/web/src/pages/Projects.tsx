import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ProjectDto } from '@outbreak/shared';
import {
  createFolder,
  createProject,
  fetchFolders,
  fetchProjects,
  fetchTags,
  fetchUsers,
} from '../api/queries.js';
import { useAuth } from '../auth/AuthContext.js';
import { Badge, Button, Card, Field, Modal, Select, inputClass } from '../components/ui.js';
import { formatMinutes } from '../lib/format.js';

export function ProjectsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const queryClient = useQueryClient();

  const [folderFilter, setFolderFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [showCreateFolder, setShowCreateFolder] = useState(false);

  const { data: folderData } = useQuery({ queryKey: ['folders'], queryFn: fetchFolders });
  const { data: tagData } = useQuery({ queryKey: ['tags'], queryFn: fetchTags });
  const { data: userData } = useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
    enabled: isAdmin,
  });

  const { data: projectData, isLoading } = useQuery({
    queryKey: [
      'projects',
      { folder: folderFilter, status: statusFilter, search },
    ],
    queryFn: () =>
      fetchProjects({
        folderId: folderFilter || undefined,
        status: statusFilter || undefined,
        search: search || undefined,
      }),
  });

  const byFolder = useMemo(() => {
    const m = new Map<string, ProjectDto[]>();
    for (const p of projectData?.projects ?? []) {
      const arr = m.get(p.folderId) ?? [];
      arr.push(p);
      m.set(p.folderId, arr);
    }
    return m;
  }, [projectData]);

  const folders = folderData?.folders ?? [];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Projects</h1>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowCreateFolder(true)}>
              + Folder
            </Button>
            <Button onClick={() => setShowCreateProject(true)}>+ New project</Button>
          </div>
        )}
      </div>

      {/* Filters */}
      <Card className="mb-4 flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[180px]">
          <Field label="Folder">
            <Select
              value={folderFilter}
              onChange={setFolderFilter}
              placeholder="All folders"
              options={[
                { value: '', label: 'All folders' },
                ...folders.map((f) => ({ value: f.id, label: f.name })),
              ]}
            />
          </Field>
        </div>
        <div className="min-w-[180px]">
          <Field label="Status">
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              placeholder="Any status"
              options={[
                { value: '', label: 'Any status' },
                { value: 'NOT_STARTED', label: 'Not started' },
                { value: 'IN_PROGRESS', label: 'In progress' },
                { value: 'BLOCKED', label: 'Blocked' },
                { value: 'COMPLETE', label: 'Complete' },
                { value: 'ARCHIVED', label: 'Archived' },
              ]}
            />
          </Field>
        </div>
        <div className="min-w-[200px] flex-1">
          <Field label="Search">
            <input
              className={inputClass}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or description…"
            />
          </Field>
        </div>
      </Card>

      {isLoading && <div className="text-sm text-ink-200">Loading…</div>}

      <div className="space-y-6">
        {folders
          .filter((f) => !folderFilter || f.id === folderFilter)
          .map((folder) => {
            const projects = byFolder.get(folder.id) ?? [];
            if (projects.length === 0 && (search || statusFilter)) return null;
            return (
              <div key={folder.id}>
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: folder.color ?? '#94a3b8' }}
                  />
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-200">
                    {folder.name}
                  </h2>
                  <span className="text-xs text-ink-300">({projects.length})</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {projects.map((p) => (
                    <ProjectCard key={p.id} project={p} />
                  ))}
                  {projects.length === 0 && (
                    <div className="text-sm text-ink-300">No projects.</div>
                  )}
                </div>
              </div>
            );
          })}
      </div>

      {showCreateProject && (
        <CreateProjectModal
          folders={folders}
          tags={tagData?.tags ?? []}
          users={userData?.users ?? []}
          onClose={() => setShowCreateProject(false)}
          onCreated={() => {
            setShowCreateProject(false);
            queryClient.invalidateQueries({ queryKey: ['projects'] });
          }}
        />
      )}
      {showCreateFolder && (
        <CreateFolderModal
          onClose={() => setShowCreateFolder(false)}
          onCreated={() => {
            setShowCreateFolder(false);
            queryClient.invalidateQueries({ queryKey: ['folders'] });
          }}
        />
      )}
    </div>
  );
}

function ProjectCard({ project }: { project: ProjectDto }) {
  const actual = project.actualMinutes ?? 0;
  const estimate = project.estimatedMinutes;
  const pct = estimate === 0 ? 0 : Math.min(100, Math.round((actual / estimate) * 100));
  const over = project.isOverEstimate === true;
  return (
    <Link
      to={`/projects/${project.id}`}
      className="block rounded-lg border border-ink-400 bg-ink-800/60 p-4 shadow-sm transition hover:border-brand-300 hover:shadow"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium">{project.name}</div>
          <div className="mt-0.5 text-xs text-ink-200">
            {formatMinutes(actual)} / {formatMinutes(estimate)}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge tone={statusTone(project.status)}>{statusLabel(project.status)}</Badge>
          {over && <Badge tone="yellow">Over</Badge>}
        </div>
      </div>
      <div className="mt-3 h-1.5 w-full rounded-full bg-ink-700">
        <div
          className={`h-full rounded-full ${over ? 'bg-yellow-500' : 'bg-brand-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </Link>
  );
}

function statusLabel(s: string) {
  return s.replace('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}
function statusTone(s: string): 'slate' | 'yellow' | 'indigo' | 'green' | 'red' {
  switch (s) {
    case 'IN_PROGRESS':
      return 'indigo';
    case 'BLOCKED':
      return 'red';
    case 'COMPLETE':
      return 'green';
    case 'ARCHIVED':
      return 'slate';
    default:
      return 'slate';
  }
}

function CreateProjectModal({
  folders,
  tags,
  users,
  onClose,
  onCreated,
}: {
  folders: { id: string; name: string }[];
  tags: { id: string; name: string }[];
  users: { id: string; name: string; role: string }[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [folderId, setFolderId] = useState(folders[0]?.id ?? '');
  const [estimatedHours, setEstimatedHours] = useState('1');
  const [dueAt, setDueAt] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);

  const mutation = useMutation({
    mutationFn: () =>
      createProject({
        folderId,
        name,
        estimatedMinutes: Math.round(parseFloat(estimatedHours) * 60),
        description: description || undefined,
        dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
        assigneeIds,
        tagIds,
      }),
    onSuccess: onCreated,
  });

  const instructors = users.filter((u) => u.role === 'INSTRUCTOR' || u.role === 'ADMIN');

  return (
    <Modal open onClose={onClose} title="New project">
      <div className="space-y-3">
        <Field label="Name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Folder">
            <Select
              value={folderId}
              onChange={setFolderId}
              options={folders.map((f) => ({ value: f.id, label: f.name }))}
            />
          </Field>
          <Field label="Estimated hours">
            <input
              className={inputClass}
              type="number"
              step="0.25"
              min="0"
              value={estimatedHours}
              onChange={(e) => setEstimatedHours(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Due date (optional)">
          <input
            className={inputClass}
            type="date"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
          />
        </Field>
        <Field label="Assignees">
          <div className="flex flex-wrap gap-1 rounded-md border border-ink-400 p-2">
            {instructors.map((u) => {
              const on = assigneeIds.includes(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() =>
                    setAssigneeIds((v) =>
                      on ? v.filter((x) => x !== u.id) : [...v, u.id],
                    )
                  }
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    on ? 'bg-brand-600 text-white' : 'bg-ink-700 text-ink-100'
                  }`}
                >
                  {u.name}
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="Tags">
          <div className="flex flex-wrap gap-1 rounded-md border border-ink-400 p-2">
            {tags.length === 0 && <span className="text-xs text-ink-300">No tags.</span>}
            {tags.map((t) => {
              const on = tagIds.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() =>
                    setTagIds((v) => (on ? v.filter((x) => x !== t.id) : [...v, t.id]))
                  }
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    on ? 'bg-indigo-600 text-white' : 'bg-ink-700 text-ink-100'
                  }`}
                >
                  {t.name}
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="Description (markdown)">
          <textarea
            className={inputClass}
            rows={4}
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
          <Button
            onClick={() => mutation.mutate()}
            disabled={!name || !folderId || mutation.isPending}
          >
            Create
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function CreateFolderModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#6366f1');
  const mutation = useMutation({
    mutationFn: () => createFolder({ name, color }),
    onSuccess: onCreated,
  });
  return (
    <Modal open onClose={onClose} title="New folder">
      <div className="space-y-3">
        <Field label="Name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Color">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </Field>
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
