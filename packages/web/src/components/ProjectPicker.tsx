import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { FolderDto, ProjectDto } from '@outbreak/shared';

export interface ProjectPickerProps {
  /** Selected project id, or null / empty for "no project". */
  value: string | null;
  onChange: (projectId: string | null) => void;
  folders: FolderDto[];
  projects: ProjectDto[];
  placeholder?: string;
  disabled?: boolean;
  triggerWidth?: string | number;
  ariaLabel?: string;
  includeNoProject?: boolean;
  /**
   * `default` — bordered form input look (header bar, modals).
   * `inline` — minimal text look, no border/bg, for embedding in a row of copy.
   */
  variant?: 'default' | 'inline';
}

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
  for (const node of byId.values()) {
    const pid = node.folder.parentFolderId;
    if (pid && byId.has(pid)) byId.get(pid)!.children.push(node);
    else roots.push(node);
  }
  const orphans: ProjectDto[] = [];
  for (const p of projects) {
    const n = byId.get(p.folderId);
    if (n) n.projects.push(p);
    else orphans.push(p);
  }
  const sortNode = (n: FolderNode) => {
    n.children.sort((a, b) => a.folder.name.localeCompare(b.folder.name));
    n.projects.sort((a, b) => a.name.localeCompare(b.name));
    n.children.forEach(sortNode);
  };
  roots.sort((a, b) => a.folder.name.localeCompare(b.folder.name));
  roots.forEach(sortNode);
  return { roots, orphans };
}

/** Filters a tree to only include projects (and their folder branches) matching `query`. */
function filterTree(
  nodes: FolderNode[],
  query: string,
): { nodes: FolderNode[]; matchCount: number } {
  const q = query.trim().toLowerCase();
  let matchCount = 0;
  const walk = (n: FolderNode): FolderNode | null => {
    const matchedFolder = n.folder.name.toLowerCase().includes(q);
    const projects = n.projects.filter(
      (p) => matchedFolder || p.name.toLowerCase().includes(q),
    );
    const children = n.children
      .map(walk)
      .filter((c): c is FolderNode => c !== null);
    if (!matchedFolder && projects.length === 0 && children.length === 0) return null;
    matchCount += projects.length;
    return { folder: n.folder, children, projects };
  };
  const filtered = nodes
    .map(walk)
    .filter((n): n is FolderNode => n !== null);
  return { nodes: filtered, matchCount };
}

