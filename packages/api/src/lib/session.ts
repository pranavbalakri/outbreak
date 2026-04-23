import { SignJWT, jwtVerify } from 'jose';
import { loadEnv } from '../env.js';

const SESSION_COOKIE = 'outbreak_session';
const SESSION_TTL_SECONDS = 14 * 24 * 60 * 60; // 14 days

export interface SessionPayload {
  sub: string; // user id
  role: 'ADMIN' | 'INSTRUCTOR';
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(loadEnv().JWT_SECRET);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ role: payload.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (typeof payload.sub !== 'string') return null;
    const role = payload['role'];
    if (role !== 'ADMIN' && role !== 'INSTRUCTOR') return null;
    return { sub: payload.sub, role };
  } catch {
    return null;
  }
}

export const SESSION_CONFIG = {
  cookieName: SESSION_COOKIE,
  ttlSeconds: SESSION_TTL_SECONDS,
};
