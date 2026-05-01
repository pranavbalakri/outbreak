// Dev: open a WS connection using a session cookie and print every message.
// Usage:  tsx scripts/ws-listener.ts <session-token>
import WebSocket from 'ws';

const token = process.argv[2];
if (!token) {
  console.error('usage: tsx scripts/ws-listener.ts <session-token>');
  process.exit(1);
}

const url = process.env['WS_URL'] ?? 'ws://localhost:4000/ws';
const ws = new WebSocket(url, {
  headers: { Cookie: `breaklog_session=${token}` },
});

ws.on('open', () => console.error('[ws] open'));
ws.on('message', (data) => {
  process.stdout.write(data.toString() + '\n');
});
ws.on('close', (code) => {
  console.error('[ws] close', code);
  process.exit(0);
});
ws.on('error', (err) => {
  console.error('[ws] error', err.message);
  process.exit(1);
});
