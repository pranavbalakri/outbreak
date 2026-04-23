import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NotificationDto } from '@outbreak/shared';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../api/queries.js';

function formatKind(n: NotificationDto): string {
  const p = n.payload as Record<string, unknown>;
  switch (n.kind) {
    case 'project.assigned':
      return `Assigned to project: ${String(p.projectName ?? p.projectId ?? 'Unknown')}`;
    case 'project.overdue':
      return `Project overdue: ${String(p.projectName ?? p.projectId ?? 'Unknown')}`;
    case 'week.locked':
      return `Week locked: ${String(p.isoYear)}-W${String(p.isoWeek).padStart(2, '0')}`;
    default:
      return n.kind;
  }
}

export function NotificationBell() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const notifQ = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetchNotifications({ limit: 20 }),
    // Light polling — a WebSocket channel is planned, but this keeps the bell honest in the meantime.
    refetchInterval: 30_000,
  });

  const markOneM = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const markAllM = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const unread = notifQ.data?.unreadCount ?? 0;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
        aria-label={`Notifications (${unread} unread)`}
      >
        <span aria-hidden className="text-lg">
          🔔
        </span>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
            <div className="text-sm font-semibold">Notifications</div>
            {unread > 0 && (
              <button
                onClick={() => markAllM.mutate()}
                className="text-xs text-brand-600 hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifQ.data?.notifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-slate-400">
                No notifications yet.
              </div>
            ) : (
              notifQ.data?.notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    if (!n.readAt) markOneM.mutate(n.id);
                  }}
                  className={`w-full border-b border-slate-100 px-4 py-3 text-left last:border-none hover:bg-slate-50 ${
                    n.readAt ? 'opacity-60' : ''
                  }`}
                >
                  <div className="text-sm">{formatKind(n)}</div>
                  <div className="mt-0.5 text-xs text-slate-400">
                    {new Date(n.createdAt).toLocaleString()}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
