import { execSync } from 'node:child_process';
import type { BrowserContext } from '@playwright/test';

const SESSION_COOKIE = 'outbreak_session';
const API_URL = process.env['E2E_API_URL'] ?? 'http://127.0.0.1:4000';

export function mintSession(userId: string): string {
  // Calls the API package's dev script (same TS runtime, same JWT secret).
  const out = execSync(
    `pnpm --filter @outbreak/api exec tsx scripts/mint-dev-session.ts ${userId}`,
    { env: process.env, stdio: ['ignore', 'pipe', 'ignore'] },
  );
  return out.toString().trim();
}

export async function signIn(context: BrowserContext, userId: string): Promise<void> {
  const token = mintSession(userId);
  const webUrl = new URL(process.env['E2E_WEB_URL'] ?? 'http://127.0.0.1:5173');
  const apiUrl = new URL(API_URL);
  await context.addCookies([
    {
      name: SESSION_COOKIE,
      value: token,
      domain: webUrl.hostname,
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
    {
      name: SESSION_COOKIE,
      value: token,
      domain: apiUrl.hostname,
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
  ]);
}

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} must be set to run e2e tests`);
  return v;
}
