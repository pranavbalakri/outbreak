import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FolderDto } from '@outbreak/shared';
import {
  createFolder,
  deleteFolder,
  fetchFolders,
  updateFolder,
} from '../api/queries.js';
import { Badge, Button, Card, Field, Modal, Select, inputClass } from './ui.js';
import { useConfirm } from './Confirm.js';

interface FolderNode {
  folder: FolderDto;
  children: FolderNode[];
}

function buildTree(folders: FolderDto[]): FolderNode[] {
  const byId = new Map<string, FolderNode>();
  for (const f of folders) byId.set(f.id, { folder: f, children: [] });
  const roots: FolderNode[] = [];
  for (const n of byId.values()) {
    const pid = n.folder.parentFolderId;
    if (pid && byId.has(pid)) byId.get(pid)!.children.push(n);
    else roots.push(n);
  }
  const sort = (n: FolderNode) => {
    n.children.sort((a, b) => a.folder.name.localeCompare(b.folder.name));
    n.children.forEach(sort);
  };
  roots.sort((a, b) => a.folder.name.localeCompare(b.folder.name));
  roots.forEach(sort);
  return roots;
}

export function FoldersPanel() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const foldersQ = useQuery({ queryKey: ['folders'], queryFn: fetchFolders });

  const [view, setView] = useState<'list' | 'tree'>('list');
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

  const folders = foldersQ.data?.folders ?? [];
  const tree = useMemo(() => buildTree(folders), [folders]);

  const confirmDelete = async (f: FolderDto) => {
    const ok = await confirm({
      title: 'Delete folder',
      message: (
        <>
          Delete <span className="text-ink-100">“{f.name}”</span>? Folders that still
          contain projects can&apos;t be deleted — remove or reassign them first.
        </>
      ),
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) deleteM.mutate(f.id);
  };

  const openEdit = (f: FolderDto) =>
    setSheet({
      id: f.id,
      name: f.name,
      color: f.color ?? '#1a73ff',
      parentFolderId: f.parentFolderId,
    });

  return (
    <Card className="p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink-100">Folders</h2>
        <div className="flex items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-md border border-ink-400">
            <button
              onClick={() => setView('list')}
              className={`px-3 py-1 text-xs transition-colors ${
                view === 'list' ? 'bg-ink-700 text-ink-100' : 'text-ink-200 hover:bg-ink-800'
              }`}
            >
              List
            </button>
            <button
              onClick={() => setView('tree')}
              className={`px-3 py-1 text-xs transition-colors ${
                view === 'tree' ? 'bg-ink-700 text-ink-100' : 'text-ink-200 hover:bg-ink-800'
              }`}
            >
              Tree
            </button>
          </div>
          <Button
            onClick={() =>
              setSheet({ id: null, name: '', color: '#1a73ff', parentFolderId: null })
            }
          >
            New folder
          </Button>
        </div>
      </div>

      {view === 'list' ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-400 text-left text-xs uppercase text-ink-200">
              <th className="py-2">Name</th>
              <th className="py-2">Parent</th>
              <th className="py-2">Color</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {folders.map((f) => {
              const parentName = f.parentFolderId
                ? folders.find((p) => p.id === f.parentFolderId)?.name
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
                  <td className="py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" onClick={() => openEdit(f)}>
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
                      <Button variant="danger" onClick={() => void confirmDelete(f)}>
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {folders.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-sm text-ink-300">
                  No folders yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      ) : (
        <FolderTree nodes={tree} depth={0} onEdit={openEdit} onDelete={confirmDelete} />
      )}

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
                ...folders
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

function FolderTree({
  nodes,
  depth,
  onEdit,
  onDelete,
}: {
  nodes: FolderNode[];
  depth: number;
  onEdit: (f: FolderDto) => void;
  onDelete: (f: FolderDto) => void;
}) {
  if (nodes.length === 0 && depth === 0) {
    return (
      <div className="py-6 text-center text-sm text-ink-300">No folders yet.</div>
    );
  }
  return (
    <ul className="space-y-1">
      {nodes.map((n) => (
        <li key={n.folder.id}>
          <div
            className="group flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-ink-700"
            style={{ paddingLeft: 8 + depth * 18 }}
          >
            <div className="flex min-w-0 items-center gap-2">
              {depth > 0 && (
                <span className="text-ink-300" aria-hidden>
                  └
                </span>
              )}
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: n.folder.color ?? '#3a3e46' }}
              />
              <span className="truncate text-sm">{n.folder.name}</span>
              {n.folder.archivedAt && <Badge tone="slate">Archived</Badge>}
            </div>
            <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                onClick={() => onEdit(n.folder)}
                className="rounded px-2 py-0.5 text-xs text-ink-200 hover:bg-ink-600 hover:text-ink-100"
              >
                Edit
              </button>
              <button
                onClick={() => onDelete(n.folder)}
                className="rounded px-2 py-0.5 text-xs text-red-400 hover:bg-red-500/10"
              >
                Delete
              </button>
            </div>
          </div>
          {n.children.length > 0 && (
            <FolderTree
              nodes={n.children}
              depth={depth + 1}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          )}
        </li>
      ))}
    </ul>
  );
}
