import { useEffect, useMemo, useRef, useState } from 'react';
import type { FolderDto, ProjectDto } from '@outbreak/shared';

interface FolderNode {
  folder: FolderDto;
  children: FolderNode[];
  projects: ProjectDto[];
}

function buildTree(folders: FolderDto[], projects: ProjectDto[]): {
  roots: FolderNode[];
  orphans: ProjectDto[];
} {
  const byId = new Map<string, FolderNode>();
  for (const f of folders) {
    if (f.archivedAt) continue;
    byId.set(f.id, { folder: f, children: [], projects: [] });
  }
  const roots: FolderNode[] = [];
  for (const n of byId.values()) {
    const pid = n.folder.parentFolderId;
    if (pid && byId.has(pid)) byId.get(pid)!.children.push(n);
    else roots.push(n);
  }
  const orphans: ProjectDto[] = [];
  for (const p of projects) {
    const n = byId.get(p.folderId);
    if (n) n.projects.push(p);
    else orphans.push(p);
  }
  const sort = (n: FolderNode) => {
    n.children.sort((a, b) => a.folder.name.localeCompare(b.folder.name));
    n.projects.sort((a, b) => a.name.localeCompare(b.name));
    n.children.forEach(sort);
  };
  roots.sort((a, b) => a.folder.name.localeCompare(b.folder.name));
  roots.forEach(sort);
  return { roots, orphans };
}

function filterTree(nodes: FolderNode[], q: string): FolderNode[] {
  const query = q.toLowerCase();
  const walk = (n: FolderNode): FolderNode | null => {
    const matchFolder = n.folder.name.toLowerCase().includes(query);
    const projects = n.projects.filter(
      (p) => matchFolder || p.name.toLowerCase().includes(query),
    );
    const children = n.children
      .map(walk)
      .filter((c): c is FolderNode => c !== null);
    if (!matchFolder && projects.length === 0 && children.length === 0) return null;
    return { folder: n.folder, children, projects };
  };
  return nodes.map(walk).filter((n): n is FolderNode => n !== null);
}

export function ProjectPicker({
  value,
  onChange,
  folders,
  projects,
  disabled,
  mruProjectId,
}: {
  value: string | null;
  onChange: (projectId: string | null) => void;
  folders: FolderDto[];
  projects: ProjectDto[];
  disabled?: boolean;
  mruProjectId?: string | null | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const projectById = useMemo(() => {
    const m = new Map<string, ProjectDto>();
    for (const p of projects) m.set(p.id, p);
    return m;
  }, [projects]);

  const currentLabel = value
    ? (projectById.get(value)?.name ?? 'Project')
    : 'No project';

  const { roots, orphans } = useMemo(
    () => buildTree(folders, projects),
    [folders, projects],
  );

  const { filteredRoots, filteredOrphans } = useMemo(() => {
    if (!query.trim()) return { filteredRoots: roots, filteredOrphans: orphans };
    const q = query.trim();
    return {
      filteredRoots: filterTree(roots, q),
      filteredOrphans: orphans.filter((p) =>
        p.name.toLowerCase().includes(q.toLowerCase()),
      ),
    };
  }, [roots, orphans, query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setTimeout(() => inputRef.current?.focus(), 0);
    const onClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (projectId: string | null) => {
    onChange(projectId);
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-ink-400 bg-ink-800 px-2.5 py-1.5 text-left text-sm text-ink-100 transition-colors hover:border-ink-300 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/40 disabled:opacity-50"
      >
        <span className={`truncate ${!value ? 'text-ink-200' : ''}`}>
          {currentLabel}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 20 20"
          fill="none"
          className={`shrink-0 text-ink-300 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="m6 8 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          style={{ backgroundColor: '#101114' }}
          className="absolute left-0 right-0 z-50 mt-1 flex max-h-72 flex-col rounded-md border border-ink-400 shadow-lg"
        >
          <div className="border-b border-ink-400 p-1.5">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="w-full rounded-md border border-ink-400 bg-ink-900 px-2 py-1 text-sm text-ink-100 placeholder:text-ink-300 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/40"
            />
          </div>
          <div className="overflow-y-auto py-1">
            <Row
              label="No project"
              color={null}
              selected={!value}
              onClick={() => pick(null)}
              depth={0}
              mru={false}
            />
            {filteredRoots.map((n) => (
              <Branch
                key={n.folder.id}
                node={n}
                value={value}
                onPick={pick}
                depth={0}
                mruProjectId={mruProjectId ?? null}
              />
            ))}
            {filteredOrphans.length > 0 && (
              <>
                <Header label="Other" depth={0} />
                {filteredOrphans.map((p) => (
                  <Row
                    key={p.id}
                    label={p.name}
                    color={folders.find((f) => f.id === p.folderId)?.color ?? null}
                    selected={value === p.id}
                    onClick={() => pick(p.id)}
                    depth={1}
                    mru={mruProjectId === p.id}
                  />
                ))}
              </>
            )}
            {filteredRoots.length === 0 && filteredOrphans.length === 0 && (
              <div className="px-3 py-3 text-center text-xs text-ink-300">
                No matches
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Branch({
  node,
  value,
  onPick,
  depth,
  mruProjectId,
}: {
  node: FolderNode;
  value: string | null;
  onPick: (id: string | null) => void;
  depth: number;
  mruProjectId: string | null;
}) {
  return (
    <div>
      <Header label={node.folder.name} depth={depth} />
      {node.projects.map((p) => (
        <Row
          key={p.id}
          label={p.name}
          color={node.folder.color ?? null}
          selected={value === p.id}
          onClick={() => onPick(p.id)}
          depth={depth + 1}
          mru={mruProjectId === p.id}
        />
      ))}
      {node.children.map((child) => (
        <Branch
          key={child.folder.id}
          node={child}
          value={value}
          onPick={onPick}
          depth={depth + 1}
          mruProjectId={mruProjectId}
        />
      ))}
    </div>
  );
}

function Header({ label, depth }: { label: string; depth: number }) {
  return (
    <div
      className="px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-ink-300"
      style={{ paddingLeft: 10 + depth * 12 }}
    >
      {label}
    </div>
  );
}

function Row({
  label,
  color,
  selected,
  onClick,
  depth,
  mru,
}: {
  label: string;
  color: string | null;
  selected: boolean;
  onClick: () => void;
  depth: number;
  mru: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 py-1.5 pr-3 text-left text-sm transition-colors ${
        selected ? 'bg-ink-700 text-ink-100' : 'text-ink-100 hover:bg-ink-700'
      }`}
      style={{ paddingLeft: 10 + depth * 12 }}
    >
      <span
        className="inline-block h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: color ?? '#3a3e46' }}
      />
      <span className="flex-1 truncate">{label}</span>
      {mru && (
        <span className="rounded-sm border border-brand-500/30 bg-brand-500/10 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wider text-brand-300">
          recent
        </span>
      )}
      {selected && (
        <svg width="12" height="12" viewBox="0 0 20 20" className="text-brand-300">
          <path d="m5 10 3 3 7-7" stroke="currentColor" strokeWidth="1.75" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}
