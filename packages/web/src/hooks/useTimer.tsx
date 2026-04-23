import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { TimeEntryDto, TimerEvent } from '@outbreak/shared';
import { fetchCurrentTimer, startTimer, stopTimer } from '../api/queries.js';
import { wsUrl } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';

interface TimerState {
  active: TimeEntryDto | null;
  elapsedSeconds: number;
  start: (input: {
    projectId?: string | null | undefined;
    taskId?: string | null | undefined;
    description?: string | undefined;
  }) => Promise<void>;
  stop: () => Promise<void>;
  refresh: () => Promise<void>;
}

const TimerContext = createContext<TimerState | null>(null);

export function TimerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [active, setActive] = useState<TimeEntryDto | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<number>(0);
  const queryClient = useQueryClient();

  // Tick elapsed while a timer is running.
  useEffect(() => {
    if (!active) {
      setElapsedSeconds(0);
      return;
    }
    const tick = () => {
      const started = new Date(active.startedAt).getTime();
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - started) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [active]);

  const refresh = useCallback(async () => {
    if (!user) {
      setActive(null);
      return;
    }
    const { entry } = await fetchCurrentTimer();
    setActive(entry);
  }, [user]);

  // Initial fetch on login.
  useEffect(() => {
    if (!user) {
      setActive(null);
      return;
    }
    void refresh();
  }, [user, refresh]);

  // WebSocket subscription — keeps state fresh across tabs.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      const ws = new WebSocket(wsUrl('/ws'));
      socketRef.current = ws;

      ws.onopen = () => {
        reconnectRef.current = 0;
      };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as TimerEvent | { type: string };
          if ('type' in data && data.type.startsWith('timer.')) {
            const evt = data as TimerEvent;
            if (evt.type === 'timer.stopped') setActive(null);
            else setActive(evt.entry);
            queryClient.invalidateQueries({ queryKey: ['time-entries'] });
          }
        } catch {
          // ignore malformed frames
        }
      };
      ws.onclose = () => {
        socketRef.current = null;
        if (cancelled) return;
        const delay = Math.min(30_000, 500 * 2 ** reconnectRef.current);
        reconnectRef.current += 1;
        window.setTimeout(connect, delay);
      };
      ws.onerror = () => ws.close();
    };

    connect();
    return () => {
      cancelled = true;
      socketRef.current?.close();
    };
  }, [user, queryClient]);

  const start = useCallback(
    async (input: {
      projectId?: string | null | undefined;
      taskId?: string | null | undefined;
      description?: string | undefined;
    }) => {
      const res = await startTimer({ ...input, source: 'WEB' });
      setActive(res.entry);
      queryClient.invalidateQueries({ queryKey: ['time-entries'] });
    },
    [queryClient],
  );

  const stop = useCallback(async () => {
    await stopTimer();
    setActive(null);
    queryClient.invalidateQueries({ queryKey: ['time-entries'] });
  }, [queryClient]);

  return (
    <TimerContext.Provider value={{ active, elapsedSeconds, start, stop, refresh }}>
      {children}
    </TimerContext.Provider>
  );
}

export function useTimer(): TimerState {
  const ctx = useContext(TimerContext);
  if (!ctx) throw new Error('useTimer must be used inside TimerProvider');
  return ctx;
}

export function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
