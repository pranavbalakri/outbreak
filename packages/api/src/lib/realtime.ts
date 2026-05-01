import type { WebSocket } from 'ws';
import type { TimerEvent } from '@breaklog/shared';

// In-process fan-out. Fine for a single API instance; swap for Redis pub/sub
// the moment we run more than one.
const sockets = new Map<string, Set<WebSocket>>();

export function registerSocket(userId: string, socket: WebSocket): void {
  let set = sockets.get(userId);
  if (!set) {
    set = new Set();
    sockets.set(userId, set);
  }
  set.add(socket);

  const cleanup = () => {
    const current = sockets.get(userId);
    if (!current) return;
    current.delete(socket);
    if (current.size === 0) sockets.delete(userId);
  };
  socket.on('close', cleanup);
  socket.on('error', cleanup);
}

export function broadcastToUser(userId: string, event: TimerEvent): void {
  const set = sockets.get(userId);
  if (!set) return;
  const payload = JSON.stringify(event);
  for (const socket of set) {
    try {
      socket.send(payload);
    } catch {
      // Ignore broken sockets; close handler will clean up.
    }
  }
}

export function socketCountForUser(userId: string): number {
  return sockets.get(userId)?.size ?? 0;
}
