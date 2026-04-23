import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' }) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-500/60';
  const variants: Record<string, string> = {
    primary:
      'bg-brand-500 text-white hover:bg-brand-400',
    secondary:
      'bg-ink-800 text-ink-100 border border-ink-400 hover:bg-ink-700 hover:border-ink-300',
    ghost:
      'bg-transparent text-ink-100 hover:bg-ink-700',
    danger:
      'bg-transparent text-red-400 border border-ink-400 hover:bg-red-500/10 hover:border-red-500/40',
  };
  return <button {...props} className={`${base} ${variants[variant]} ${className}`} />;
}

export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={`rounded-lg border border-ink-400 bg-ink-800 ${className}`}
    />
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-ink-400 bg-ink-800 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink-400 px-5 py-3">
          <h2 className="text-sm font-semibold text-ink-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-ink-200 transition-colors hover:bg-ink-700 hover:text-ink-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs font-medium text-ink-200">{label}</div>
      {children}
      {hint && <div className="mt-1 text-xs text-ink-300">{hint}</div>}
    </label>
  );
}

export const inputClass =
  'block w-full rounded-md border border-ink-400 bg-ink-900 px-3 py-1.5 text-sm text-ink-100 placeholder:text-ink-300 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/40';

/**
 * Styled dropdown that matches the app theme. Unlike native <select>, the menu
 * itself is React-rendered and portal'd to document.body so it doesn't get
 * clipped by overflow/transform/backdrop-filter ancestors.
 *
 * Keyboard: Arrow Up/Down, Enter, Escape. Click outside to dismiss.
 */
export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
}
export function Select({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  disabled,
  className = '',
  triggerWidth,
  ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  triggerWidth?: string | number;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState<number>(-1);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);

  const currentIndex = options.findIndex((o) => o.value === value);
  const currentLabel = currentIndex >= 0 ? options[currentIndex]!.label : placeholder;

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setRect({ top: r.bottom + 4, left: r.left, width: r.width });
    setHighlight(currentIndex >= 0 ? currentIndex : 0);
  }, [open, currentIndex]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight((h) => Math.min(options.length - 1, h + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight((h) => Math.max(0, h - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (highlight >= 0 && highlight < options.length) {
          onChange(options[highlight]!.value);
          setOpen(false);
          triggerRef.current?.focus();
        }
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
  }, [open, highlight, options, onChange]);

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
        className={`flex items-center justify-between gap-2 rounded-md border border-ink-400 bg-ink-800 px-2.5 py-1.5 text-left text-sm text-ink-100 transition-colors hover:border-ink-300 focus:outline-none focus:ring-1 focus:ring-brand-500/50 focus:border-brand-500 disabled:opacity-50 ${className}`}
      >
        <span className={`truncate ${currentIndex < 0 ? 'text-ink-300' : ''}`}>
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
      {open && rect &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            style={{
              position: 'fixed',
              top: rect.top,
              left: rect.left,
              minWidth: rect.width,
              zIndex: 60,
            }}
            className="max-h-72 overflow-y-auto rounded-md border border-ink-400 bg-ink-800 py-1 shadow-xl"
          >
            {options.length === 0 && (
              <div className="px-3 py-2 text-sm text-ink-300">No options</div>
            )}
            {options.map((opt, i) => {
              const selected = opt.value === value;
              const active = i === highlight;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                    triggerRef.current?.focus();
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
                    active ? 'bg-ink-700 text-ink-100' : 'text-ink-100'
                  }`}
                >
                  <span className="flex-1 truncate">{opt.label}</span>
                  {opt.hint && (
                    <span className="text-xs text-ink-300">{opt.hint}</span>
                  )}
                  {selected && (
                    <svg width="14" height="14" viewBox="0 0 20 20" className="text-brand-300">
                      <path d="m5 10 3 3 7-7" stroke="currentColor" strokeWidth="1.75" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}

export function Badge({
  tone = 'slate',
  children,
}: {
  tone?: 'slate' | 'red' | 'yellow' | 'green' | 'indigo';
  children: ReactNode;
}) {
  const tones = {
    slate: 'bg-ink-700 text-ink-100 border-ink-400',
    red: 'bg-red-500/10 text-red-300 border-red-500/30',
    yellow: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    green: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    indigo: 'bg-brand-500/10 text-brand-300 border-brand-500/30',
  };
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
