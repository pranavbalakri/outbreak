import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  const base =
    'inline-flex items-center justify-center rounded-sm px-3 py-1.5 text-sm font-medium font-mono tracking-wide transition disabled:opacity-40 disabled:cursor-not-allowed';
  const variants = {
    primary:
      'bg-brand-500 text-white hover:bg-brand-400 shadow-[0_0_0_1px_rgba(26,115,255,0.4),0_0_24px_-6px_rgba(26,115,255,0.7)]',
    secondary:
      'bg-transparent text-ink-100 border border-ink-300 hover:border-brand-500 hover:text-brand-200',
    danger:
      'bg-transparent text-red-400 border border-red-500/40 hover:border-red-400 hover:bg-red-500/10',
  };
  return <button {...props} className={`${base} ${variants[variant]} ${className}`} />;
}

export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={`relative rounded-sm border border-ink-400 bg-ink-800/70 backdrop-blur-sm ${className}`}
    />
  );
}

/** Decorative tile with dashed blue border — matches the reference's dotted boxes. */
export function DashTile({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={`relative rounded-sm border border-dashed border-brand-500/40 bg-ink-800/40 ${className}`}
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
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-sm border border-ink-400 bg-ink-800 p-6 shadow-[0_0_0_1px_rgba(26,115,255,0.2),0_20px_80px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="tk text-sm text-ink-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-200 hover:text-ink-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
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
      <div className="tk-sm mb-1.5">{label}</div>
      {children}
      {hint && <div className="mt-1 text-xs text-ink-200">{hint}</div>}
    </label>
  );
}

export const inputClass =
  'block w-full rounded-sm border border-ink-400 bg-ink-900/60 px-3 py-1.5 text-sm text-ink-100 placeholder:text-ink-300 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/40';

export function Badge({
  tone = 'slate',
  children,
}: {
  tone?: 'slate' | 'red' | 'yellow' | 'green' | 'indigo';
  children: ReactNode;
}) {
  const tones = {
    slate: 'bg-ink-600 text-ink-100 border-ink-400',
    red: 'bg-red-500/10 text-red-300 border-red-500/40',
    yellow: 'bg-amber-500/10 text-amber-300 border-amber-500/40',
    green: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40',
    indigo: 'bg-brand-500/10 text-brand-300 border-brand-500/40',
  };
  return (
    <span
      className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