export function ProjectPicker({
  value,
  onChange,
  folders,
  projects,
  placeholder = 'Select project',
  disabled,
  triggerWidth,
  ariaLabel,
  includeNoProject = true,
  variant = 'default',
}: ProjectPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);

  const projectById = useMemo(() => {
    const m = new Map<string, ProjectDto>();
    for (const p of projects) m.set(p.id, p);
    return m;
  }, [projects]);

  const currentLabel = value
    ? (projectById.get(value)?.name ?? 'Project')
    : includeNoProject
      ? 'No project'
      : placeholder;

  const { roots, orphans } = useMemo(
    () => buildTree(folders, projects),
    [folders, projects],
  );

  const { filteredRoots, filteredOrphans } = useMemo(() => {
    if (!query.trim()) return { filteredRoots: roots, filteredOrphans: orphans };
    const { nodes } = filterTree(roots, query);
    const q = query.trim().toLowerCase();
    const fo = orphans.filter((p) => p.name.toLowerCase().includes(q));
    return { filteredRoots: nodes, filteredOrphans: fo };
  }, [roots, orphans, query]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setRect({ top: r.bottom + 4, left: r.left, width: r.width });
    setQuery('');
    // Focus the search input after the menu opens.
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        !triggerRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  const pick = (projectId: string | null) => {
    onChange(projectId);
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => !disabled && setOpen((v) => !v)}
        style={triggerWidth !== undefined ? { width: triggerWidth } : undefined}
        className={
          variant === 'inline'
            ? `group inline-flex items-center gap-1 rounded text-left text-sm font-medium transition-colors hover:text-brand-300 focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-500/40 disabled:opacity-50 ${
                value ? 'text-ink-100' : 'text-ink-300'
              }`
            : 'flex items-center justify-between gap-2 rounded-md border border-ink-400 bg-ink-800 px-2.5 py-1.5 text-left text-sm text-ink-100 transition-colors hover:border-ink-300 focus:outline-none focus:ring-1 focus:ring-brand-500/50 focus:border-brand-500 disabled:opacity-50'
        }
      >
        <span className={`truncate ${!value && !includeNoProject ? 'text-ink-300' : ''}`}>
          {currentLabel}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 20 20"
          fill="none"
          className={`shrink-0 transition-transform ${
            variant === 'inline'
              ? 'text-ink-300 opacity-0 group-hover:opacity-100 group-focus:opacity-100'
              : 'text-ink-300'
          } ${open ? 'rotate-180 opacity-100' : ''}`}
        >
          <path d="m6 8 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && rect &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              top: rect.top,
              left: rect.left,
              minWidth: Math.max(rect.width, 260),
              zIndex: 60,
            }}
            className="flex max-h-[60vh] flex-col rounded-md border border-ink-400 bg-ink-800 shadow-xl"
          >
            <div className="border-b border-ink-400 p-2">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search projects or folders…"
                className="w-full rounded-md border border-ink-400 bg-ink-900 px-2.5 py-1.5 text-sm text-ink-100 placeholder:text-ink-300 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/40"
              />
            </div>

            <div className="overflow-y-auto py-1">
              {includeNoProject && (
                <ProjectRow
                  label="No project"
                  color={null}
                  selected={!value}
                  onClick={() => pick(null)}
                  depth={0}
                />
              )}

              {filteredRoots.map((node) => (
                <FolderBranch
                  key={node.folder.id}
                  node={node}
                  value={value}
                  onPick={pick}
                  depth={0}
                />
              ))}

              {filteredOrphans.length > 0 && (
                <>
                  <FolderHeader label="Other" depth={0} />
                  {filteredOrphans.map((p) => (
                    <ProjectRow
                      key={p.id}
                      label={p.name}
                      color={folders.find((f) => f.id === p.folderId)?.color ?? null}
                      selected={value === p.id}
                      onClick={() => pick(p.id)}
                      depth={1}
                    />
                  ))}
                </>
              )}

              {filteredRoots.length === 0 &&
                filteredOrphans.length === 0 &&
                !includeNoProject && (
                  <div className="px-3 py-4 text-center text-sm text-ink-300">
                    No matches
                  </div>
                )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function FolderBranch({
  node,
  value,
  onPick,
  depth,
}: {
  node: FolderNode;
  value: string | null;
  onPick: (id: string | null) => void;
  depth: number;
}) {
  return (
    <div>
      <FolderHeader label={node.folder.name} depth={depth} />
      {node.projects.map((p) => (
        <ProjectRow
          key={p.id}
          label={p.name}
          color={node.folder.color ?? null}
          selected={value === p.id}
          onClick={() => onPick(p.id)}
          depth={depth + 1}
        />
      ))}
      {node.children.map((child) => (
        <FolderBranch
          key={child.folder.id}
          node={child}
          value={value}
          onPick={onPick}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}

function FolderHeader({ label, depth }: { label: string; depth: number }) {
  return (
    <div
      className="px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-ink-300"
      style={{ paddingLeft: 12 + depth * 14 }}
    >
      {label}
    </div>
  );
}

function ProjectRow({
  label,
  color,
  selected,
  onClick,
  depth,
}: {
  label: string;
  color: string | null;
  selected: boolean;
  onClick: () => void;
  depth: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 py-1.5 pr-3 text-left text-sm transition-colors ${
        selected ? 'bg-ink-700 text-ink-100' : 'text-ink-100 hover:bg-ink-700'
      }`}
      style={{ paddingLeft: 12 + depth * 14 }}
    >
      <span
        className="inline-block h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: color ?? '#3a3e46' }}
      />
      <span className="flex-1 truncate">{label}</span>
      {selected && (
        <svg width="14" height="14" viewBox="0 0 20 20" className="text-brand-300">
          <path d="m5 10 3 3 7-7" stroke="currentColor" strokeWidth="1.75" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}
